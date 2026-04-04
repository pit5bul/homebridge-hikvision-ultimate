import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import {
  HikvisionPlatformConfig,
  CameraConfig,
  StreamType,
} from './configTypes';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_VIDEO_CONFIG,
  QUALITY_PRESETS,
  DEFAULT_QUALITY_PRESET,
} from './settings';
import { HikvisionApi } from './hikvision/api';
import { HikvisionDiscovery } from './hikvision/discovery';
import { HikvisionEvents, MotionEventCallback } from './hikvision/events';
import { CameraAccessory } from './accessories/camera';
import { resolveFfmpegPath, resolveFfprobePath, checkFfmpegAvailable } from './ffmpeg/path';
import { probeStream } from './ffmpeg/probe';

export class HikvisionPlatform implements DynamicPlatformPlugin {
  public get Service(): typeof Service { return this.api.hap.Service; }
  public get Characteristic(): typeof Characteristic { return this.api.hap.Characteristic; }
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly cameraAccessories: Map<number, CameraAccessory> = new Map();
  private api_client?: HikvisionApi;
  private discovery?: HikvisionDiscovery;
  private events?: HikvisionEvents;
  private ffmpegPath = '';
  private ffprobePath = '';
  private readonly platformConfig: HikvisionPlatformConfig;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.platformConfig = { ...DEFAULT_PLATFORM_CONFIG, ...config } as HikvisionPlatformConfig;
    this.log.debug('Platform config loaded');
    this.api.on('didFinishLaunching', () => { this.log.debug('Homebridge finished launching'); this.initialize(); });
    this.api.on('shutdown', () => this.shutdown());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Loading cached accessory: ${accessory.displayName} (UUID: ${accessory.UUID})`);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async initialize(): Promise<void> {
    if (!this.platformConfig.host || !this.platformConfig.username || !this.platformConfig.password) {
      this.log.error('Missing required configuration: host, username, and password are required');
      return;
    }

    this.ffmpegPath = resolveFfmpegPath(this.platformConfig.videoProcessor);
    this.ffprobePath = resolveFfprobePath(this.ffmpegPath);
    this.log.info(`Using FFmpeg: ${this.ffmpegPath}`);
    this.log.debug(`Using FFprobe: ${this.ffprobePath}`);

    const ffmpegCheck = await checkFfmpegAvailable(this.ffmpegPath);
    if (!ffmpegCheck.available) {
      this.log.error(`FFmpeg not available: ${ffmpegCheck.error}`);
      this.log.error('Please install FFmpeg or specify a valid path in videoProcessor config');
      return;
    }
    this.log.info(`FFmpeg version: ${ffmpegCheck.version}`);

    this.api_client = new HikvisionApi(
      this.platformConfig.host,
      this.platformConfig.port || DEFAULT_PLATFORM_CONFIG.port,
      this.platformConfig.secure || DEFAULT_PLATFORM_CONFIG.secure,
      this.platformConfig.username,
      this.platformConfig.password,
      this.log,
    );

    this.discovery = new HikvisionDiscovery(
      this.api_client,
      this.platformConfig.host,
      this.platformConfig.username,
      this.platformConfig.password,
      this.log,
    );

    try {
      const deviceInfo = await this.discovery.getDeviceInfo();
      if (deviceInfo.name || deviceInfo.model) {
        this.log.info(`Connected to NVR: ${deviceInfo.name || 'Unknown'} (${deviceInfo.model || 'Unknown model'})`);
      }
    } catch (err) {
      this.log.warn(`Could not get NVR device info: ${err}`);
    }

    await this.setupCameras();
    this.startMotionListener();
  }

  private async setupCameras(): Promise<void> {
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
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, allAccessories);
          this.accessories.clear();
          this.log.info('✅ Cached accessories cleared');
        }
      } else {
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
      } catch (err) {
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

  private async mergeDiscoveredCameras(
    existingCameras: CameraConfig[],
    discoveredChannels: { id: number; name: string; inputPort: number; enabled: boolean; deviceInfo?: { manufacturer?: string; model?: string; serialNumber?: string; firmwareVersion?: string } }[],
  ): Promise<CameraConfig[]> {
    const result: CameraConfig[] = [];
    const existingByChannelId = new Map<number, CameraConfig>();

    for (const camera of existingCameras) {
      existingByChannelId.set(camera.channelId, camera);
    }

    for (const channel of discoveredChannels) {
      const existing = existingByChannelId.get(channel.id);
      if (existing) {
        this.log.debug(`Keeping existing config for channel ${channel.id}: ${existing.name}`);
        
        // Auto-populate camera info if available and not already set
        if (channel.deviceInfo) {
          let updated = false;
          if (!existing.manufacturer || existing.manufacturer === 'Hikvision') {
            existing.manufacturer = channel.deviceInfo.manufacturer || 'Hikvision';
            updated = true;
          }
          if (!existing.model || existing.model === 'IP Camera') {
            existing.model = channel.deviceInfo.model || 'IP Camera';
            updated = true;
          }
          if (!existing.serialNumber && channel.deviceInfo.serialNumber) {
            existing.serialNumber = channel.deviceInfo.serialNumber;
            updated = true;
          }
          if (!existing.firmwareRevision && channel.deviceInfo.firmwareVersion) {
            existing.firmwareRevision = channel.deviceInfo.firmwareVersion;
            updated = true;
          }
          
          if (updated) {
            this.log.info(`📝 Auto-populated camera info for ${existing.name} from ISAPI`);
          }
        }
        
        result.push(existing);
        existingByChannelId.delete(channel.id);
      } else {
        const streamType = this.platformConfig.streamType || DEFAULT_PLATFORM_CONFIG.streamType;
        const newCamera = this.createCameraConfig(channel.id, channel.name, streamType, channel.deviceInfo);
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

  private createCameraConfig(
    channelId: number, 
    name: string, 
    streamType: StreamType,
    deviceInfo?: { manufacturer?: string; model?: string; serialNumber?: string; firmwareVersion?: string },
  ): CameraConfig {
    if (!this.discovery) throw new Error('Discovery not initialized');

    const source = this.discovery.buildFfmpegSource(channelId, streamType);
    const stillImageSource = this.discovery.buildFfmpegStillSource(channelId, streamType);

    // Use device info from camera if available, otherwise use defaults
    const manufacturer = deviceInfo?.manufacturer || DEFAULT_CAMERA_CONFIG.manufacturer;
    const model = deviceInfo?.model || DEFAULT_CAMERA_CONFIG.model;
    const serialNumber = deviceInfo?.serialNumber;
    const firmwareRevision = deviceInfo?.firmwareVersion;

    return {
      channelId,
      name,
      manufacturer,
      model,
      serialNumber,
      firmwareRevision,
      motion: DEFAULT_CAMERA_CONFIG.motion,
      motionTimeout: DEFAULT_CAMERA_CONFIG.motionTimeout,
      unbridge: DEFAULT_CAMERA_CONFIG.unbridge,
      enabled: DEFAULT_CAMERA_CONFIG.enabled,
      videoConfig: {
        source,
        stillImageSource,
        maxStreams: DEFAULT_VIDEO_CONFIG.maxStreams,
        maxWidth: DEFAULT_VIDEO_CONFIG.maxWidth,
        maxHeight: DEFAULT_VIDEO_CONFIG.maxHeight,
        maxBitrate: DEFAULT_VIDEO_CONFIG.maxBitrate,
        audio: DEFAULT_VIDEO_CONFIG.audio,
        packetSize: DEFAULT_VIDEO_CONFIG.packetSize,
        debug: DEFAULT_VIDEO_CONFIG.debug,
      },
    };
  }

  private async probeAllCameras(cameras: CameraConfig[]): Promise<void> {
    this.log.info('Probing camera streams...');

    for (const camera of cameras) {
      if (camera.enabled === false) continue;
      if (!camera.name || camera.channelId === undefined) continue; // Skip invalid cameras
      
      const source = camera.videoConfig?.source;
      if (!source) continue;

      const urlMatch = source.match(/(rtsp:\/\/[^\s]+)/);
      if (!urlMatch) {
        this.log.debug(`Could not extract RTSP URL from source for ${camera.name}`);
        continue;
      }

      this.log.debug(`Probing ${camera.name}...`);
      
      try {
        const detected = await probeStream(
          this.ffprobePath,
          urlMatch[1],
          this.platformConfig.probeTimeout || DEFAULT_PLATFORM_CONFIG.probeTimeout,
          this.log,
        );

        if (detected) {
          camera.detected = detected;
          this.log.info(
            `${camera.name}: ${detected.videoCodec || 'unknown'} ` +
            `${detected.width}x${detected.height} @ ${detected.fps}fps` +
            (detected.audioCodec ? ` + ${detected.audioCodec}` : ''),
          );
        } else {
          this.log.warn(`Failed to probe ${camera.name}`);
        }
      } catch (err) {
        this.log.warn(`Error probing ${camera.name}: ${err}`);
      }
    }
  }

  private async createCameraAccessory(camera: CameraConfig): Promise<void> {
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}-${camera.channelId}`);
    let accessory = this.accessories.get(uuid);
    let isNew = false;

    if (!accessory) {
      this.log.info(`Adding new camera: ${camera.name} (Channel ${camera.channelId})`);
      accessory = new this.api.platformAccessory(camera.name, uuid);
      isNew = true;
    } else {
      this.log.info(`Restoring cached camera: ${camera.name} (Channel ${camera.channelId})`);
    }

    accessory.context.cameraConfig = camera;

    // Always ensure videoConfig sources are populated and merge with defaults
    if (this.discovery) {
      const streamType = (camera.streamType || this.platformConfig.streamType || 'mainstream') as StreamType;
      
      // Merge with DEFAULT_VIDEO_CONFIG to ensure all defaults are applied
      camera.videoConfig = {
        ...DEFAULT_VIDEO_CONFIG,
        ...(camera.videoConfig || {}),
      };
      
      // Resolve encoder type
      const encoderType = camera.videoConfig.encoder || 'software';
      camera.videoConfig.encoder = encoderType;
      this.log.info(`Camera ${camera.name} using ${encoderType} encoder`);

      // Resolve qualityPreset → maxWidth / maxHeight / maxBitrate
      const preset = camera.videoConfig.qualityPreset || DEFAULT_QUALITY_PRESET;
      const presetValues = QUALITY_PRESETS[preset] || QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
      camera.videoConfig.maxWidth = presetValues.maxWidth;
      camera.videoConfig.maxHeight = presetValues.maxHeight;
      camera.videoConfig.maxBitrate = presetValues.maxBitrate;
      this.log.info(`Camera ${camera.name} quality: ${preset} (${presetValues.maxWidth}x${presetValues.maxHeight} @ ${presetValues.maxBitrate}kbps)`);
      
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
      

    }

    const cameraAccessory = new CameraAccessory(this.api, accessory, camera, this.ffmpegPath, this.log);
    this.cameraAccessories.set(camera.channelId, cameraAccessory);

    if (isNew) {
      this.log.info(`Registering new accessory: ${camera.name}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.set(uuid, accessory);
    } else {
      this.log.debug(`Skipping registration for existing accessory: ${camera.name}`);
    }
  }

  private cleanupOrphanedAccessories(cameras: CameraConfig[]): void {
    const validUUIDs = new Set<string>();
    for (const camera of cameras) {
      // Only include cameras with valid name and channelId
      if (camera.enabled !== false && camera.name && camera.channelId !== undefined && camera.channelId !== null) {
        const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}-${camera.channelId}`);
        validUUIDs.add(uuid);
      }
    }

    const toRemove: PlatformAccessory[] = [];
    for (const [uuid, accessory] of this.accessories) {
      if (!validUUIDs.has(uuid)) {
        this.log.info(`Removing orphaned accessory: ${accessory.displayName} (no longer in config)`);
        toRemove.push(accessory);
      }
    }

    if (toRemove.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
      for (const accessory of toRemove) {
        this.accessories.delete(accessory.UUID);
      }
      this.log.info(`Cleaned up ${toRemove.length} orphaned accessory(ies)`);
    } else {
      this.log.debug('No orphaned accessories to clean up');
    }
  }

  private startMotionListener(): void {
    if (!this.api_client) return;

    this.events = new HikvisionEvents(this.api_client, this.log, this.platformConfig.debugMotion || false);

    for (const [channelId, camera] of this.cameraAccessories) {
      const callback: MotionEventCallback = (ch, _eventType, active) => {
        if (ch === channelId) camera.triggerMotion(active);
      };
      this.events.onMotion(channelId, callback);
    }

    this.events.start();
  }

  private async saveConfig(cameras: CameraConfig[]): Promise<void> {
    try {
      // Update in-memory config
      this.platformConfig.cameras = cameras;
      
      // Save to disk using Homebridge's config path
      const configPath = this.api.user.configPath();
      const fs = await import('fs');
      
      // Read current config
      const configData = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Find and update our platform
      if (config.platforms) {
        const platformIndex = config.platforms.findIndex(
          (p: any) => p.platform === PLATFORM_NAME || p.name === this.platformConfig.name
        );
        
        if (platformIndex !== -1) {
          // Update cameras while preserving other settings
          config.platforms[platformIndex].cameras = cameras;
          
          // Write back to file
          await fs.promises.writeFile(
            configPath,
            JSON.stringify(config, null, 4),
            'utf8'
          );
          
          this.log.info(`✅ Saved ${cameras.length} camera(s) to config.json`);
        } else {
          this.log.warn('⚠️  Platform not found in config.json, cameras updated in memory only');
        }
      }
    } catch (err) {
      this.log.error(`❌ Failed to save config to disk: ${err}`);
      this.log.warn('⚠️  Camera configuration updated in memory only. Changes will not persist across restarts.');
      this.log.info('💡 Tip: You can manually add discovered cameras to config.json');
    }
  }

  private shutdown(): void {
    this.log.info('Shutting down Hikvision platform...');
    if (this.events) this.events.stop();
    for (const camera of this.cameraAccessories.values()) camera.shutdown();
    this.log.info('Hikvision platform shutdown complete');
  }
}
