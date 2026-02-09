import { spawn, ChildProcess } from 'child_process';
import {
  API,
  CameraRecordingDelegate,
  CameraRecordingConfiguration,
  HAP,
  HDSProtocolSpecificErrorReason,
  RecordingPacket,
  AudioRecordingCodecType,
  H264Level,
  H264Profile,
  Logger,
} from 'homebridge';
import { VideoConfig } from '../configTypes';
import { PreBuffer, Mp4Session } from './prebuffer';
import { readLength, MP4Atom } from './hksvHelpers';

/**
 * RecordingDelegate handles HomeKit Secure Video (HKSV) recording
 * Implements the CameraRecordingDelegate interface from HAP-NodeJS
 */
export class RecordingDelegate implements CameraRecordingDelegate {
  private readonly log: Logger;
  private readonly cameraName: string;
  private readonly videoConfig: VideoConfig;
  private readonly videoProcessor: string;
  private process?: ChildProcess;

  private preBufferSession?: Mp4Session;
  private preBuffer?: PreBuffer;

  private currentRecordingConfiguration?: CameraRecordingConfiguration;
  private activeFFmpegProcesses = new Map<number, ChildProcess>();
  private streamAbortControllers = new Map<number, AbortController>();

  constructor(
    log: Logger,
    cameraName: string,
    videoConfig: VideoConfig,
    api: API,
    _hap: HAP,
    videoProcessor: string,
  ) {
    this.log = log;
    this.cameraName = cameraName;
    this.videoConfig = videoConfig;
    this.videoProcessor = videoProcessor;

    // Cleanup on shutdown
    api.on('shutdown' as any, () => {
      if (this.preBufferSession) {
        this.preBufferSession.process?.kill();
        this.preBufferSession.server?.close();
      }

      this.activeFFmpegProcesses.forEach((process, streamId) => {
        if (!process.killed) {
          this.log.debug(`[HKSV] Shutdown: Terminating FFmpeg for stream ${streamId}`, this.cameraName);
          process.kill('SIGTERM');
        }
      });
      this.activeFFmpegProcesses.clear();
      this.streamAbortControllers.clear();
    });
  }

  /**
   * Called when user enables/disables recording in Home app
   */
  async updateRecordingActive(active: boolean): Promise<void> {
    this.log.info(`[HKSV] Recording ${active ? 'enabled' : 'disabled'}`, this.cameraName);
    return Promise.resolve();
  }

