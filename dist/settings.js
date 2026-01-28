"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENCODER_PRESETS = exports.MOTION_EVENT_TYPES = exports.DEFAULT_RTSP_PORT = exports.STREAM_TYPE_SUFFIX = exports.DEFAULT_CAMERA_CONFIG = exports.DEFAULT_PLATFORM_CONFIG = exports.DEFAULT_VIDEO_CONFIG = exports.HOMEKIT_MAX_FPS = exports.HOMEKIT_MAX_HEIGHT = exports.HOMEKIT_MAX_WIDTH = exports.PLUGIN_NAME = exports.PLATFORM_NAME = void 0;
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
    maxFPS: exports.HOMEKIT_MAX_FPS,
    maxBitrate: 2000, // 2Mbps for better quality
    minBitrate: 300,
    vcodec: 'libx264',
    encoder: 'software',
    audio: false,
    acodec: 'libopus', // HomeKit requires H.264 video + Opus audio
    packetSize: 1316,
    mapvideo: '0:0',
    mapaudio: '0:1',
    additionalCommandline: '-preset ultrafast -tune zerolatency',
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
exports.ENCODER_PRESETS = {
    software: {
        vcodec: 'libx264',
        decoderFlags: '',
        encoderFlags: '-preset ultrafast -tune zerolatency -profile:v high -level 4.0',
        description: 'Software encoding (CPU, highest compatibility)',
    },
    // NVIDIA GPU - Uses CUDA for decode/encode pipeline
    nvenc: {
        vcodec: 'h264_nvenc',
        decoderFlags: '-hwaccel cuda -hwaccel_output_format cuda',
        encoderFlags: '-preset p1 -tune ll -rc vbr -cq 23 -b:v 0 -profile:v high -level 4.0',
        videoFilter: 'scale_cuda=w=-2:h=min(ih\\,1080):format=nv12',
        description: 'NVIDIA GPU acceleration (requires CUDA-capable GPU)',
    },
    // Intel QuickSync - Uses QSV for decode/encode
    quicksync: {
        vcodec: 'h264_qsv',
        decoderFlags: '-hwaccel qsv -hwaccel_output_format qsv -init_hw_device qsv=hw',
        encoderFlags: '-preset veryfast -global_quality 23 -look_ahead 1 -profile:v high -level 4.0',
        videoFilter: 'scale_qsv=w=-2:h=min(ih\\,1080):format=nv12',
        description: 'Intel QuickSync acceleration (requires Intel CPU with iGPU)',
    },
    // VAAPI - Intel/AMD GPU on Linux
    vaapi: {
        vcodec: 'h264_vaapi',
        decoderFlags: '-hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi',
        encoderFlags: '-compression_level 1 -quality 4 -profile:v high -level 4.0',
        videoFilter: 'scale_vaapi=w=-2:h=min(ih\\,1080):format=nv12',
        description: 'Intel/AMD GPU acceleration (Linux with VAAPI support)',
    },
    // AMD AMF - Windows only
    amf: {
        vcodec: 'h264_amf',
        decoderFlags: '-hwaccel d3d11va -hwaccel_output_format d3d11',
        encoderFlags: '-quality speed -rc vbr_latency -qp_i 20 -qp_p 20 -profile:v high -level 4.0',
        videoFilter: 'scale=w=-2:h=min(ih\\,1080):format=nv12',
        description: 'AMD GPU acceleration (Windows with AMF support)',
    },
    // Apple VideoToolbox - macOS/iOS
    videotoolbox: {
        vcodec: 'h264_videotoolbox',
        decoderFlags: '-hwaccel videotoolbox',
        encoderFlags: '-profile:v high -level 4.0 -allow_sw 1 -realtime 1',
        videoFilter: 'scale=w=-2:h=min(ih\\,1080):format=nv12',
        description: 'Apple Silicon/Intel Mac acceleration',
    },
    // Raspberry Pi V4L2
    v4l2: {
        vcodec: 'h264_v4l2m2m',
        decoderFlags: '',
        encoderFlags: '-num_output_buffers 32 -num_capture_buffers 16',
        videoFilter: 'scale=w=-2:h=min(ih\\,1080):format=yuv420p',
        description: 'Raspberry Pi hardware acceleration',
    },
};
