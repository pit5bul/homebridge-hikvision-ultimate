import {
  API,
  HAP,
  Logger,
  PlatformAccessory,
  Service,
  AudioRecordingCodecType,
  AudioRecordingSamplerate,
} from 'homebridge';
import { CameraConfig } from '../configTypes';
import { StreamingDelegate } from '../streaming/delegate';
import { RecordingDelegate } from '../streaming/recordingDelegate';
import { DEFAULT_CAMERA_CONFIG } from '../settings';

export class CameraAccessory {
  private readonly hap: HAP;
  private readonly api: API;
  private readonly motionService?: Service;
  private readonly streamingDelegate: StreamingDelegate;
  private readonly recordingDelegate?: RecordingDelegate;
  private motionDetected = false;
  private motionTimeout?: NodeJS.Timeout;

  constructor(
    api: API,
    private readonly accessory: PlatformAccessory,
    private readonly cameraConfig: CameraConfig,
    videoProcessor: string,
    private readonly log: Logger,
  ) {
    this.hap = api.hap;
    this.api = api;

    const accessoryInfo = this.accessory.getService(this.hap.Service.AccessoryInformation);
    if (accessoryInfo) {
      accessoryInfo
        .setCharacteristic(this.hap.Characteristic.Manufacturer, cameraConfig.manufacturer || DEFAULT_CAMERA_CONFIG.manufacturer)
        .setCharacteristic(this.hap.Characteristic.Model, cameraConfig.model || DEFAULT_CAMERA_CONFIG.model)
        .setCharacteristic(this.hap.Characteristic.SerialNumber, cameraConfig.serialNumber || `HK-${cameraConfig.channelId}`);
      if (cameraConfig.firmwareRevision) {
        accessoryInfo.setCharacteristic(this.hap.Characteristic.FirmwareRevision, cameraConfig.firmwareRevision);
      }
    }

    this.streamingDelegate = new StreamingDelegate(this.hap, cameraConfig, videoProcessor, log);

    // Create recording delegate if HKSV is enabled
    if (cameraConfig.videoConfig?.recording) {
      this.log.info(`[HKSV] Recording enabled for ${cameraConfig.name}`);
      this.recordingDelegate = new RecordingDelegate(
        this.log,
        cameraConfig.name || 'Camera',
        cameraConfig.videoConfig,
        this.api,
        this.hap,
        videoProcessor,
      );
    }

    const cameraControllerOptions = {
      cameraStreamCount: cameraConfig.videoConfig?.maxStreams || 2,
      delegate: this.streamingDelegate,
      streamingOptions: {
        supportedCryptoSuites: [this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: [
            [1920, 1080, 30], [1280, 720, 30], [640, 480, 30], [640, 360, 30],
            [480, 360, 30], [480, 270, 30], [320, 240, 30], [320, 240, 15], [320, 180, 30],
          ] as [number, number, number][],
          codec: {
            profiles: [this.hap.H264Profile.BASELINE, this.hap.H264Profile.MAIN, this.hap.H264Profile.HIGH],
            levels: [this.hap.H264Level.LEVEL3_1, this.hap.H264Level.LEVEL3_2, this.hap.H264Level.LEVEL4_0],
          },
        },
        audio: cameraConfig.videoConfig?.audio ? {
          twoWayAudio: false,
          codecs: [{ type: this.hap.AudioStreamingCodecType.AAC_ELD, samplerate: this.hap.AudioStreamingSamplerate.KHZ_16 }],
        } : undefined,
      },
      // Add HKSV recording configuration if enabled
      recording: !this.recordingDelegate ? undefined : {
        options: {
          prebufferLength: cameraConfig.videoConfig?.prebufferLength || 4000,
          overrideEventTriggerOptions: [
            this.hap.EventTriggerOption.MOTION,
            this.hap.EventTriggerOption.DOORBELL,
          ],
          mediaContainerConfiguration: [{
            type: 0,
            fragmentLength: 4000,
          }],
          video: {
            type: this.hap.VideoCodecType.H264,
            parameters: {
              levels: [
                this.hap.H264Level.LEVEL3_1,
                this.hap.H264Level.LEVEL3_2,
                this.hap.H264Level.LEVEL4_0,
              ],
              profiles: [
                this.hap.H264Profile.BASELINE,
                this.hap.H264Profile.MAIN,
                this.hap.H264Profile.HIGH,
              ],
            },
            resolutions: [
              [320, 180, 30],
              [320, 240, 15],
              [320, 240, 30],
              [480, 270, 30],
              [480, 360, 30],
              [640, 360, 30],
              [640, 480, 30],
              [1280, 720, 30],
              [1280, 960, 30],
              [1920, 1080, 30],
              [1600, 1200, 30],
            ] as [number, number, number][],
          },
          audio: {
            codecs: [{
              type: AudioRecordingCodecType.AAC_LC,
              bitrateMode: 0,
              samplerate: [AudioRecordingSamplerate.KHZ_32],
              audioChannels: 1,
            }],
          },
        },
        delegate: this.recordingDelegate,
      },
    };

    const cameraController = new this.hap.CameraController(cameraControllerOptions);
    this.accessory.configureController(cameraController);

    const motionEnabled = cameraConfig.motion !== false;
    if (motionEnabled) {
      this.motionService = this.accessory.getService(this.hap.Service.MotionSensor) ||
        this.accessory.addService(this.hap.Service.MotionSensor, `${cameraConfig.name} Motion`);
      this.motionService.getCharacteristic(this.hap.Characteristic.MotionDetected).onGet(() => this.motionDetected);
    } else {
      const existingMotion = this.accessory.getService(this.hap.Service.MotionSensor);
      if (existingMotion) this.accessory.removeService(existingMotion);
    }
  }

  get channelId(): number {
    return this.cameraConfig.channelId;
  }

  triggerMotion(active: boolean): void {
    if (!this.motionService) return;

    if (this.motionTimeout) {
      clearTimeout(this.motionTimeout);
      this.motionTimeout = undefined;
    }

    if (active) {
      this.motionDetected = true;
      this.motionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, true);
      this.log.debug(`Motion detected: ${this.cameraConfig.name}`);

      const timeout = (this.cameraConfig.motionTimeout ?? DEFAULT_CAMERA_CONFIG.motionTimeout) * 1000;
      if (timeout > 0) {
        this.motionTimeout = setTimeout(() => this.triggerMotion(false), timeout);
      }
    } else {
      this.motionDetected = false;
      this.motionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
      this.log.debug(`Motion cleared: ${this.cameraConfig.name}`);
    }
  }

  shutdown(): void {
    if (this.motionTimeout) clearTimeout(this.motionTimeout);
    this.streamingDelegate.stopAllStreams();
  }
}
