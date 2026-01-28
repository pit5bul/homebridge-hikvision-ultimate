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

  // NVR Connection
  host: string;
  port?: number;
  secure?: boolean;
  username: string;
  password: string;

  // Discovery
  forceDiscovery?: boolean;
  streamType?: StreamType;
  probeOnStartup?: boolean;
  probeTimeout?: number;

  // Global Advanced
  videoProcessor?: string;
  interfaceName?: string;
  debugMotion?: boolean;

  // Cameras
  cameras?: CameraConfig[];
}

/**
 * Individual camera configuration
 */
export interface CameraConfig {
  // Identity
  channelId: number;
  name: string;

  // Customization
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareRevision?: string;

  // Stream
  streamType?: StreamType | '';

  // Motion
  motion?: boolean;
  motionTimeout?: number;

  // Control
  unbridge?: boolean;
  enabled?: boolean;

  // Video Config
  videoConfig?: VideoConfig;

  // Detected info (read-only, populated by discovery/probe)
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
  // Source
  source?: string;
  stillImageSource?: string;

  // Limits
  maxStreams?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxFPS?: number;
  maxBitrate?: number;
  minBitrate?: number;

  // Codec and Hardware Acceleration
  vcodec?: string;
  encoder?: EncoderType;
  encoderOptions?: string;      // Custom encoder options
  decoderFlags?: string;         // Hardware decoder flags (applied before -i)
  hwaccel?: string;              // Hardware decoder type (cuda, qsv, vaapi, etc.)
  hwaccelDevice?: string;        // Hardware device path (/dev/dri/renderD128, etc.)
  sourceOptions?: string;        // FFmpeg source options (before -i)

  // Audio
  audio?: boolean;
  acodec?: string;

  // Stream mapping
  mapvideo?: string;
  mapaudio?: string;

  // Filters
  videoFilter?: string;
  vflip?: boolean;
  hflip?: boolean;

  // Advanced
  packetSize?: number;
  additionalCommandline?: string;

  // Debug
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
