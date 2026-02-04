/**
 * Platform name - must match pluginAlias in config.schema.json
 */
export declare const PLATFORM_NAME = "HikvisionUltimate";
/**
 * Plugin name - must match name in package.json
 */
export declare const PLUGIN_NAME = "homebridge-hikvision-ultimate";
/**
 * HomeKit maximum constraints
 */
export declare const HOMEKIT_MAX_WIDTH = 1920;
export declare const HOMEKIT_MAX_HEIGHT = 1080;
export declare const HOMEKIT_MAX_FPS = 30;
/**
 * Default values for video configuration
 */
export declare const DEFAULT_VIDEO_CONFIG: {
    maxStreams: number;
    maxWidth: number;
    maxHeight: number;
    maxBitrate: number;
    minBitrate: number;
    encoder: "software";
    audio: boolean;
    packetSize: number;
    mapvideo: undefined;
    mapaudio: undefined;
    debug: boolean;
    debugReturn: boolean;
    vflip: boolean;
    hflip: boolean;
};
/**
 * Default platform values
 */
export declare const DEFAULT_PLATFORM_CONFIG: {
    port: number;
    secure: boolean;
    streamType: "mainstream";
    probeOnStartup: boolean;
    probeTimeout: number;
    debugMotion: boolean;
};
/**
 * Default camera values
 */
export declare const DEFAULT_CAMERA_CONFIG: {
    motion: boolean;
    motionTimeout: number;
    unbridge: boolean;
    enabled: boolean;
    manufacturer: string;
    model: string;
};
/**
 * Stream type to RTSP channel suffix mapping
 * Channel format: {channelId}01 for mainstream, {channelId}02 for substream, etc.
 */
export declare const STREAM_TYPE_SUFFIX: {
    mainstream: string;
    substream: string;
    thirdstream: string;
};
/**
 * RTSP port (standard)
 */
export declare const DEFAULT_RTSP_PORT = 554;
/**
 * Motion event types from ISAPI
 */
export declare const MOTION_EVENT_TYPES: string[];
