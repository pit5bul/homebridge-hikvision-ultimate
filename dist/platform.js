"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikvisionPlatform = void 0;
const settings_1 = require("./settings");
const api_1 = require("./hikvision/api");
const discovery_1 = require("./hikvision/discovery");
const events_1 = require("./hikvision/events");
const camera_1 = require("./accessories/camera");
const path_1 = require("./ffmpeg/path");
const probe_1 = require("./ffmpeg/probe");
class HikvisionPlatform {
    log;
    config;
    api;
    get Service() { return this.api.hap.Service; }
    get Characteristic() { return this.api.hap.Characteristic; }
    accessories = new Map();
    cameraAccessories = new Map();
    api_client;
    discovery;
    events;
    ffmpegPath = '';
    ffprobePath = '';
    platformConfig;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.platformConfig = { ...settings_1.DEFAULT_PLATFORM_CONFIG, ...config };
        this.log.debug('Platform config loaded');
        this.api.on('didFinishLaunching', () => { this.log.debug('Homebridge finished launching'); this.initialize(); });
        this.api.on('shutdown', () => this.shutdown());
    }
    configureAccessory(accessory) {
        this.log.info(`Loading cached accessory: ${accessory.displayName} (UUID: ${accessory.UUID})`);
        this.accessories.set(accessory.UUID, accessory);
    }
    async initialize() {
        if (!this.platformConfig.host || !this.platformConfig.username || !this.platformConfig.password) {
            this.log.error('Missing required configuration: host, username, and password are required');
            return;
        }
        this.ffmpegPath = (0, path_1.resolveFfmpegPath)(this.platformConfig.videoProcessor);
        this.ffprobePath = (0, path_1.resolveFfprobePath)(this.ffmpegPath);
        this.log.info(`Using FFmpeg: ${this.ffmpegPath}`);
        this.log.debug(`Using FFprobe: ${this.ffprobePath}`);
        const ffmpegCheck = await (0, path_1.checkFfmpegAvailable)(this.ffmpegPath);
        if (!ffmpegCheck.available) {
            this.log.error(`FFmpeg not available: ${ffmpegCheck.error}`);
            this.log.error('Please install FFmpeg or specify a valid path in videoProcessor config');
            return;
        }
        this.log.info(`FFmpeg version: ${ffmpegCheck.version}`);
        this.api_client = new api_1.HikvisionApi(this.platformConfig.host, this.platformConfig.port || settings_1.DEFAULT_PLATFORM_CONFIG.port, this.platformConfig.secure || settings_1.DEFAULT_PLATFORM_CONFIG.secure, this.platformConfig.username, this.platformConfig.password, this.log);
        this.discovery = new discovery_1.HikvisionDiscovery(this.api_client, this.platformConfig.host, this.platformConfig.username, this.platformConfig.password, this.log);
        try {
            const deviceInfo = await this.discovery.getDeviceInfo();
            if (deviceInfo.name || deviceInfo.model) {
                this.log.info(`Connected to NVR: ${deviceInfo.name || 'Unknown'} (${deviceInfo.model || 'Unknown model'})`);
            }
        }
        catch (err) {
            this.log.warn(`Could not get NVR device info: ${err}`);
        }
        await this.setupCameras();
        this.startMotionListener();
    }
    async setupCameras() {
        let cameras = this.platformConfig.cameras || [];
        // Filter out any invalid camera entries before processing
        const originalCount = cameras.length;
        cameras = cameras.filter(camera => {
            if (!camera.name || camera.channelId === undefined || camera.channelId === null) {
                this.log.warn(`Removing invalid camera entry from config: name="${camera.name}" channelId="${camera.channelId}"`);
                return false;
            }
            return true;
        });
        if (cameras.length < originalCount) {
            this.log.info(`Filtered out ${originalCount - cameras.length} invalid camera entries`);
            // Save cleaned config
            await this.saveConfig(cameras);
        }
        // Warn if forceDiscovery is enabled when cameras are already configured
        if (this.platformConfig.forceDiscovery && cameras.length > 0) {
            this.log.warn('⚠️  forceDiscovery is enabled but cameras are already configured.');
            this.log.warn('⚠️  This will re-discover cameras and may cause issues if camera names changed.');
            this.log.warn('💡 Tip: Set forceDiscovery to false in config after first discovery.');
        }
        const needsDiscovery = cameras.length === 0 || this.platformConfig.forceDiscovery;
        if (needsDiscovery && this.discovery) {
            if (cameras.length === 0) {
                this.log.info('🔍 No cameras configured - starting auto-discovery...');
                this.log.info('💡 Cameras will be automatically added to your config.json');
                // On first discovery, remove ALL cached accessories from previous installations
                if (this.accessories.size > 0) {
                    this.log.info(`🧹 Removing ${this.accessories.size} cached accessory(ies) from previous installation...`);
                    const allAccessories = Array.from(this.accessories.values());
                    this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, allAccessories);
                    this.accessories.clear();
                    this.log.info('✅ Cached accessories cleared');
                }
            }
            else {
                this.log.info('🔍 Running discovery (forceDiscovery enabled)...');
            }
            try {
                const discoveredChannels = await this.discovery.discoverChannels();
                this.log.info(`✅ Found ${discoveredChannels.length} channel(s) on NVR`);
                cameras = await this.mergeDiscoveredCameras(cameras, discoveredChannels);
                await this.saveConfig(cameras);
                if (this.platformConfig.forceDiscovery) {
                    this.platformConfig.forceDiscovery = false;
                    this.log.info('✅ Discovery complete. forceDiscovery has been reset to false.');
                }
                // Show helpful message on first discovery
                if (originalCount === 0 && cameras.length > 0) {
                    this.log.info('🎉 First-time setup complete!');
                    this.log.info(`📝 ${cameras.length} camera(s) have been saved to config.json`);
                    this.log.info('💡 Tip: You can customize camera names, video quality, and hardware acceleration in the Homebridge UI');
                }
            }
            catch (err) {
                this.log.error(`❌ Failed to discover cameras: ${err}`);
                if (cameras.length === 0) {
                    this.log.error('⚠️  No cameras configured and discovery failed.');
                    this.log.error('📝 Please add cameras manually to config.json with channelId and name');
                    return;
                }
                this.log.warn('⚠️  Discovery failed, using existing camera configuration...');
            }
        }
        // CRITICAL: Clean up orphaned accessories BEFORE creating new ones
        // This prevents "already bridged" errors when camera names or configs change
        this.cleanupOrphanedAccessories(cameras);
        if (this.platformConfig.probeOnStartup) {
            await this.probeAllCameras(cameras);
        }
        for (const camera of cameras) {
            // Skip cameras with invalid/undefined names or channel IDs
            if (!camera.name || camera.channelId === undefined || camera.channelId === null) {
                this.log.warn(`Skipping invalid camera entry with name="${camera.name}" channelId="${camera.channelId}"`);
                continue;
            }
            if (camera.enabled === false) {
                this.log.debug(`Skipping disabled camera: ${camera.name}`);
                continue;
            }
            await this.createCameraAccessory(camera);
        }
    }
    async mergeDiscoveredCameras(existingCameras, discoveredChannels) {
        const result = [];
        const existingByChannelId = new Map();
        for (const camera of existingCameras) {
            existingByChannelId.set(camera.channelId, camera);
        }
        for (const channel of discoveredChannels) {
            const existing = existingByChannelId.get(channel.id);
            if (existing) {
                this.log.debug(`Keeping existing config for channel ${channel.id}: ${existing.name}`);
                result.push(existing);
                existingByChannelId.delete(channel.id);
            }
            else {
                const streamType = this.platformConfig.streamType || settings_1.DEFAULT_PLATFORM_CONFIG.streamType;
                const newCamera = this.createCameraConfig(channel.id, channel.name, streamType);
                this.log.info(`Discovered new camera: ${newCamera.name} (Channel ${channel.id})`);
                result.push(newCamera);
            }
        }
        for (const [channelId, camera] of existingByChannelId) {
            this.log.warn(`Camera '${camera.name}' (Channel ${channelId}) not found on NVR - keeping in config`);
            result.push(camera);
        }
        return result;
    }
    createCameraConfig(channelId, name, streamType) {
        if (!this.discovery)
            throw new Error('Discovery not initialized');
        const source = this.discovery.buildFfmpegSource(channelId, streamType);
        const stillImageSource = this.discovery.buildFfmpegStillSource(channelId, streamType);
        return {
            channelId,
            name,
            manufacturer: settings_1.DEFAULT_CAMERA_CONFIG.manufacturer,
            model: settings_1.DEFAULT_CAMERA_CONFIG.model,
            motion: settings_1.DEFAULT_CAMERA_CONFIG.motion,
            motionTimeout: settings_1.DEFAULT_CAMERA_CONFIG.motionTimeout,
            unbridge: settings_1.DEFAULT_CAMERA_CONFIG.unbridge,
            enabled: settings_1.DEFAULT_CAMERA_CONFIG.enabled,
            videoConfig: {
                source,
                stillImageSource,
                maxStreams: settings_1.DEFAULT_VIDEO_CONFIG.maxStreams,
                maxWidth: settings_1.DEFAULT_VIDEO_CONFIG.maxWidth,
                maxHeight: settings_1.DEFAULT_VIDEO_CONFIG.maxHeight,
                maxBitrate: settings_1.DEFAULT_VIDEO_CONFIG.maxBitrate,
                audio: settings_1.DEFAULT_VIDEO_CONFIG.audio,
                packetSize: settings_1.DEFAULT_VIDEO_CONFIG.packetSize,
                debug: settings_1.DEFAULT_VIDEO_CONFIG.debug,
            },
        };
    }
    async probeAllCameras(cameras) {
        this.log.info('Probing camera streams...');
        for (const camera of cameras) {
            if (camera.enabled === false)
                continue;
            if (!camera.name || camera.channelId === undefined)
                continue; // Skip invalid cameras
            const source = camera.videoConfig?.source;
            if (!source)
                continue;
            const urlMatch = source.match(/(rtsp:\/\/[^\s]+)/);
            if (!urlMatch) {
                this.log.debug(`Could not extract RTSP URL from source for ${camera.name}`);
                continue;
            }
            this.log.debug(`Probing ${camera.name}...`);
            try {
                const detected = await (0, probe_1.probeStream)(this.ffprobePath, urlMatch[1], this.platformConfig.probeTimeout || settings_1.DEFAULT_PLATFORM_CONFIG.probeTimeout, this.log);
                if (detected) {
                    camera.detected = detected;
                    this.log.info(`${camera.name}: ${detected.videoCodec || 'unknown'} ` +
                        `${detected.width}x${detected.height} @ ${detected.fps}fps` +
                        (detected.audioCodec ? ` + ${detected.audioCodec}` : ''));
                }
                else {
                    this.log.warn(`Failed to probe ${camera.name}`);
                }
            }
            catch (err) {
                this.log.warn(`Error probing ${camera.name}: ${err}`);
            }
        }
    }
    async createCameraAccessory(camera) {
        const uuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}-${camera.channelId}`);
        let accessory = this.accessories.get(uuid);
        let isNew = false;
        if (!accessory) {
            this.log.info(`Adding new camera: ${camera.name} (Channel ${camera.channelId})`);
            accessory = new this.api.platformAccessory(camera.name, uuid);
            isNew = true;
        }
        else {
            this.log.info(`Restoring cached camera: ${camera.name} (Channel ${camera.channelId})`);
        }
        accessory.context.cameraConfig = camera;
        // Always ensure videoConfig sources are populated and merge with defaults
        if (this.discovery) {
            const streamType = (camera.streamType || this.platformConfig.streamType || 'mainstream');
            // Merge with DEFAULT_VIDEO_CONFIG to ensure all defaults are applied
            camera.videoConfig = {
                ...settings_1.DEFAULT_VIDEO_CONFIG,
                ...(camera.videoConfig || {}),
            };
            // Determine encoder type - support both new 'encoder' field and legacy 'vcodec' field
            let encoderType;
            let vcodec;
            if (camera.videoConfig.encoder) {
                // New way: use encoder field directly
                encoderType = camera.videoConfig.encoder;
                // vcodec will be auto-derived in delegate.ts
            }
            else if (camera.videoConfig.vcodec) {
                // Legacy way: map vcodec to encoder type
                vcodec = camera.videoConfig.vcodec;
                const codecToEncoder = {
                    'libx264': 'software',
                    'h264_nvenc': 'nvenc',
                    'h264_qsv': 'quicksync',
                    'h264_vaapi': 'vaapi',
                    'h264_amf': 'amf',
                    'h264_videotoolbox': 'videotoolbox',
                    'h264_v4l2m2m': 'v4l2',
                };
                encoderType = codecToEncoder[vcodec] || 'software';
                camera.videoConfig.encoder = encoderType;
            }
            else {
                // Default to software
                encoderType = 'software';
                camera.videoConfig.encoder = encoderType;
            }
            // No longer using ENCODER_PRESETS - delegate.ts auto-configures everything
            // Just log what encoder type is being used
            this.log.info(`Camera ${camera.name} using ${encoderType} encoder`);
            // Only set source if not already set
            if (!camera.videoConfig.source) {
                camera.videoConfig.source = this.discovery.buildFfmpegSource(camera.channelId, streamType);
                this.log.info(`Generated RTSP source for ${camera.name}: ${camera.videoConfig.source}`);
            }
            // Only set stillImageSource if not already set
            if (!camera.videoConfig.stillImageSource) {
                camera.videoConfig.stillImageSource = this.discovery.buildFfmpegStillSource(camera.channelId, streamType);
                this.log.info(`Generated snapshot source for ${camera.name}: ${camera.videoConfig.stillImageSource}`);
            }
            // Log applied configuration for debugging
            this.log.info(`Camera ${camera.name} config: ${camera.videoConfig.maxWidth}x${camera.videoConfig.maxHeight}, ${camera.videoConfig.maxBitrate}kbps`);
        }
        const cameraAccessory = new camera_1.CameraAccessory(this.api, accessory, camera, this.ffmpegPath, this.log);
        this.cameraAccessories.set(camera.channelId, cameraAccessory);
        if (isNew) {
            this.log.info(`Registering new accessory: ${camera.name}`);
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            this.accessories.set(uuid, accessory);
        }
        else {
            this.log.debug(`Skipping registration for existing accessory: ${camera.name}`);
        }
    }
    cleanupOrphanedAccessories(cameras) {
        const validUUIDs = new Set();
        for (const camera of cameras) {
            // Only include cameras with valid name and channelId
            if (camera.enabled !== false && camera.name && camera.channelId !== undefined && camera.channelId !== null) {
                const uuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}-${camera.channelId}`);
                validUUIDs.add(uuid);
            }
        }
        const toRemove = [];
        for (const [uuid, accessory] of this.accessories) {
            if (!validUUIDs.has(uuid)) {
                this.log.info(`Removing orphaned accessory: ${accessory.displayName} (no longer in config)`);
                toRemove.push(accessory);
            }
        }
        if (toRemove.length > 0) {
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, toRemove);
            for (const accessory of toRemove) {
                this.accessories.delete(accessory.UUID);
            }
            this.log.info(`Cleaned up ${toRemove.length} orphaned accessory(ies)`);
        }
        else {
            this.log.debug('No orphaned accessories to clean up');
        }
    }
    startMotionListener() {
        if (!this.api_client)
            return;
        this.events = new events_1.HikvisionEvents(this.api_client, this.log, this.platformConfig.debugMotion || false);
        for (const [channelId, camera] of this.cameraAccessories) {
            const callback = (ch, _eventType, active) => {
                if (ch === channelId)
                    camera.triggerMotion(active);
            };
            this.events.onMotion(channelId, callback);
        }
        this.events.start();
    }
    async saveConfig(cameras) {
        try {
            // Update in-memory config
            this.platformConfig.cameras = cameras;
            // Save to disk using Homebridge's config path
            const configPath = this.api.user.configPath();
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            // Read current config
            const configData = await fs.promises.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            // Find and update our platform
            if (config.platforms) {
                const platformIndex = config.platforms.findIndex((p) => p.platform === settings_1.PLATFORM_NAME || p.name === this.platformConfig.name);
                if (platformIndex !== -1) {
                    // Update cameras while preserving other settings
                    config.platforms[platformIndex].cameras = cameras;
                    // Write back to file
                    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 4), 'utf8');
                    this.log.info(`✅ Saved ${cameras.length} camera(s) to config.json`);
                }
                else {
                    this.log.warn('⚠️  Platform not found in config.json, cameras updated in memory only');
                }
            }
        }
        catch (err) {
            this.log.error(`❌ Failed to save config to disk: ${err}`);
            this.log.warn('⚠️  Camera configuration updated in memory only. Changes will not persist across restarts.');
            this.log.info('💡 Tip: You can manually add discovered cameras to config.json');
        }
    }
    shutdown() {
        this.log.info('Shutting down Hikvision platform...');
        if (this.events)
            this.events.stop();
        for (const camera of this.cameraAccessories.values())
            camera.shutdown();
        this.log.info('Hikvision platform shutdown complete');
    }
}
exports.HikvisionPlatform = HikvisionPlatform;
