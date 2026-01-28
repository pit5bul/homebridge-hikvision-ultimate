"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikvisionDiscovery = void 0;
const settings_1 = require("../settings");
/**
 * Discover cameras from Hikvision NVR via ISAPI
 */
class HikvisionDiscovery {
    api;
    host;
    username;
    password;
    log;
    constructor(api, host, username, password, log) {
        this.api = api;
        this.host = host;
        this.username = username;
        this.password = password;
        this.log = log;
    }
    /**
     * Get NVR device information
     */
    async getDeviceInfo() {
        try {
            const response = await this.api.get('/ISAPI/System/deviceInfo');
            const info = response.DeviceInfo;
            return {
                name: info?.deviceName,
                model: info?.model,
                serialNumber: info?.serialNumber,
                firmwareVersion: info?.firmwareVersion,
            };
        }
        catch (err) {
            this.log.warn(`Failed to get device info: ${err}`);
            return {};
        }
    }
    /**
     * Discover all input channels from NVR
     */
    async discoverChannels() {
        try {
            const response = await this.api.get('/ISAPI/ContentMgmt/InputProxy/channels');
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
        }
        catch (err) {
            this.log.error(`Failed to discover channels: ${err}`);
            throw err;
        }
    }
    /**
     * Build RTSP URL for a channel
     */
    buildRtspUrl(channelId, streamType = 'mainstream') {
        const suffix = settings_1.STREAM_TYPE_SUFFIX[streamType];
        const channelPath = `${channelId}${suffix}`;
        // URL encode username and password for special characters
        const encodedUsername = encodeURIComponent(this.username);
        const encodedPassword = encodeURIComponent(this.password);
        return `rtsp://${encodedUsername}:${encodedPassword}@${this.host}:${settings_1.DEFAULT_RTSP_PORT}/Streaming/Channels/${channelPath}`;
    }
    /**
     * Build still image URL for a channel
     */
    buildStillImageUrl(channelId, streamType = 'mainstream') {
        const suffix = settings_1.STREAM_TYPE_SUFFIX[streamType];
        const channelPath = `${channelId}${suffix}`;
        // Use ISAPI streaming endpoint for snapshot with port 80
        const protocol = 'http';
        const port = 80;
        return `${protocol}://${this.host}:${port}/ISAPI/Streaming/channels/${channelPath}/picture`;
    }
    /**
     * Build FFmpeg source string for a channel
     */
    buildFfmpegSource(channelId, streamType = 'mainstream') {
        const rtspUrl = this.buildRtspUrl(channelId, streamType);
        return `-rtsp_transport tcp -i ${rtspUrl}`;
    }
    /**
     * Build FFmpeg still image source string for a channel
     */
    buildFfmpegStillSource(channelId, streamType = 'mainstream') {
        // Use the ISAPI Streaming endpoint that supports resolution parameters
        // Format: /ISAPI/Streaming/channels/{channelId}{suffix}/picture
        // Example: /ISAPI/Streaming/channels/501/picture for channel 5 mainstream
        const suffix = settings_1.STREAM_TYPE_SUFFIX[streamType];
        const channelPath = `${channelId}${suffix}`;
        const encodedUsername = encodeURIComponent(this.username);
        const encodedPassword = encodeURIComponent(this.password);
        // Build URL with authentication
        const snapshotUrl = `http://${encodedUsername}:${encodedPassword}@${this.host}:80/ISAPI/Streaming/channels/${channelPath}/picture`;
        // Add timeout and image2 format for proper JPEG handling
        return `-timeout 5000000 -f image2 -i ${snapshotUrl}`;
    }
}
exports.HikvisionDiscovery = HikvisionDiscovery;
