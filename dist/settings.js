"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOTION_EVENT_TYPES = exports.DEFAULT_RTSP_PORT = exports.STREAM_TYPE_SUFFIX = exports.DEFAULT_CAMERA_CONFIG = exports.DEFAULT_PLATFORM_CONFIG = exports.DEFAULT_VIDEO_CONFIG = exports.HOMEKIT_MAX_FPS = exports.HOMEKIT_MAX_HEIGHT = exports.HOMEKIT_MAX_WIDTH = exports.PLUGIN_NAME = exports.PLATFORM_NAME = void 0;
/**
 * Platform name - must match pluginAlias in config.schema.json
 */
exports.PLATFORM_NAME = 'HikvisionUltimate';
/**
 * Plugin name - must match name in package.json
 */
exports.PLUGIN_NAME = 'homebridge-hikvision-ultimate';
/**
 * HomeKit maximum constraints
 */
exports.HOMEKIT_MAX_WIDTH = 1920;
exports.HOMEKIT_MAX_HEIGHT = 1080;
exports.HOMEKIT_MAX_FPS = 30;
/**
 * Default values for video configuration
 */
exports.DEFAULT_VIDEO_CONFIG = {
    maxStreams: 2,
    maxWidth: exports.HOMEKIT_MAX_WIDTH,
    maxHeight: exports.HOMEKIT_MAX_HEIGHT,
    maxBitrate: 2000, // 2Mbps for better quality
    minBitrate: 300,
    encoder: 'software',
    audio: true,
    packetSize: 1316,
    mapvideo: undefined, // Let FFmpeg auto-map unless specified
    mapaudio: undefined, // Let FFmpeg auto-map unless specified
    debug: false,
    debugReturn: false,
    vflip: false,
    hflip: false,
};
/**
 * Default platform values
 */
exports.DEFAULT_PLATFORM_CONFIG = {
    port: 80,
    secure: false,
    streamType: 'mainstream',
    probeOnStartup: false,
    probeTimeout: 10000,
    debugMotion: false,
};
/**
 * Default camera values
 */
exports.DEFAULT_CAMERA_CONFIG = {
    motion: true,
    motionTimeout: 1,
    unbridge: false,
    enabled: true,
    manufacturer: 'Hikvision',
    model: 'IP Camera',
};
/**
 * Stream type to RTSP channel suffix mapping
 * Channel format: {channelId}01 for mainstream, {channelId}02 for substream, etc.
 */
exports.STREAM_TYPE_SUFFIX = {
    mainstream: '01',
    substream: '02',
    thirdstream: '03',
};
/**
 * RTSP port (standard)
 */
exports.DEFAULT_RTSP_PORT = 554;
/**
 * Motion event types from ISAPI
 */
exports.MOTION_EVENT_TYPES = [
    'VMD', // Video Motion Detection
    'linedetection', // Line Crossing Detection
    'fielddetection', // Intrusion Detection
    'regionEntrance', // Region Entrance
    'regionExiting', // Region Exiting
    'shelteralarm', // Video Tampering
];