  /**
   * Called when HomeKit selects a recording configuration
   * Configuration includes resolution, bitrate, framerate, audio codec
   */
  async updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): Promise<void> {
    this.log.info('[HKSV] Recording configuration updated', this.cameraName);
    this.currentRecordingConfiguration = configuration;
    return Promise.resolve();
  }

  /**
   * Main method: Called when motion is detected
   * Must yield MP4 fragments to HomeKit
   */
  async *handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket, any, any> {
    this.log.info(`[HKSV] Recording stream request received for stream ${streamId}`, this.cameraName);

    if (!this.currentRecordingConfiguration) {
      this.log.error('[HKSV] No recording configuration available', this.cameraName);
      return;
    }

    // Start prebuffer if enabled
    if (this.videoConfig.prebuffer) {
      this.log.debug('[HKSV] Prebuffer enabled, ensuring prebuffer is started', this.cameraName);
      try {
        await this.startPreBuffer();
        this.log.debug('[HKSV] Prebuffer initialization completed', this.cameraName);
      } catch (error) {
        this.log.error(`[HKSV] Failed to start prebuffer: ${error}`, this.cameraName);
      }
    }

    // Create abort controller for this stream
    const abortController = new AbortController();
    this.streamAbortControllers.set(streamId, abortController);

    try {
      const fragmentGenerator = this.handleFragmentsRequests(this.currentRecordingConfiguration, streamId);

      let fragmentCount = 0;
      let totalBytes = 0;

      for await (const fragmentBuffer of fragmentGenerator) {
        if (abortController.signal.aborted) {
          this.log.debug(`[HKSV] Recording stream ${streamId} aborted`, this.cameraName);
          break;
        }

        fragmentCount++;
        totalBytes += fragmentBuffer.length;

        this.log.debug(
          `[HKSV] Fragment #${fragmentCount}, size: ${fragmentBuffer.length}B, total: ${totalBytes}B`,
          this.cameraName,
        );

        yield {
          data: fragmentBuffer,
          isLast: false,
        };
      }

      this.log.info(
        `[HKSV] Recording stream ${streamId} completed. Fragments: ${fragmentCount}, bytes: ${totalBytes}`,
        this.cameraName,
      );
    } catch (error) {
      this.log.error(`[HKSV] Recording stream error: ${error}`, this.cameraName);
      yield {
        data: Buffer.alloc(0),
        isLast: true,
      };
    } finally {
      this.streamAbortControllers.delete(streamId);
      this.log.debug(`[HKSV] Recording stream ${streamId} generator finished`, this.cameraName);
    }
  }

  /**
   * Called when recording stops
   * Reason codes indicate why (normal, error, format incompatibility, etc.)
   */
  closeRecordingStream(streamId: number, reason: HDSProtocolSpecificErrorReason | undefined): void {
    this.log.info(`[HKSV] Recording stream closed for stream ${streamId}, reason: ${reason}`, this.cameraName);

    // Enhanced reason code diagnostics
    switch (reason) {
      case 0:
        this.log.info('✅ [HKSV] Recording ended normally', this.cameraName);
        break;
      case 1:
        this.log.warn('⚠️ [HKSV] Recording ended due to generic error', this.cameraName);
        break;
      case 2:
        this.log.warn('⚠️ [HKSV] Recording ended due to network issues', this.cameraName);
        break;
      case 3:
        this.log.warn('⚠️ [HKSV] Recording ended due to insufficient resources', this.cameraName);
        break;
      case 4:
        this.log.warn('⚠️ [HKSV] Recording ended due to HomeKit busy', this.cameraName);
        break;
      case 5:
        this.log.warn('⚠️ [HKSV] Recording ended due to insufficient buffer space', this.cameraName);
        break;
      case 6:
        this.log.warn(
          '❌ [HKSV] Recording ended due to STREAM FORMAT INCOMPATIBILITY - Check H.264 parameters!',
          this.cameraName,
        );
        break;
      case 7:
        this.log.warn('⚠️ [HKSV] Recording ended due to maximum recording time exceeded', this.cameraName);
        break;
      case 8:
        this.log.warn('⚠️ [HKSV] Recording ended due to HomeKit storage full', this.cameraName);
        break;
      default:
        this.log.warn(`❓ [HKSV] Unknown reason ${reason}`, this.cameraName);
    }

    // Abort the stream generator
    const abortController = this.streamAbortControllers.get(streamId);
    if (abortController) {
      abortController.abort();
      this.streamAbortControllers.delete(streamId);
    }

    // Kill FFmpeg process
    const process = this.activeFFmpegProcesses.get(streamId);
    if (process && !process.killed) {
      this.log.debug(`[HKSV] Terminating FFmpeg process for stream ${streamId}`, this.cameraName);
      process.kill('SIGTERM');
      this.activeFFmpegProcesses.delete(streamId);
    }
  }

  /**
   * Start prebuffer if enabled
   */
  async startPreBuffer(): Promise<void> {
    this.log.info(`[HKSV] Starting prebuffer, enabled: ${this.videoConfig.prebuffer}`, this.cameraName);
    
    if (this.videoConfig.prebuffer) {
      if (!this.preBuffer) {
        this.preBuffer = new PreBuffer(
          this.log,
          this.videoConfig.source || '',
          this.cameraName,
          this.videoProcessor,
        );
        
        if (!this.preBufferSession) {
          this.preBufferSession = await this.preBuffer.startPreBuffer();
        }
      }
    }
  }

  /**
   * Handle fragmented MP4 generation for HKSV recording
   */
  private async *handleFragmentsRequests(
    configuration: CameraRecordingConfiguration,
    streamId: number,
  ): AsyncGenerator<Buffer, void, unknown> {
    let moofBuffer: Buffer | null = null;
    let fragmentCount = 0;

    this.log.debug('[HKSV] Starting recording request', this.cameraName);

    // Audio codec parameters (if audio enabled)
    const audioArgs: string[] = [
      '-acodec', 'aac',
      '-profile:a', configuration.audioCodec.type === AudioRecordingCodecType.AAC_LC ? 'aac_low' : 'aac_eld',
      '-ar', '32000',
      '-b:a', `${configuration.audioCodec.bitrate}k`,
      '-ac', `${configuration.audioCodec.audioChannels}`,
    ];

    // H.264 profile and level from configuration
    const profile =
      configuration.videoCodec.parameters.profile === H264Profile.HIGH
        ? 'high'
        : configuration.videoCodec.parameters.profile === H264Profile.MAIN
          ? 'main'
          : 'baseline';

    const level =
      configuration.videoCodec.parameters.level === H264Level.LEVEL4_0
        ? '4.0'
        : configuration.videoCodec.parameters.level === H264Level.LEVEL3_2
          ? '3.2'
          : '3.1';

    // HKSV-compatible H.264 parameters for recording
    const videoArgs: string[] = [
      '-an', '-sn', '-dn', // Disable audio/subtitles/data (audio handled separately)
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-profile:v', profile,
      '-level:v', level,
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', `${configuration.videoCodec.parameters.bitRate}k`,
      '-maxrate', `${Math.floor(configuration.videoCodec.parameters.bitRate * 1.2)}k`,
      '-bufsize', `${configuration.videoCodec.parameters.bitRate * 2}k`,
      '-g', '30', // GOP size
      '-keyint_min', '15',
      '-sc_threshold', '0',
      '-force_key_frames', 'expr:gte(t,n_forced*1)',
      '-r', configuration.videoCodec.resolution[2].toString(),
    ];

    // Add audio if configured
    if (configuration.audioCodec) {
      const anIndex = videoArgs.indexOf('-an');
      if (anIndex !== -1) {
        videoArgs.splice(anIndex, 1, ...audioArgs);
        this.log.debug('[HKSV] Enabled audio recording with codec parameters', this.cameraName);
      }
    } else {
      this.log.debug('[HKSV] Audio disabled for recording', this.cameraName);
    }

    // Get input configuration
    const ffmpegInput: string[] = [];
    if (this.videoConfig.prebuffer && this.preBuffer) {
      this.log.debug('[HKSV] Using prebuffer for recording input', this.cameraName);
      const prebufferLength = this.videoConfig.prebufferLength || 4000;
      const input: string[] = await this.preBuffer.getVideo(prebufferLength);
      ffmpegInput.push(...input);
    } else {
      if (!this.videoConfig.source) {
        throw new Error('No video source configured');
      }
      this.log.debug('[HKSV] Using direct source for recording input', this.cameraName);
      ffmpegInput.push(...this.videoConfig.source.trim().split(/\s+/).filter((arg) => arg.length > 0));
    }

    if (ffmpegInput.length === 0) {
      throw new Error('No video source configured for recording');
    }

    // Start FFmpeg session
    let session;
    let cp: ChildProcess;
    let generator: AsyncIterable<MP4Atom>;

    try {
      session = await this.startFFMPegFragmentedMP4Session(this.videoProcessor, ffmpegInput, videoArgs);
      cp = session.cp;
      generator = session.generator;

      this.activeFFmpegProcesses.set(streamId, cp);
      this.log.debug(`[HKSV] FFmpeg process started for stream ${streamId}, PID: ${cp.pid}`, this.cameraName);
    } catch (error) {
      this.log.error(`[HKSV] Failed to start FFmpeg session: ${error}`, this.cameraName);
      throw new Error(`FFmpeg session startup failed: ${error}`);
    }

    let pending: Buffer[] = [];
    let isFirstFragment = true;

    try {
      for await (const box of generator) {
        const { header, type, data } = box;
        pending.push(header, data);

        if (isFirstFragment) {
          if (type === 'moov') {
            const fragment = Buffer.concat(pending);
            pending = [];
            isFirstFragment = false;
            this.log.debug(`[HKSV] Sending initialization segment, size: ${fragment.length}`, this.cameraName);
            yield fragment;
          }
        } else {
          if (type === 'moof') {
            moofBuffer = Buffer.concat([header, data]);
          } else if (type === 'mdat' && moofBuffer) {
            const fragment = Buffer.concat([moofBuffer, header, data]);
            fragmentCount++;
            this.log.debug(`[HKSV] Fragment ${fragmentCount}, size: ${fragment.length}`, this.cameraName);
            yield fragment;
            moofBuffer = null;
          }
        }
      }
    } catch (e) {
      this.log.debug(`[HKSV] Recording completed: ${e}`, this.cameraName);
    } finally {
      // Cleanup
      if (cp && !cp.killed) {
        cp.kill('SIGTERM');
        setTimeout(() => {
          if (!cp.killed) {
            cp.kill('SIGKILL');
          }
        }, 2000);
      }
      this.activeFFmpegProcesses.delete(streamId);
    }
  }

  /**
   * Start FFmpeg process for fragmented MP4 output
   */
  private startFFMPegFragmentedMP4Session(
    ffmpegPath: string,
    ffmpegInput: string[],
    videoOutputArgs: string[],
  ): Promise<{ generator: AsyncIterable<MP4Atom>; cp: ChildProcess }> {
    return new Promise((resolve, reject) => {
      const args: string[] = ['-hide_banner', ...ffmpegInput];

      // Add dummy audio for HKSV compatibility if audio is disabled
      if (this.videoConfig.audio === false) {
        args.push('-f', 'lavfi', '-i', 'anullsrc=cl=mono:r=32000');
      }

      args.push(
        '-f', 'mp4',
        ...videoOutputArgs,
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        'pipe:1',
      );

      // Terminate any previous process
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
      }

      this.process = spawn(ffmpegPath, args, {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const cp = this.process;
      let processKilledIntentionally = false;

      // MP4 generator
      async function* generator() {
        if (!cp.stdout) throw new Error('FFmpeg stdout unavailable');

        while (true) {
          try {
            const header = await readLength(cp.stdout, 8);
            const length = header.readInt32BE(0) - 8;
            const type = header.slice(4).toString();

            if (length < 0 || length > 50 * 1024 * 1024) {
              throw new Error(`Invalid MP4 box: ${length}B for ${type}`);
            }

            const data = await readLength(cp.stdout, length);
            yield { header, length, type, data };
          } catch (error) {
            if (!processKilledIntentionally) throw error;
            break;
          }
        }
      }

      // Stderr handling
      if (cp.stderr) {
        cp.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('error') || output.includes('Error')) {
            this.log.error(`[HKSV] FFmpeg: ${output.trim()}`, this.cameraName);
          }
        });
      }

      cp.on('spawn', () => {
        resolve({ generator: generator(), cp });
      });

      cp.on('error', reject);

      cp.on('exit', (code) => {
        if (code !== 0 && !processKilledIntentionally && code !== 255) {
          this.log.warn(`[HKSV] FFmpeg exited with code ${code}`, this.cameraName);
        }
      });

      // Cleanup handler
      const cleanup = () => {
        processKilledIntentionally = true;
        if (cp && !cp.killed) {
          cp.kill('SIGTERM');
          setTimeout(() => {
            if (!cp.killed) {
              cp.kill('SIGKILL');
            }
          }, 2000);
        }
      };

      (cp as any).cleanup = cleanup;
    });
  }
}
