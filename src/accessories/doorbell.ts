import { HAP, Logger, PlatformAccessory, Service } from 'homebridge';
import { HikvisionApi } from '../hikvision/api';

const CALL_STATUS_PATH = '/ISAPI/VideoIntercom/callStatus?format=json';
const CALL_STATUS_CAPABILITIES_PATH = '/ISAPI/VideoIntercom/callStatus/capabilities?format=json';

/** Upper bound for the back-off multiplier applied to the poll interval after failures. */
const MAX_BACKOFF_FACTOR = 15;

interface CallStatusResponse {
  CallStatus?: { status?: string };
}

interface CallStatusCapabilities {
  CallStatus?: { status?: { '@opt'?: string[] | string } };
}

/**
 * HomeKit doorbell for a Hikvision video intercom (door station).
 *
 * The device is polled on /ISAPI/VideoIntercom/callStatus, which reports "idle", "ring" or
 * "onCall". Newer firmware no longer pushes a ring event, so polling is the dependable method.
 * One doorbell press is sent to HomeKit per idle -> ring transition, however long the ring lasts.
 */
export class DoorbellFeature {
  private readonly service: Service;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private supported = false;
  private lastStatus?: string;
  private failures = 0;

  constructor(
    private readonly hap: HAP,
    accessory: PlatformAccessory,
    private readonly name: string,
    private readonly api: HikvisionApi,
    private readonly pollSeconds: number,
    private readonly log: Logger,
  ) {
    this.service = accessory.getService(hap.Service.Doorbell) ||
      accessory.addService(hap.Service.Doorbell, `${name} Doorbell`);
    this.service.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent)
      .setProps({ validValues: [hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS] });
  }

  /**
   * Remove the doorbell service when the feature is switched off.
   */
  static remove(hap: HAP, accessory: PlatformAccessory): void {
    const existing = accessory.getService(hap.Service.Doorbell);
    if (existing) {
      accessory.removeService(existing);
    }
  }

  /**
   * Check the device supports call status, then start polling.
   * An unsupported device is reported once in the log and never polled.
   */
  async start(): Promise<void> {
    try {
      const caps = await this.api.getJson<CallStatusCapabilities>(CALL_STATUS_CAPABILITIES_PATH);
      const raw = caps?.CallStatus?.status?.['@opt'];
      const options = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : undefined;
      if (options && !options.includes('ring')) {
        this.log.warn(`[Doorbell] ${this.name}: device call status does not report "ring" (${options.join(', ')}) - doorbell disabled`);
        return;
      }
    } catch (err) {
      this.log.warn(`[Doorbell] ${this.name}: call status is not available on this device (${err}) - doorbell disabled. Turn off the Doorbell option for this camera if it is not a video intercom.`);
      return;
    }

    this.supported = true;
    this.log.info(`[Doorbell] ${this.name}: watching call status every ${this.pollSeconds}s`);
    this.schedule(this.pollSeconds * 1000);
  }

  shutdown(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => void this.poll(), delayMs);
    this.timer.unref?.();
  }

  private async poll(): Promise<void> {
    let delay = this.pollSeconds * 1000;
    try {
      const response = await this.api.getJson<CallStatusResponse>(CALL_STATUS_PATH);
      const status = response?.CallStatus?.status;
      if (this.failures > 0) {
        this.log.info(`[Doorbell] ${this.name}: call status reachable again`);
      }
      this.failures = 0;
      this.handleStatus(status);
    } catch (err) {
      this.failures++;
      if (this.failures === 1 || this.failures % 30 === 0) {
        this.log.warn(`[Doorbell] ${this.name}: could not read call status (${err}); retrying with back-off`);
      }
      delay *= Math.min(this.failures + 1, MAX_BACKOFF_FACTOR);
    }
    this.schedule(delay);
  }

  /**
   * Fire a doorbell press on idle -> ring only. The first reading is recorded without firing,
   * so a ring already in progress at startup does not produce a stale notification.
   */
  private handleStatus(status: string | undefined): void {
    if (!status) {
      return;
    }
    const previous = this.lastStatus;
    this.lastStatus = status;
    if (previous === undefined) {
      this.log.debug(`[Doorbell] ${this.name}: initial call status "${status}"`);
      return;
    }
    if (status === 'ring' && previous !== 'ring') {
      this.log.info(`[Doorbell] ${this.name}: doorbell pressed`);
      this.service.updateCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchEvent,
        this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
      );
    }
  }

  get isSupported(): boolean {
    return this.supported;
  }
}
