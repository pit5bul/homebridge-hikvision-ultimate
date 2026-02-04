import { PlatformConfig } from 'homebridge';
/**
 * Stream type options
 */
export type StreamType = 'mainstream' | 'substream' | 'thirdstream';
/**
 * Platform configuration interface
 */
export interface HikvisionPlatformConfig extends PlatformConfig {
    platform: 'HikvisionUltimate';
    host: string;
    port?: number;
    secure?: boolean;
    username: string;
    password: string;
    forceDiscovery?: boolean;
    streamType?: StreamType;
    probeOnStartup?: boolean;
    probeTimeout?: number;
    videoProcessor?: string;
    interfaceName?: string;
    debugMotion?: boolean;
    cameras?: CameraConfig[];
}
/**
 * Individual camera configuration
 */
export interface CameraConfig {
    channelId: number;
    name: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    firmwareRevision?: string;
    streamType?: StreamType | '';
    motion?: boolean;
    motionTimeout?: number;
    unbridge?: boolean;
    enabled?: boolean;
    videoConfig?: VideoConfig;
    detected?: DetectedStreamInfo;
}
/**
 * Hardware encoder types
 */
export type EncoderType = 'software' | 'vaapi' | 'quicksync' | 'nvenc' | 'amf' | 'videotoolbox' | 'v4l2';
/**
 * Video configuration for a camera
 */
export interface VideoConfig {
    source?: string;
    stillImageSource?: string;
    maxStreams?: number;
    maxWidth?: number;
    maxHeight?: number;
    maxFPS?: number;
    maxBitrate?: number;
    minBitrate?: number;
    vcodec?: string;
    encoder?: EncoderType;
    encoderOptions?: string;
    hwaccelDevice?: string;
    audio?: boolean;
    mapvideo?: string;
    mapaudio?: string;
    videoFilter?: string;
    vflip?: boolean;
    hflip?: boolean;
    packetSize?: number;
    debug?: boolean;
    debugReturn?: boolean;
}
/**
 * Detected stream information from ffprobe
 */
export interface DetectedStreamInfo {
    videoCodec?: string;
    videoProfile?: string;
    width?: number;
    height?: number;
    fps?: number;
    videoBitrate?: number;
    audioCodec?: string;
    audioSampleRate?: number;
    audioChannels?: number;
    probedAt?: string;
}
/**
 * Discovered channel from NVR
 */
export interface DiscoveredChannel {
    id: number;
    name: string;
    inputPort: number;
    enabled: boolean;
    resolutions?: string[];
}
/**
 * ffprobe result structure
 */
export interface FfprobeResult {
    streams?: FfprobeStream[];
    format?: FfprobeFormat;
}
export interface FfprobeStream {
    index: number;
    codec_name?: string;
    codec_long_name?: string;
    profile?: string;
    codec_type?: 'video' | 'audio' | 'subtitle' | 'data';
    width?: number;
    height?: number;
    coded_width?: number;
    coded_height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
}
export interface FfprobeFormat {
    filename?: string;
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
}
