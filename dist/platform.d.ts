import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
export declare class HikvisionPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    get Service(): typeof Service;
    get Characteristic(): typeof Characteristic;
    readonly accessories: Map<string, PlatformAccessory>;
    private readonly cameraAccessories;
    private api_client?;
    private discovery?;
    private events?;
    private ffmpegPath;
    private ffprobePath;
    private readonly platformConfig;
    constructor(log: Logger, config: PlatformConfig, api: API);
    configureAccessory(accessory: PlatformAccessory): void;
    private initialize;
    private setupCameras;
    private mergeDiscoveredCameras;
    private createCameraConfig;
    private probeAllCameras;
    private createCameraAccessory;
    private cleanupOrphanedAccessories;
    private startMotionListener;
    private saveConfig;
    private shutdown;
}
