"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreBuffer = exports.DEFAULT_PREBUFFER_DURATION = void 0;
const child_process_1 = require("child_process");
const net_1 = require("net");
const events_1 = __importDefault(require("events"));
const hksvHelpers_1 = require("./hksvHelpers");
/**
 * Default prebuffer duration in milliseconds
 */
exports.DEFAULT_PREBUFFER_DURATION = 15000;
/**
 * PreBuffer class for HKSV
 * Continuously records video to a circular buffer so recordings can include
 * footage from before the motion event was detected
 */
class PreBuffer {
    prebufferFmp4 = [];
    events = new events_1.default();
    released = false;
    ftyp;
    moov;
    idrInterval = 0;
    prevIdr = 0;
    log;
    ffmpegInput;
    cameraName;
    ffmpegPath;
    constructor(log, ffmpegInput, cameraName, videoProcessor) {
        this.log = log;
        this.ffmpegInput = ffmpegInput;
        this.cameraName = cameraName;
        this.ffmpegPath = videoProcessor;
    }
    /**
     * Start continuous prebuffering
     */
    async startPreBuffer(prebufferSession) {
        if (prebufferSession) {
            return prebufferSession;
        }
        this.log.debug(`[HKSV] Starting prebuffer for ${this.cameraName}`);
        // Use copy codec for prebuffer - no re-encoding needed!
        const vcodec = ['-vcodec', 'copy'];
        const fmp4OutputServer = (0, net_1.createServer)(async (socket) => {
            fmp4OutputServer.close();
            const parser = (0, hksvHelpers_1.parseFragmentedMP4)(socket);
            try {
                for await (const atom of parser) {
                    const now = Date.now();
                    // Store initialization segments
                    if (!this.ftyp) {
                        this.ftyp = atom;
                    }
                    else if (!this.moov) {
                        this.moov = atom;
                    }
                    else {
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
                    while (this.prebufferFmp4.length && this.prebufferFmp4[0].time < now - exports.DEFAULT_PREBUFFER_DURATION) {
                        this.prebufferFmp4.shift();
                    }
                    this.events.emit('atom', atom);
                }
            }
            catch (error) {
                this.log.error(`[HKSV] Prebuffer parsing error: ${error}`);
            }
        });
        const fmp4Port = await (0, hksvHelpers_1.listenServer)(fmp4OutputServer, this.log);
        const ffmpegOutput = [
            '-f', 'mp4',
            ...vcodec,
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            `tcp://127.0.0.1:${fmp4Port}`,
        ];
        const args = [];
        args.push(...this.ffmpegInput.split(' '));
        args.push(...ffmpegOutput);
        this.log.info(`[HKSV] Prebuffer command: ${this.ffmpegPath} ${args.join(' ')}`, this.cameraName);
        const cp = (0, child_process_1.spawn)(this.ffmpegPath, args, {
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
    async getVideo(requestedPrebuffer) {
        const server = (0, net_1.createServer)((socket) => {
            server.close();
            const writeAtom = (atom) => {
                socket.write(Buffer.concat([atom.header, atom.data]));
            };
            const cleanup = () => {
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
        const port = await (0, hksvHelpers_1.listenServer)(server, this.log);
        this.log.debug(`[HKSV] Prebuffer streaming on port ${port}`, this.cameraName);
        return ['-f', 'mp4', '-i', `tcp://127.0.0.1:${port}`];
    }
    /**
     * Stop prebuffering and clean up
     */
    stop() {
        this.events.emit('killed');
        this.released = true;
    }
}
exports.PreBuffer = PreBuffer;
