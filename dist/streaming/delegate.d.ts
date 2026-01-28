import { CameraStreamingDelegate, HAP, Logger, PrepareStreamCallback, PrepareStreamRequest, SnapshotRequest, SnapshotRequestCallback, StreamingRequest, StreamRequestCallback } from 'homebridge';
import { CameraConfig } from '../configTypes';
export declare class StreamingDelegate implements CameraStreamingDelegate {
    private readonly cameraConfig;
    private readonly log;
    private readonly hap;
    private readonly videoConfig;
    private readonly videoProcessor;
    private pendingSessions;
    private activeSessions;
    private cachedSnapshot?;
    private cachedSnapshotTime;
    constructor(hap: HAP, cameraConfig: CameraConfig, videoProcessor: string, log: Logger);
    private determineResolution;
    handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void>;
    prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void>;
    handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void;
    private startStream;
    private buildFfmpegArgs;
    private stopStream;
    stopAllStreams(): void;
}
