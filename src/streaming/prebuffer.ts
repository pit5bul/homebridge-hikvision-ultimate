import { spawn, ChildProcess } from 'child_process';
import { createServer, Server, Socket } from 'net';
import EventEmitter from 'events';
import { Logger } from 'homebridge';
import { listenServer, parseFragmentedMP4, MP4Atom } from './hksvHelpers';

export interface Mp4Session {
  server: Server;
  process: ChildProcess;
}

export interface PrebufferFmp4 {
  atom: MP4Atom;
  time: number;
}

/**
 * Default prebuffer duration in milliseconds
 */
export const DEFAULT_PREBUFFER_DURATION = 15000;

/**
 * PreBuffer class for HKSV
 * Continuously records video to a circular buffer so recordings can include
 * footage from before the motion event was detected
 */
export class PreBuffer {
  prebufferFmp4: PrebufferFmp4[] = [];
  events = new EventEmitter();
  released = false;
  ftyp!: MP4Atom;
  moov!: MP4Atom;
  idrInterval = 0;
  prevIdr = 0;

  private readonly log: Logger;
  private readonly ffmpegInput: string;
  private readonly cameraName: string;
  private readonly ffmpegPath: string;

  constructor(log: Logger, ffmpegInput: string, cameraName: string, videoProcessor: string) {
    this.log = log;
    this.ffmpegInput = ffmpegInput;
    this.cameraName = cameraName;
    this.ffmpegPath = videoProcessor;
  }

  /**
   * Start continuous prebuffering
   */
  async startPreBuffer(prebufferSession?: Mp4Session): Promise<Mp4Session> {
    if (prebufferSession) {
      return prebufferSession;
    }
    
    this.log.debug(`[HKSV] Starting prebuffer for ${this.cameraName}`);
    
    // Use copy codec for prebuffer - no re-encoding needed!
    const vcodec = ['-vcodec', 'copy'];

    const fmp4OutputServer: Server = createServer(async (socket: Socket) => {
      fmp4OutputServer.close();
      const parser = parseFragmentedMP4(socket);
      
      try {
        for await (const atom of parser) {
          const now = Date.now();
          
          // Store initialization segments
          if (!this.ftyp) {
            this.ftyp = atom;
          } else if (!this.moov) {
            this.moov = atom;
          } else {
            // Track IDR interval for debugging
            if (atom.type === 'mdat') {
              if (this.prevIdr) {
                this.idrInterval = now - this.prevIdr;
              }
              this.prevIdr = now;
            }

            // Add to circular buffer
            this.prebufferFmp4.push({
              atom,
              time: now,
            });
          }

          // Evict old fragments (keep last 15 seconds)
          while (this.prebufferFmp4.length && this.prebufferFmp4[0].time < now - DEFAULT_PREBUFFER_DURATION) {
            this.prebufferFmp4.shift();
          }

          this.events.emit('atom', atom);
        }
      } catch (error) {
        this.log.error(`[HKSV] Prebuffer parsing error: ${error}`);
      }
    });
    
    const fmp4Port = await listenServer(fmp4OutputServer, this.log);

    const ffmpegOutput = [
      '-f', 'mp4',
      ...vcodec,
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      `tcp://127.0.0.1:${fmp4Port}`,
    ];

    const args: string[] = [];
    args.push(...this.ffmpegInput.split(' '));
    args.push(...ffmpegOutput);

    this.log.info(`[HKSV] Prebuffer command: ${this.ffmpegPath} ${args.join(' ')}`, this.cameraName);

    const cp = spawn(this.ffmpegPath, args, { 
      env: process.env,
      stdio: 'ignore'
    });

    cp.on('error', (error) => {
      this.log.error(`[HKSV] Prebuffer FFmpeg error: ${error}`, this.cameraName);
    });

    cp.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.log.warn(`[HKSV] Prebuffer FFmpeg exited with code ${code}`, this.cameraName);
      }
    });

    prebufferSession = { server: fmp4OutputServer, process: cp };
    return prebufferSession;
  }

  /**
   * Get prebuffer as FFmpeg input
   * Returns TCP input args that will receive the prebuffer + live stream
   */
  async getVideo(requestedPrebuffer: number): Promise<string[]> {
    const server = createServer((socket: Socket) => {
      server.close();

      const writeAtom = (atom: MP4Atom): void => {
        socket.write(Buffer.concat([atom.header, atom.data]));
      };

      const cleanup = (): void => {
        this.log.debug('[HKSV] Prebuffer request ended', this.cameraName);
        this.events.removeListener('atom', writeAtom);
        this.events.removeListener('killed', cleanup);
        socket.removeAllListeners();
        socket.destroy();
      };

      // Send initialization segments
      if (this.ftyp) {
        writeAtom(this.ftyp);
      }
      if (this.moov) {
        writeAtom(this.moov);
      }

      // Send prebuffered fragments
      const now = Date.now();
      let needMoof = true;
      for (const prebuffer of this.prebufferFmp4) {
        // Skip fragments older than requested duration
        if (prebuffer.time < now - requestedPrebuffer) {
          continue;
        }
        
        // Skip until we find a moof (start of fragment)
        if (needMoof && prebuffer.atom.type !== 'moof') {
          continue;
        }
        needMoof = false;
        
        writeAtom(prebuffer.atom);
      }

      // Continue streaming live fragments
      this.events.on('atom', writeAtom);
      this.events.once('killed', cleanup);

      socket.on('close', cleanup);
      socket.on('error', (error) => {
        this.log.error(`[HKSV] Prebuffer socket error: ${error}`, this.cameraName);
        cleanup();
      });
    });

    const port = await listenServer(server, this.log);
    this.log.debug(`[HKSV] Prebuffer streaming on port ${port}`, this.cameraName);

    return ['-f', 'mp4', '-i', `tcp://127.0.0.1:${port}`];
  }

  /**
   * Stop prebuffering and clean up
   */
  stop(): void {
    this.events.emit('killed');
    this.released = true;
  }
}
