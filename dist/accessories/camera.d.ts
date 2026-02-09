import { API, Logger, PlatformAccessory } from 'homebridge';
import { CameraConfig } from '../configTypes';
export declare class CameraAccessory {
    private readonly accessory;
    private readonly cameraConfig;
    private readonly log;
    private readonly hap;
    private readonly api;
    private readonly motionService?;
    private readonly streamingDelegate;
    private readonly recordingDelegate?;
    private motionDetected;
    private motionTimeout?;
    constructor(api: API, accessory: PlatformAccessory, cameraConfig: CameraConfig, videoProcessor: string, log: Logger);
    get channelId(): number;
    triggerMotion(active: boolean): void;
    shutdown(): void;
}
