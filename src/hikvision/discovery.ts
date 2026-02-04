import { Logger } from 'homebridge';
import { HikvisionApi } from './api';
import { DiscoveredChannel, StreamType } from '../configTypes';
import { STREAM_TYPE_SUFFIX, DEFAULT_RTSP_PORT } from '../settings';

/**
 * Response from /ISAPI/ContentMgmt/InputProxy/channels
 */
interface ChannelsResponse {
  InputProxyChannelList?: {
    InputProxyChannel?: InputProxyChannel | InputProxyChannel[];
  };
}

interface InputProxyChannel {
  id: string;
  name: string;
  inputPort: string;
  sourceInputPortDescriptor?: {
    proxyProtocol?: string;
  };
}

/**
 * Response from /ISAPI/System/deviceInfo
 */
interface DeviceInfoResponse {
  DeviceInfo?: {
    deviceName?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
    macAddress?: string;
  };
}

/**
 * Discover cameras from Hikvision NVR via ISAPI
 */
export class HikvisionDiscovery {
  constructor(
    private readonly api: HikvisionApi,
    private readonly host: string,
    private readonly username: string,
    private readonly password: string,
    private readonly log: Logger,
  ) {}

  /**
   * Get NVR device information
   */
  async getDeviceInfo(): Promise<{
    name?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
  }> {
    try {
      const response = await this.api.get<DeviceInfoResponse>('/ISAPI/System/deviceInfo');
      const info = response.DeviceInfo;
      return {
        name: info?.deviceName,
        model: info?.model,
        serialNumber: info?.serialNumber,
        firmwareVersion: info?.firmwareVersion,
      };
    } catch (err) {
      this.log.warn(`Failed to get device info: ${err}`);
      return {};
    }
  }

  /**
   * Discover all input channels from NVR
   */
  async discoverChannels(): Promise<DiscoveredChannel[]> {
    try {
      const response = await this.api.get<ChannelsResponse>('/ISAPI/ContentMgmt/InputProxy/channels');
      const channelList = response.InputProxyChannelList?.InputProxyChannel;

      if (!channelList) {
        this.log.warn('No channels found in NVR response');
        return [];
      }

      // Handle single channel or array of channels
      const channels = Array.isArray(channelList) ? channelList : [channelList];

      return channels.map((ch) => ({
        id: parseInt(ch.id, 10),
        name: ch.name || `Channel ${ch.id}`,
        inputPort: parseInt(ch.inputPort, 10),
        enabled: true, // Assume enabled if returned
      }));
    } catch (err) {
      this.log.error(`Failed to discover channels: ${err}`);
      throw err;
    }
  }

  /**
   * Build RTSP URL for a channel
   */
  buildRtspUrl(channelId: number, streamType: StreamType = 'mainstream'): string {
    const suffix = STREAM_TYPE_SUFFIX[streamType];
    const channelPath = `${channelId}${suffix}`;

    // URL encode username and password for special characters
    const encodedUsername = encodeURIComponent(this.username);
    const encodedPassword = encodeURIComponent(this.password);

    return `rtsp://${encodedUsername}:${encodedPassword}@${this.host}:${DEFAULT_RTSP_PORT}/Streaming/Channels/${channelPath}`;
  }

  /**
   * Build still image URL for a channel
   */
  buildStillImageUrl(channelId: number, streamType: StreamType = 'mainstream'): string {
    const suffix = STREAM_TYPE_SUFFIX[streamType];
    const channelPath = `${channelId}${suffix}`;

    // Use ISAPI streaming endpoint for snapshot with port 80
    const protocol = 'http';
    const port = 80;
    
    return `${protocol}://${this.host}:${port}/ISAPI/Streaming/channels/${channelPath}/picture`;
  }

  /**
   * Build FFmpeg source string for a channel
   */
  buildFfmpegSource(channelId: number, streamType: StreamType = 'mainstream'): string {
    const rtspUrl = this.buildRtspUrl(channelId, streamType);
    return `-rtsp_transport tcp -i ${rtspUrl}`;
  }

  /**
   * Build FFmpeg still image source string for a channel
   */
  buildFfmpegStillSource(channelId: number, streamType: StreamType = 'mainstream'): string {
    const suffix = STREAM_TYPE_SUFFIX[streamType];
    const channelPath = `${channelId}${suffix}`;
    
    const encodedUsername = encodeURIComponent(this.username);
    const encodedPassword = encodeURIComponent(this.password);
    
    // Build URL with authentication and resolution parameters
    const snapshotUrl = `http://${encodedUsername}:${encodedPassword}@${this.host}:80/ISAPI/Streaming/channels/${channelPath}/picture?videoResolutionWidth=1920&videoResolutionHeight=1080`;
    
    // Return only -i and URL (snapshot handler adds other flags)
    return `-i ${snapshotUrl}`;
  }
}
