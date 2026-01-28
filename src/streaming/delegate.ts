import {
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
  HOMEKIT_MAX_FPS,
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

  private determineResolution(request: SnapshotRequest | VideoInfo, _isSnapshot: boolean): ResolutionInfo {
    const resInfo: ResolutionInfo = { width: 0, height: 0 };
    let requestedWidth = request.width;
    let requestedHeight = request.height;
    const maxWidth = Math.min(this.videoConfig.maxWidth || HOMEKIT_MAX_WIDTH, HOMEKIT_MAX_WIDTH);
    const maxHeight = Math.min(this.videoConfig.maxHeight || HOMEKIT_MAX_HEIGHT, HOMEKIT_MAX_HEIGHT);
    if (requestedWidth > maxWidth) requestedWidth = maxWidth;
    if (requestedHeight > maxHeight) requestedHeight = maxHeight;
    resInfo.width = requestedWidth;
    resInfo.height = requestedHeight;

    if (resInfo.width > 0 || resInfo.height > 0) {
      resInfo.resizeFilter = 'scale=' +
        (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
        (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
        ':force_original_aspect_ratio=decrease';
    }

    const filters: string[] = [];
    if (this.videoConfig.hflip) filters.push('hflip');
    if (this.videoConfig.vflip) filters.push('vflip');
    if (resInfo.resizeFilter) filters.push(resInfo.resizeFilter);
    if (this.videoConfig.videoFilter) filters.push(this.videoConfig.videoFilter);
    if (filters.length > 0) resInfo.videoFilter = filters.join(',');

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
    const fps = Math.min(request.video.fps, this.videoConfig.maxFPS || HOMEKIT_MAX_FPS, HOMEKIT_MAX_FPS);

    let bitrate = request.video.max_bit_rate;
    if (this.videoConfig.maxBitrate && bitrate > this.videoConfig.maxBitrate) bitrate = this.videoConfig.maxBitrate;
    if (this.videoConfig.minBitrate && bitrate < this.videoConfig.minBitrate) bitrate = this.videoConfig.minBitrate;

    this.log.info(`Starting stream: ${resolution.width}x${resolution.height}@${fps}fps ${bitrate}kbps`, this.cameraConfig.name);

    const source = this.videoConfig.source;
    if (!source) {
      this.log.error('No source configured', this.cameraConfig.name);
      callback(new Error('No source configured'));
      return;
    }

    const ffmpegArgs = this.buildFfmpegArgs(source, sessionInfo, resolution, fps, bitrate, request);
    this.log.debug(`FFmpeg command: ${this.videoProcessor} ${ffmpegArgs.join(' ')}`, this.cameraConfig.name);

    const ffmpeg = spawn(this.videoProcessor, ffmpegArgs, { env: process.env });
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

  private buildFfmpegArgs(source: string, sessionInfo: SessionInfo, resolution: ResolutionInfo, fps: number, bitrate: number, request: StreamingRequest): string[] {
    const args: string[] = ['-hide_banner', '-loglevel', this.videoConfig.debug ? 'verbose' : 'warning'];
    
    // Add hardware decoder flags BEFORE the source (-i)
    if (this.videoConfig.decoderFlags) {
      args.push(...this.videoConfig.decoderFlags.split(/\s+/));
    }
    
    args.push(...source.split(/\s+/));
    args.push('-an', '-sn');

    if (resolution.videoFilter) args.push('-vf', resolution.videoFilter);

    const vcodec = this.videoConfig.vcodec || 'libx264';
    args.push('-vcodec', vcodec);

    if (vcodec !== 'copy') {
      args.push('-pix_fmt', 'yuv420p', '-r', String(fps), '-b:v', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`, '-maxrate', `${bitrate}k`);
      if (vcodec === 'libx264' || vcodec.includes('264')) {
        args.push('-profile:v', 'main', '-level:v', '4.0');
      }
      if (this.videoConfig.additionalCommandline) {
        args.push(...this.videoConfig.additionalCommandline.split(/\s+/));
      }
    }

    // Type guard to ensure we have video info with pt
    if (!('video' in request)) {
      throw new Error('No video info in request');
    }
    
    const video = request.video;
    if (!('pt' in video)) {
      throw new Error('No payload type in video info');
    }

    args.push('-payload_type', String(video.pt), '-ssrc', String(sessionInfo.videoSSRC), '-f', 'rtp');

    const videoSrtpKey = sessionInfo.videoSRTP.toString('base64');
    args.push('-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80', '-srtp_out_params', videoSrtpKey);

    const target = sessionInfo.ipv6
      ? `srtp://[${sessionInfo.address}]:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&pkt_size=${this.videoConfig.packetSize || 1316}`
      : `srtp://${sessionInfo.address}:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&pkt_size=${this.videoConfig.packetSize || 1316}`;
    args.push(target);

    return args;
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
