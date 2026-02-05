import {
  AudioStreamingCodecType,
  CameraStreamingDelegate,
  HAP,
  Logger,
  PrepareStreamCallback,
  PrepareStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamingRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  VideoInfo,
} from 'homebridge';
import { spawn, ChildProcess } from 'child_process';
import { Socket } from 'dgram';
import { CameraConfig, VideoConfig } from '../configTypes';
import {
  DEFAULT_VIDEO_CONFIG,
  HOMEKIT_MAX_WIDTH,
  HOMEKIT_MAX_HEIGHT,
} from '../settings';
import { pickPort } from 'pick-port';

interface SessionInfo {
  address: string;
  ipv6: boolean;
  videoPort: number;
  videoReturnPort: number;
  videoCryptoSuite: number;
  videoSRTP: Buffer;
  videoSSRC: number;
  audioPort: number;
  audioReturnPort: number;
  audioCryptoSuite: number;
  audioSRTP: Buffer;
  audioSSRC: number;
}

interface ActiveSession {
  sessionInfo: SessionInfo;
  videoProcess?: ChildProcess;
  audioProcess?: ChildProcess;
  returnProcess?: ChildProcess;
  timeout?: NodeJS.Timeout;
  socket?: Socket;
}

interface ResolutionInfo {
  width: number;
  height: number;
  videoFilter?: string;
  resizeFilter?: string;
}

