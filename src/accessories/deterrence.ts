import { CharacteristicValue, HAP, Logger, PlatformAccessory, Service } from 'homebridge';
import { HikvisionApi } from '../hikvision/api';

/**
 * Optional deterrence controls (white light, siren, strobe). All three are experimental and
 * opt-in per camera. They change settings on the camera itself, so each feature remembers
 * what it changed and puts it back.
 */

/** Runs async operations one at a time so read-modify-write cycles never interleave. */
class Serial {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

interface DeterrenceContext {
  light?: { previousMode?: string };
  siren?: AlarmRestore;
  strobe?: AlarmRestore;
}

interface AlarmRestore {
  /** What the camera had before we switched the linkage on. */
  timeRangeList: unknown;
  durationTime?: unknown;
}

function contextOf(accessory: PlatformAccessory): DeterrenceContext {
  if (!accessory.context.deterrence) {
    accessory.context.deterrence = {};
  }
  return accessory.context.deterrence as DeterrenceContext;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// XML helpers: edit single elements in place so every other setting is sent back unchanged.
// ---------------------------------------------------------------------------

function getTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</${tag}>`));
  return match ? match[1] : undefined;
}

function setTag(xml: string, tag: string, value: string, rootTag: string): string {
  const existing = new RegExp(`(<${tag}(?:\\s[^>]*)?>)[^<]*(</${tag}>)`);
  if (existing.test(xml)) {
    return xml.replace(existing, `$1${value}$2`);
  }
  const close = new RegExp(`</${rootTag}>`);
  if (!close.test(xml)) {
    throw new Error(`Unexpected response: no <${rootTag}> element`);
  }
  return xml.replace(close, `<${tag}>${value}</${tag}>$&`);
}

// ---------------------------------------------------------------------------
// White light
// ---------------------------------------------------------------------------

const WHITE_MODE_PREFERENCE = ['colorVuWhiteLight', 'whiteLight', 'multiAzimuthWhiteLight'];
const LIGHT_REFRESH_MS = 120_000;
const LIGHT_ROOT = 'SupplementLight';

function isWhiteMode(mode: string | undefined): boolean {
  return !!mode && /white/i.test(mode) && !/^close$/i.test(mode);
}

/**
 * White supplement light as a HomeKit lightbulb.
 *
 * Reads and writes /ISAPI/Image/channels/<id>/SupplementLight. The mode names a camera accepts
 * differ by model and firmware, so they are read from the camera's capabilities. The camera
 * ignores the white light in day mode; it only comes on when the camera is in night mode.
 */
export class WhiteLightFeature {
  private readonly service: Service;
  private readonly serial = new Serial();
  private readonly path: string;
  private whiteMode?: string;
  private irOrClosedModes: string[] = [];
  private on = false;
  private brightness = 100;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private supported = false;

  constructor(
    private readonly hap: HAP,
    private readonly accessory: PlatformAccessory,
    private readonly name: string,
    private readonly api: HikvisionApi,
    isapiChannelId: number,
    private readonly persist: () => void,
    private readonly log: Logger,
  ) {
    this.path = `/ISAPI/Image/channels/${isapiChannelId}/SupplementLight`;
    this.service = accessory.getServiceById(hap.Service.Lightbulb, 'whitelight') ||
      accessory.addService(hap.Service.Lightbulb, `${name} Light`, 'whitelight');

    this.service.getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.on)
      .onSet((value) => this.setOn(value));
    this.service.getCharacteristic(hap.Characteristic.Brightness)
      .onGet(() => this.brightness)
      .onSet((value) => this.setBrightness(value));
  }

  static remove(hap: HAP, accessory: PlatformAccessory): void {
    const existing = accessory.getServiceById(hap.Service.Lightbulb, 'whitelight');
    if (existing) {
      accessory.removeService(existing);
    }
  }

  async start(): Promise<void> {
    try {
      const caps = await this.api.getText(`${this.path}/capabilities`);
      const optMatch = caps.match(/<supplementLightMode\b[^>]*\bopt="([^"]*)"/i);
      const options = optMatch ? optMatch[1].split(',').map((o) => o.trim()).filter(Boolean) : [];
      this.whiteMode = WHITE_MODE_PREFERENCE.map((m) => options.find((o) => o.toLowerCase() === m.toLowerCase())).find(Boolean) ||
        options.find((o) => isWhiteMode(o));
      if (!this.whiteMode) {
        this.log.warn(`[Light] ${this.name}: the camera reports no white light mode (${options.join(', ') || 'none'}) - light disabled`);
        return;
      }
      this.irOrClosedModes = options.filter((o) => !isWhiteMode(o));
      await this.refresh();
    } catch (err) {
      this.log.warn(`[Light] ${this.name}: white light control is not available (${errorMessage(err)}) - light disabled. Turn off the White Light option for this camera if it has no white light.`);
      return;
    }

    this.supported = true;
    this.log.info(`[Light] ${this.name}: white light ready (mode "${this.whiteMode}")`);
    this.timer = setInterval(() => void this.refresh().catch((err) => this.log.debug(`[Light] ${this.name}: refresh failed: ${errorMessage(err)}`)), LIGHT_REFRESH_MS);
    this.timer.unref?.();
  }

  shutdown(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private brightnessTag(xml: string): string | undefined {
    if (getTag(xml, 'whiteLightBrightness') !== undefined) return 'whiteLightBrightness';
    if (getTag(xml, 'brightnessLimit') !== undefined) return 'brightnessLimit';
    return undefined;
  }

  /** Read the camera's current state and publish it to HomeKit. */
  private async refresh(): Promise<void> {
    const xml = await this.api.getText(this.path);
    const mode = getTag(xml, 'supplementLightMode');
    const tag = this.brightnessTag(xml);
    const level = tag ? parseInt(getTag(xml, tag) || '', 10) : NaN;
    if (!Number.isNaN(level) && level > 0) {
      this.brightness = Math.min(100, level);
    }
    this.on = isWhiteMode(mode) && (tag === undefined || Number.isNaN(level) || level > 0);
    if (this.stopped) return;
    this.service.updateCharacteristic(this.hap.Characteristic.On, this.on);
    this.service.updateCharacteristic(this.hap.Characteristic.Brightness, this.brightness);
  }

  private fail(action: string, err: unknown): never {
    this.log.error(`[Light] ${this.name}: could not ${action}: ${errorMessage(err)}`);
    throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    if (!this.supported || !this.whiteMode) {
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const turnOn = !!value;
    try {
      await this.serial.run(async () => {
        let xml = await this.api.getText(this.path);
        const current = getTag(xml, 'supplementLightMode');
        const context = contextOf(this.accessory);

        if (turnOn) {
          if (current && !isWhiteMode(current)) {
            context.light = { previousMode: current };
            this.persist();
          }
          xml = setTag(xml, 'supplementLightMode', this.whiteMode as string, LIGHT_ROOT);
          const tag = this.brightnessTag(xml);
          if (tag) {
            const level = parseInt(getTag(xml, tag) || '', 10);
            if (Number.isNaN(level) || level <= 0) {
              xml = setTag(xml, tag, String(this.brightness), LIGHT_ROOT);
            }
          }
          if (getTag(xml, 'mixedLightBrightnessRegulatMode') !== undefined) {
            xml = setTag(xml, 'mixedLightBrightnessRegulatMode', 'manual', LIGHT_ROOT);
          }
        } else {
          xml = setTag(xml, 'supplementLightMode', this.restoreMode(context), LIGHT_ROOT);
        }

        await this.api.put(this.path, xml, 'application/xml');
        if (!turnOn) {
          delete context.light;
          this.persist();
        }
        this.on = turnOn;
      });
      this.log.info(`[Light] ${this.name}: white light ${turnOn ? 'on' : 'off'}`);
    } catch (err) {
      this.fail(`switch the white light ${turnOn ? 'on' : 'off'}`, err);
    }
  }

  /** Mode to return to when the white light is switched off. */
  private restoreMode(context: DeterrenceContext): string {
    const previous = context.light?.previousMode;
    if (previous && !isWhiteMode(previous)) {
      return previous;
    }
    const ir = this.irOrClosedModes.find((o) => /ir/i.test(o));
    if (ir) {
      return ir;
    }
    return this.irOrClosedModes.find((o) => /^close$/i.test(o)) || 'close';
  }

  private async setBrightness(value: CharacteristicValue): Promise<void> {
    const level = Math.max(1, Math.min(100, Math.round(Number(value))));
    this.brightness = level;
    if (!this.supported || !this.on) {
      return;
    }
    try {
      await this.serial.run(async () => {
        let xml = await this.api.getText(this.path);
        const tag = this.brightnessTag(xml);
        if (!tag) {
          this.log.debug(`[Light] ${this.name}: camera has no brightness setting`);
          return;
        }
        xml = setTag(xml, tag, String(level), LIGHT_ROOT);
        if (getTag(xml, 'mixedLightBrightnessRegulatMode') !== undefined) {
          xml = setTag(xml, 'mixedLightBrightnessRegulatMode', 'manual', LIGHT_ROOT);
        }
        await this.api.put(this.path, xml, 'application/xml');
      });
    } catch (err) {
      this.fail('set the white light brightness', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Siren and strobe
// ---------------------------------------------------------------------------

export type AlarmKind = 'siren' | 'strobe';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

function alwaysOnSchedule(): unknown[] {
  return DAYS.map((week) => ({ week, TimeRange: [{ id: 1, beginTime: '00:00', endTime: '24:00' }] }));
}

function emptySchedule(): unknown[] {
  return DAYS.map((week) => ({ week, TimeRange: [] }));
}

function isAlwaysOn(list: unknown): boolean {
  return Array.isArray(list) && list.length >= 7 &&
    list.every((day: { TimeRange?: unknown[] }) => Array.isArray(day?.TimeRange) && day.TimeRange.length > 0);
}

/**
 * Siren or strobe as a HomeKit switch that switches itself off.
 *
 * The camera has no direct "sound the siren" call. This uses the linkage schedule method:
 * the camera must be pre-configured so that its audible warning or flashing light fires from an
 * always-active alarm (see the README), and the plugin opens or closes that linkage's weekly
 * schedule. The camera's original schedule is saved and restored, and the switch always turns
 * itself off after a maximum duration.
 */
export class AlarmLinkageFeature {
  private readonly service: Service;
  private readonly serial = new Serial();
  private readonly path: string;
  private readonly jsonKey: string;
  private readonly label: string;
  private active = false;
  private offTimer?: NodeJS.Timeout;
  private supported = false;

  constructor(
    private readonly hap: HAP,
    private readonly accessory: PlatformAccessory,
    private readonly name: string,
    private readonly kind: AlarmKind,
    private readonly api: HikvisionApi,
    isapiChannelId: number,
    private readonly maxSeconds: number,
    private readonly persist: () => void,
    private readonly log: Logger,
  ) {
    if (kind === 'siren') {
      this.path = '/ISAPI/Event/triggers/notifications/AudioAlarm?format=json';
      this.jsonKey = 'AudioAlarm';
      this.label = 'Siren';
    } else {
      this.path = `/ISAPI/Event/triggers/notifications/channels/${isapiChannelId}/whiteLightAlarm?format=json`;
      this.jsonKey = 'WhiteLightAlarm';
      this.label = 'Strobe';
    }

    this.service = accessory.getServiceById(hap.Service.Switch, kind) ||
      accessory.addService(hap.Service.Switch, `${name} ${this.label}`, kind);
    this.service.getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.active)
      .onSet((value) => this.setActive(!!value));
  }

  static remove(hap: HAP, accessory: PlatformAccessory, kind: AlarmKind): void {
    const existing = accessory.getServiceById(hap.Service.Switch, kind);
    if (existing) {
      accessory.removeService(existing);
    }
  }

  /**
   * Check the camera supports the linkage, and undo a switch-on left behind by a crash.
   */
  async start(): Promise<void> {
    try {
      await this.serial.run(async () => {
        const config = await this.readConfig();
        const saved = contextOf(this.accessory)[this.kind];
        if (saved) {
          this.log.warn(`[${this.label}] ${this.name}: restoring the camera's original schedule after an unclean shutdown`);
          await this.write(config, saved.timeRangeList, saved.durationTime);
          delete contextOf(this.accessory)[this.kind];
          this.persist();
        }
      });
    } catch (err) {
      this.log.warn(`[${this.label}] ${this.name}: ${this.label.toLowerCase()} control is not available (${errorMessage(err)}) - ${this.label.toLowerCase()} disabled. Turn off the ${this.label} option for this camera if it has none.`);
      return;
    }
    this.supported = true;
    this.log.info(`[${this.label}] ${this.name}: ready (switches off after ${this.maxSeconds}s). The camera must be pre-configured as described in the README.`);
  }

  shutdown(): void {
    if (this.offTimer) {
      clearTimeout(this.offTimer);
      this.offTimer = undefined;
    }
    if (this.active) {
      // Best effort: if this does not finish before exit, start() restores it on the next run.
      void this.setActive(false).catch(() => undefined);
    }
  }

  private async readConfig(): Promise<Record<string, Record<string, unknown>>> {
    const config = await this.api.getJson<Record<string, Record<string, unknown>>>(this.path);
    if (!config || typeof config[this.jsonKey] !== 'object' || config[this.jsonKey] === null) {
      throw new Error(`unexpected response (no ${this.jsonKey})`);
    }
    return config;
  }

  private async write(
    config: Record<string, Record<string, unknown>>,
    timeRangeList: unknown,
    durationTime?: unknown,
  ): Promise<void> {
    const inner = config[this.jsonKey];
    inner.TimeRangeList = timeRangeList;
    if (this.kind === 'strobe' && durationTime !== undefined) {
      inner.durationTime = durationTime;
    }
    await this.api.put(this.path, JSON.stringify(config), 'application/json');
  }

  private async setActive(turnOn: boolean): Promise<void> {
    if (!this.supported) {
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    try {
      await this.serial.run(async () => {
        const config = await this.readConfig();
        const inner = config[this.jsonKey];
        const context = contextOf(this.accessory);

        if (turnOn) {
          if (!context[this.kind]) {
            // Remember the camera's own schedule, unless it is already the always-on pattern
            // (left by an earlier run), in which case the safe baseline is an empty schedule.
            context[this.kind] = {
              timeRangeList: isAlwaysOn(inner.TimeRangeList) ? emptySchedule() : (inner.TimeRangeList ?? emptySchedule()),
              durationTime: inner.durationTime,
            };
            this.persist();
          }
          const duration = this.kind === 'strobe' ? Math.max(1, Math.min(60, this.maxSeconds)) : undefined;
          await this.write(config, alwaysOnSchedule(), duration);
          this.active = true;
          this.armOffTimer();
        } else {
          const saved = context[this.kind];
          await this.write(config, saved ? saved.timeRangeList : emptySchedule(), saved?.durationTime);
          delete context[this.kind];
          this.persist();
          this.active = false;
          this.clearOffTimer();
        }
      });
      this.log.info(`[${this.label}] ${this.name}: ${this.label.toLowerCase()} ${turnOn ? `on (auto-off in ${this.maxSeconds}s)` : 'off'}`);
    } catch (err) {
      this.log.error(`[${this.label}] ${this.name}: could not switch ${this.label.toLowerCase()} ${turnOn ? 'on' : 'off'}: ${errorMessage(err)}`);
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private armOffTimer(delayMs = this.maxSeconds * 1000): void {
    this.clearOffTimer();
    this.offTimer = setTimeout(() => {
      this.offTimer = undefined;
      this.setActive(false)
        .then(() => this.service.updateCharacteristic(this.hap.Characteristic.On, false))
        .catch(() => {
          // Keep trying: a failed switch-off must not leave the alarm armed.
          this.log.warn(`[${this.label}] ${this.name}: switch-off failed, retrying in 10s`);
          this.armOffTimer(10_000);
        });
    }, delayMs);
  }

  private clearOffTimer(): void {
    if (this.offTimer) {
      clearTimeout(this.offTimer);
      this.offTimer = undefined;
    }
  }
}
