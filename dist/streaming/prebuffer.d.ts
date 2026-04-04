import { ChildProcess } from 'child_process';
import { Server } from 'net';
import EventEmitter from 'events';
import { Logger } from 'homebridge';
import { MP4Atom } from './hksvHelpers';
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
export declare const DEFAULT_PREBUFFER_DURATION = 15000;
/**
 * PreBuffer class for HKSV
 * Continuously records video to a circular buffer so recordings can include
 * footage from before the motion event was detected
 */
export declare class PreBuffer {
    prebufferFmp4: PrebufferFmp4[];
    events: EventEmitter<[never]>;
    released: boolean;
    ftyp: MP4Atom;
    moov: MP4Atom;
    idrInterval: number;
    prevIdr: number;
    private readonly log;
    private readonly ffmpegInput;
    private readonly cameraName;
    private readonly ffmpegPath;
    constructor(log: Logger, ffmpegInput: string, cameraName: string, videoProcessor: string);
    /**
     * Start continuous prebuffering
     */
    startPreBuffer(prebufferSession?: Mp4Session): Promise<Mp4Session>;
    /**
     * Get prebuffer as FFmpeg input
     * Returns TCP input args that will receive the prebuffer + live stream
     */
    getVideo(requestedPrebuffer: number): Promise<string[]>;
    /**
     * Stop prebuffering and clean up
     */
    stop(): void;
}
