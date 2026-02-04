/**
 * Platform name - must match pluginAlias in config.schema.json
 */
export const PLATFORM_NAME = 'HikvisionUltimate';

/**
 * Plugin name - must match name in package.json
 */
export const PLUGIN_NAME = 'homebridge-hikvision-ultimate';

/**
 * HomeKit maximum constraints
 */
export const HOMEKIT_MAX_WIDTH = 1920;
export const HOMEKIT_MAX_HEIGHT = 1080;
export const HOMEKIT_MAX_FPS = 30;

/**
 * Default values for video configuration
 */
export const DEFAULT_VIDEO_CONFIG = {
  maxStreams: 2,
  maxWidth: HOMEKIT_MAX_WIDTH,
  maxHeight: HOMEKIT_MAX_HEIGHT,
  maxBitrate: 2000, // 2Mbps for better quality
  minBitrate: 300,
  encoder: 'software' as const,
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
export const DEFAULT_PLATFORM_CONFIG = {
  port: 80,
  secure: false,
  streamType: 'mainstream' as const,
  probeOnStartup: false,
  probeTimeout: 10000,
  debugMotion: false,
};

/**
 * Default camera values
 */
export const DEFAULT_CAMERA_CONFIG = {
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
export const STREAM_TYPE_SUFFIX = {
  mainstream: '01',
  substream: '02',
  thirdstream: '03',
};

/**
 * RTSP port (standard)
 */
export const DEFAULT_RTSP_PORT = 554;

/**
 * Motion event types from ISAPI
 */
export const MOTION_EVENT_TYPES = [
  'VMD',           // Video Motion Detection
  'linedetection', // Line Crossing Detection
  'fielddetection', // Intrusion Detection
  'regionEntrance', // Region Entrance
  'regionExiting',  // Region Exiting
  'shelteralarm',   // Video Tampering
];
