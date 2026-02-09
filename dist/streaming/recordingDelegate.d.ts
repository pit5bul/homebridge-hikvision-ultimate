import { API, CameraRecordingDelegate, CameraRecordingConfiguration, HAP, HDSProtocolSpecificErrorReason, RecordingPacket, Logger } from 'homebridge';
import { VideoConfig } from '../configTypes';
/**
 * RecordingDelegate handles HomeKit Secure Video (HKSV) recording
 * Implements the CameraRecordingDelegate interface from HAP-NodeJS
 */
export declare class RecordingDelegate implements CameraRecordingDelegate {
    private readonly log;
    private readonly cameraName;
    private readonly videoConfig;
    private readonly videoProcessor;
    private process?;
    private preBufferSession?;
    private preBuffer?;
    private currentRecordingConfiguration?;
    private activeFFmpegProcesses;
    private streamAbortControllers;
    constructor(log: Logger, cameraName: string, videoConfig: VideoConfig, api: API, _hap: HAP, videoProcessor: string);
    /**
     * Called when user enables/disables recording in Home app
     */
    updateRecordingActive(active: boolean): Promise<void>;
    /**
     * Called when HomeKit selects a recording configuration
     * Configuration includes resolution, bitrate, framerate, audio codec
     */
    updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): Promise<void>;
    /**
     * Main method: Called when motion is detected
     * Must yield MP4 fragments to HomeKit
     */
    handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket, any, any>;
    /**
     * Called when recording stops
     * Reason codes indicate why (normal, error, format incompatibility, etc.)
     */
    closeRecordingStream(streamId: number, reason: HDSProtocolSpecificErrorReason | undefined): void;
    /**
     * Start prebuffer if enabled
     */
    startPreBuffer(): Promise<void>;
    /**
     * Handle fragmented MP4 generation for HKSV recording
     */
    private handleFragmentsRequests;
    /**
     * Start FFmpeg process for fragmented MP4 output
     */
    private startFFMPegFragmentedMP4Session;
}
