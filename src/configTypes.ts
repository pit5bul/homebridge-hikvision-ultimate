import { PlatformConfig } from 'homebridge';

/**
 * Stream type options
 */
export type StreamType = 'mainstream' | 'substream' | 'thirdstream';

/**
 * Hardware encoder types
 */
export type EncoderType = 'software' | 'vaapi' | 'quicksync' | 'nvenc' | 'amf' | 'videotoolbox' | 'v4l2';

/**
 * Quality profile for hardware encoders
 */
export type QualityProfile = '' | 'speed' | 'balanced' | 'quality';

/**
 * Quality preset — maps to fixed resolution + bitrate
 */
export type QualityPreset = '720p-standard' | '1080p-standard' | '1080p-hq';

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
 * Video configuration for a camera
 */
export interface VideoConfig {
  // Source
  source?: string;
  stillImageSource?: string;

  // Quality preset (maps to maxWidth/maxHeight/maxBitrate at runtime)
  qualityPreset?: QualityPreset;

  // Limits (populated from qualityPreset at runtime)
  maxStreams?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxFPS?: number;
  maxBitrate?: number;

  // Codec and Hardware Acceleration
  encoder?: EncoderType;
  qualityProfile?: QualityProfile;
  encoderOptions?: string;
  hwaccelDevice?: string;

  // Audio
  audio?: boolean;
  copyAudio?: boolean;

  // Filters
  videoFilter?: string;
  vflip?: boolean;
  hflip?: boolean;

  // Advanced
  packetSize?: number;

  // Debug
  debug?: boolean;
  debugReturn?: boolean;

  // HomeKit Secure Video (HKSV)
  recording?: boolean;
  prebuffer?: boolean;
  prebufferLength?: number;
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
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
  };
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