export class StreamingDelegate implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly videoConfig: VideoConfig;
  private readonly videoProcessor: string;
  private pendingSessions: Map<string, SessionInfo> = new Map();
  private activeSessions: Map<string, ActiveSession> = new Map();
  private cachedSnapshot?: Buffer;
  private cachedSnapshotTime = 0;

  constructor(
    hap: HAP,
    private readonly cameraConfig: CameraConfig,
    videoProcessor: string,
    private readonly log: Logger,
  ) {
    this.hap = hap;
    this.videoProcessor = videoProcessor;
    this.videoConfig = { ...DEFAULT_VIDEO_CONFIG, ...cameraConfig.videoConfig };
  }

  private determineResolution(request: SnapshotRequest | VideoInfo, isSnapshot: boolean): ResolutionInfo {
    const resInfo: ResolutionInfo = { width: 0, height: 0 };
    let requestedWidth = request.width;
    let requestedHeight = request.height;
    const maxWidth = Math.min(this.videoConfig.maxWidth || HOMEKIT_MAX_WIDTH, HOMEKIT_MAX_WIDTH);
    const maxHeight = Math.min(this.videoConfig.maxHeight || HOMEKIT_MAX_HEIGHT, HOMEKIT_MAX_HEIGHT);
    if (requestedWidth > maxWidth) requestedWidth = maxWidth;
    if (requestedHeight > maxHeight) requestedHeight = maxHeight;
    resInfo.width = requestedWidth;
    resInfo.height = requestedHeight;

    // Determine if we're using hardware encoder
    const encoder = this.videoConfig.encoder || 'software';
    const useHardwareAccel = encoder !== 'software' && !isSnapshot;

    if (resInfo.width > 0 || resInfo.height > 0) {
      const filters: string[] = [];
      
      // Add flip filters first (work on software or hardware frames)
      if (this.videoConfig.hflip) filters.push('hflip');
      if (this.videoConfig.vflip) filters.push('vflip');
      
      if (useHardwareAccel) {
        // Hardware acceleration path (software decode → hardware encode)
        if (encoder === 'vaapi') {
          // Software decode → VAAPI encode
          // Scale on CPU, convert to NV12, then upload to GPU
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload');
        } else if (encoder === 'amf') {
          // AMF accepts software frames directly (NV12)
          // Just scale and convert to NV12, AMF will upload internally
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
        } else if (encoder === 'quicksync') {
          // Software decode → QuickSync encode
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload=extra_hw_frames=64');
        } else if (encoder === 'nvenc') {
          // Software decode → NVENC encode
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload_cuda');
        }
      } else {
        // Software path
        filters.push('scale=' +
          (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
          (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
          ':force_original_aspect_ratio=decrease');
      }
      
      // Add custom video filter if provided (and not already hardware scale)
      if (this.videoConfig.videoFilter && !this.videoConfig.videoFilter.includes('scale_')) {
        filters.push(this.videoConfig.videoFilter);
      }
      
      if (filters.length > 0) {
        resInfo.videoFilter = filters.join(',');
      }
    }

    return resInfo;
  }

  async handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
    const resolution = this.determineResolution(request, true);
    this.log.debug(`Snapshot request: ${request.width}x${request.height} -> ${resolution.width}x${resolution.height}`, this.cameraConfig.name);

    const now = Date.now();
    if (this.cachedSnapshot && now - this.cachedSnapshotTime < 3000) {
      this.log.debug('Returning cached snapshot', this.cameraConfig.name);
      callback(undefined, this.cachedSnapshot);
      return;
    }

    const source = this.videoConfig.stillImageSource || this.videoConfig.source;
    if (!source) {
      this.log.error('No source configured', this.cameraConfig.name);
      callback(new Error('No source configured'));
      return;
    }

    const ffmpegArgs: string[] = ['-hide_banner', ...source.split(/\s+/), '-frames:v', '1'];
    if (resolution.videoFilter) ffmpegArgs.push('-vf', resolution.videoFilter);
    ffmpegArgs.push('-f', 'image2', '-');

    this.log.debug(`Snapshot command: ${this.videoProcessor} ${ffmpegArgs.join(' ')}`, this.cameraConfig.name);
    const ffmpeg = spawn(this.videoProcessor, ffmpegArgs, { env: process.env });
    const chunks: Buffer[] = [];
    let error = '';

    ffmpeg.stdout.on('data', (data: Buffer) => chunks.push(data));
    ffmpeg.stderr.on('data', (data: Buffer) => { error += data.toString(); });
    ffmpeg.on('error', (err) => { this.log.error(`Snapshot error: ${err.message}`, this.cameraConfig.name); callback(err); });
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        this.log.error(`Snapshot FFmpeg exited with code ${code}`, this.cameraConfig.name);
        if (this.videoConfig.debug) this.log.debug(`FFmpeg stderr: ${error}`, this.cameraConfig.name);
        callback(new Error(`FFmpeg exited with code ${code}`));
        return;
      }
      const snapshot = Buffer.concat(chunks);
      if (snapshot.length === 0) {
        this.log.error('Empty snapshot received', this.cameraConfig.name);
        callback(new Error('Empty snapshot'));
        return;
      }
      this.cachedSnapshot = snapshot;
      this.cachedSnapshotTime = Date.now();
      this.log.debug(`Snapshot captured: ${snapshot.length} bytes`, this.cameraConfig.name);
      callback(undefined, snapshot);
    });

    setTimeout(() => { if (!ffmpeg.killed) { ffmpeg.kill('SIGKILL'); this.log.warn('Snapshot timeout', this.cameraConfig.name); } }, 10000);
  }

  async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
    const ipv6 = request.addressVersion === 'ipv6';
    const videoPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
    const videoReturnPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
    const audioPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
    const audioReturnPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });

    const sessionInfo: SessionInfo = {
      address: request.targetAddress,
      ipv6,
      videoPort: request.video.port,
      videoReturnPort,
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
      videoSSRC: this.hap.CameraController.generateSynchronisationSource(),
      audioPort: request.audio.port,
      audioReturnPort,
      audioCryptoSuite: request.audio.srtpCryptoSuite,
      audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
      audioSSRC: this.hap.CameraController.generateSynchronisationSource(),
    };

    this.pendingSessions.set(request.sessionID, sessionInfo);

    const response = {
      video: { port: videoPort, ssrc: sessionInfo.videoSSRC, srtp_key: request.video.srtp_key, srtp_salt: request.video.srtp_salt },
      audio: { port: audioPort, ssrc: sessionInfo.audioSSRC, srtp_key: request.audio.srtp_key, srtp_salt: request.audio.srtp_salt },
    };

    this.log.debug(`Stream prepared: ${request.targetAddress}:${request.video.port}`, this.cameraConfig.name);
    callback(undefined, response);
  }

  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    switch (request.type) {
      case StreamRequestTypes.START:
        this.startStream(request, callback);
        break;
      case StreamRequestTypes.RECONFIGURE:
        if ('video' in request) {
          this.log.debug(`Reconfigure ignored: ${request.video.width}x${request.video.height}`, this.cameraConfig.name);
        }
        callback();
        break;
      case StreamRequestTypes.STOP:
        this.stopStream(request.sessionID);
        callback();
        break;
    }
  }

  private startStream(request: StreamingRequest, callback: StreamRequestCallback): void {
    const sessionInfo = this.pendingSessions.get(request.sessionID);
    if (!sessionInfo) {
      this.log.error('Session not found', this.cameraConfig.name);
      callback(new Error('Session not found'));
      return;
    }

    this.pendingSessions.delete(request.sessionID);
    
    // Type guard to ensure we have video info
    if (!('video' in request)) {
      this.log.error('No video info in start request', this.cameraConfig.name);
      callback(new Error('Invalid request'));
      return;
    }
    
    const resolution = this.determineResolution(request.video, false);

    let bitrate = request.video.max_bit_rate;
    if (this.videoConfig.maxBitrate && bitrate > this.videoConfig.maxBitrate) bitrate = this.videoConfig.maxBitrate;
    if (this.videoConfig.minBitrate && bitrate < this.videoConfig.minBitrate) bitrate = this.videoConfig.minBitrate;

    this.log.info(`Starting stream: ${resolution.width}x${resolution.height} ${bitrate}kbps`, this.cameraConfig.name);
    
    // Log encoder and pipeline being used
    const encoder = this.videoConfig.encoder || 'software';
    
    // Derive vcodec same way buildFfmpegArgs does
    let vcodec = this.videoConfig.vcodec;
    if (!vcodec) {
      if (encoder === 'vaapi') vcodec = 'h264_vaapi';
      else if (encoder === 'amf') vcodec = 'h264_amf';
      else if (encoder === 'quicksync') vcodec = 'h264_qsv';
      else if (encoder === 'nvenc') vcodec = 'h264_nvenc';
      else if (encoder === 'videotoolbox') vcodec = 'h264_videotoolbox';
      else if (encoder === 'v4l2') vcodec = 'h264_v4l2m2m';
      else vcodec = 'libx264';
    }
    
    if (encoder === 'software') {
      this.log.info(`Video encoder: ${vcodec} (software)`, this.cameraConfig.name);
    } else if (encoder === 'vaapi') {
      this.log.info(`Video encoder: ${vcodec} (VAAPI - CPU decode, GPU scale+encode)`, this.cameraConfig.name);
    } else if (encoder === 'amf') {
      this.log.info(`Video encoder: ${vcodec} (AMF - CPU decode+scale, GPU encode)`, this.cameraConfig.name);
    } else if (encoder === 'quicksync') {
      this.log.info(`Video encoder: ${vcodec} (QuickSync)`, this.cameraConfig.name);
    } else if (encoder === 'nvenc') {
      this.log.info(`Video encoder: ${vcodec} (NVENC)`, this.cameraConfig.name);
    } else {
      this.log.info(`Video encoder: ${vcodec} (${encoder})`, this.cameraConfig.name);
    }

    const source = this.videoConfig.source;
    if (!source) {
      this.log.error('No source configured', this.cameraConfig.name);
      callback(new Error('No source configured'));
      return;
    }

    const ffmpegArgs = this.buildFfmpegArgs(source, sessionInfo, resolution, bitrate, request);
    this.log.debug(`FFmpeg command: ${this.videoProcessor} ${ffmpegArgs}`, this.cameraConfig.name);

    if (this.videoConfig.audio) {
      const audioCodecName = 'audio' in request && request.audio.codec === AudioStreamingCodecType.OPUS ? 'OPUS' : 
                             'audio' in request && request.audio.codec === AudioStreamingCodecType.AAC_ELD ? 'AAC-eld' : 'unknown';
      this.log.info(`Audio enabled: ${audioCodecName}`, this.cameraConfig.name);
    }

    // Split the command string into array for spawn
    const args = ffmpegArgs.split(/\s+/).filter(arg => arg.length > 0);
    const ffmpeg = spawn(this.videoProcessor, args, { env: process.env });
    const activeSession: ActiveSession = { sessionInfo, videoProcess: ffmpeg };
    this.activeSessions.set(request.sessionID, activeSession);

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      if (this.videoConfig.debug) {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.length > 0) this.log.debug(`[FFmpeg] ${line}`, this.cameraConfig.name);
        }
      }
    });

    ffmpeg.on('error', (err) => { this.log.error(`FFmpeg error: ${err.message}`, this.cameraConfig.name); this.stopStream(request.sessionID); });
    ffmpeg.on('close', (code) => { if (code !== 0 && code !== null) this.log.warn(`FFmpeg exited with code ${code}`, this.cameraConfig.name); this.stopStream(request.sessionID); });

    callback();
  }

  private buildFfmpegArgs(source: string, sessionInfo: SessionInfo, resolution: ResolutionInfo, bitrate: number, request: StreamingRequest): string {
    // Build FFmpeg command as a single string, exactly like homebridge-camera-ffmpeg
    const encoder = this.videoConfig.encoder || 'software';
    
    // Derive vcodec from encoder if not explicitly set
    let vcodec = this.videoConfig.vcodec;
    if (!vcodec) {
      // Auto-select vcodec based on encoder
      if (encoder === 'vaapi') vcodec = 'h264_vaapi';
      else if (encoder === 'amf') vcodec = 'h264_amf';
      else if (encoder === 'quicksync') vcodec = 'h264_qsv';
      else if (encoder === 'nvenc') vcodec = 'h264_nvenc';
      else if (encoder === 'videotoolbox') vcodec = 'h264_videotoolbox';
      else if (encoder === 'v4l2') vcodec = 'h264_v4l2m2m';
      else vcodec = 'libx264'; // software default
    }
    
    const mtu = this.videoConfig.packetSize || 1316;
    let encoderOptions = this.videoConfig.encoderOptions;
    
    // Set default encoder options based on actual vcodec being used
    // KEEP MINIMAL - many hardware encoders work best with NO options!
    if (!encoderOptions) {
      if (vcodec === 'libx264') {
        encoderOptions = '-preset ultrafast -tune zerolatency';
      } else if (vcodec === 'h264_vaapi') {
        // VAAPI works best with NO extra options - let it use defaults!
        encoderOptions = '';
      } else if (vcodec === 'h264_amf') {
        // AMF minimal options
        encoderOptions = '-usage transcoding -quality speed';
      } else if (vcodec === 'h264_qsv') {
        encoderOptions = '-preset veryfast';
      } else if (vcodec.includes('nvenc')) {
        encoderOptions = '-preset p1 -tune ll';
      } else {
        // For any other codec, don't add encoder options
        encoderOptions = '';
      }
    }

    // Type guards
    if (!('video' in request)) {
      throw new Error('No video info in request');
    }
    
    // Start building command
    let ffmpegArgs = '';
    
    // Hardware acceleration setup (software decode → hardware encode)
    if (encoder === 'vaapi') {
      // Software decode → VAAPI encode
      const hwDevice = this.videoConfig.hwaccelDevice || '/dev/dri/renderD128';
      ffmpegArgs += `-init_hw_device vaapi=va:${hwDevice} `;
    } else if (encoder === 'quicksync') {
      ffmpegArgs += `-init_hw_device qsv=hw `;
    } else if (encoder === 'nvenc') {
      ffmpegArgs += `-init_hw_device cuda=cu:0 `;
    }
    // AMF doesn't need special init - it accepts software frames
    
    // Add source (includes -i)
    ffmpegArgs += source;

    // Video encoding settings
    const isHardwareEncoder = encoder !== 'software';
    const pixFmt = isHardwareEncoder ? '' : ' -pix_fmt yuv420p'; // Only set for software
    const colorRange = isHardwareEncoder ? ' -color_range mpeg' : ''; // Only for hardware encoders
    
    ffmpegArgs += `${this.videoConfig.mapvideo ? ` -map ${this.videoConfig.mapvideo}` : ' -an -sn -dn'
      } -codec:v ${vcodec
      }${pixFmt
      }${colorRange
      }${resolution.videoFilter ? ` -filter:v ${resolution.videoFilter}` : ''
      }${encoderOptions ? ` ${encoderOptions}` : ''
      }${bitrate > 0 ? ` -b:v ${bitrate}k` : ''
      } -payload_type ${'pt' in request.video ? request.video.pt : 99}`;

    // Video Stream
    ffmpegArgs += ` -ssrc ${sessionInfo.videoSSRC
      } -f rtp`
      + ` -srtp_out_suite AES_CM_128_HMAC_SHA1_80`
      + ` -srtp_out_params ${sessionInfo.videoSRTP.toString('base64')
      } srtp://${sessionInfo.address}:${sessionInfo.videoPort
      }?rtcpport=${sessionInfo.videoPort}&pkt_size=${mtu}`;

    // Audio (if enabled)
    if (this.videoConfig.audio && 'audio' in request) {
      if (request.audio.codec === AudioStreamingCodecType.OPUS || request.audio.codec === AudioStreamingCodecType.AAC_ELD) {
        ffmpegArgs // Audio
          += `${(this.videoConfig.mapaudio ? ` -map ${this.videoConfig.mapaudio}` : ' -vn -sn -dn')
          + (request.audio.codec === AudioStreamingCodecType.OPUS
            ? ' -codec:a libopus'
            + ' -application lowdelay'
            : ' -codec:a libfdk_aac'
              + ' -profile:a aac_eld')
          } -flags +global_header`
          + ` -f null`
          + ` -ar ${request.audio.sample_rate}k`
          + ` -b:a ${request.audio.max_bit_rate}k`
          + ` -ac ${request.audio.channel
          } -payload_type ${'pt' in request.audio ? request.audio.pt : 110}`;

        ffmpegArgs // Audio Stream
          += ` -ssrc ${sessionInfo.audioSSRC
          } -f rtp`
          + ` -srtp_out_suite AES_CM_128_HMAC_SHA1_80`
          + ` -srtp_out_params ${sessionInfo.audioSRTP.toString('base64')
          } srtp://${sessionInfo.address}:${sessionInfo.audioPort
          }?rtcpport=${sessionInfo.audioPort}&pkt_size=188`;
      } else {
        this.log.error(`Unsupported audio codec requested: ${request.audio.codec}`, this.cameraConfig.name);
      }
    }

    ffmpegArgs += ` -loglevel level${this.videoConfig.debug ? '+verbose' : ''
      } -progress pipe:1`;

    return ffmpegArgs;
  }

  private stopStream(sessionID: string): void {
    const session = this.activeSessions.get(sessionID);
    if (!session) return;

    this.log.info('Stopping stream', this.cameraConfig.name);
    if (session.videoProcess) session.videoProcess.kill('SIGKILL');
    if (session.audioProcess) session.audioProcess.kill('SIGKILL');
    if (session.returnProcess) session.returnProcess.kill('SIGKILL');
    if (session.socket) session.socket.close();
    if (session.timeout) clearTimeout(session.timeout);
    this.activeSessions.delete(sessionID);
  }

  stopAllStreams(): void {
    for (const sessionID of this.activeSessions.keys()) {
      this.stopStream(sessionID);
    }
  }
}
