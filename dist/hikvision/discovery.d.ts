import { Logger } from 'homebridge';
import { HikvisionApi } from './api';
import { DiscoveredChannel, StreamType } from '../configTypes';
interface InputProxyChannel {
    id: string;
    name: string;
    inputPort: string;
    sourceInputPortDescriptor?: {
        proxyProtocol?: string;
        model?: string;
        serialNumber?: string;
        manufacturer?: string;
        firmwareVersion?: string;
        macAddress?: string;
    };
}
/**
 * Discover cameras from Hikvision NVR via ISAPI
 */
export declare class HikvisionDiscovery {
    private readonly api;
    private readonly host;
    private readonly username;
    private readonly password;
    private readonly log;
    constructor(api: HikvisionApi, host: string, username: string, password: string, log: Logger);
    /**
     * Get NVR device information
     */
    getDeviceInfo(): Promise<{
        name?: string;
        model?: string;
        serialNumber?: string;
        firmwareVersion?: string;
    }>;
    /**
     * Get camera device info from channel
     */
    getCameraDeviceInfo(channel: InputProxyChannel): {
        manufacturer?: string;
        model?: string;
        serialNumber?: string;
        firmwareVersion?: string;
    };
    /**
     * Discover all input channels from NVR
     */
    discoverChannels(): Promise<DiscoveredChannel[]>;
    /**
     * Build RTSP URL for a channel
     */
    buildRtspUrl(channelId: number, streamType?: StreamType): string;
    /**
     * Build still image URL for a channel
     */
    buildStillImageUrl(channelId: number, streamType?: StreamType): string;
    /**
     * Build FFmpeg source string for a channel
     */
    buildFfmpegSource(channelId: number, streamType?: StreamType): string;
    /**
     * Build FFmpeg still image source string for a channel
     */
    buildFfmpegStillSource(channelId: number, streamType?: StreamType): string;
}
export {};
