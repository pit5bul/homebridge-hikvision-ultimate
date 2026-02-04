import { Logger } from 'homebridge';
import { HikvisionApi } from './api';
import { MOTION_EVENT_TYPES } from '../settings';

/**
 * Event listener callback type
 */
export type MotionEventCallback = (channelId: number, eventType: string, active: boolean) => void;

/**
 * Hikvision ISAPI event stream handler for motion detection
 * Connects to /ISAPI/Event/notification/alertStream
 */
export class HikvisionEvents {
  private eventStream: { close: () => void } | null = null;
  private buffer = '';
  private listeners: Map<number, MotionEventCallback[]> = new Map();
  private readonly debug: boolean;

  constructor(
    private readonly api: HikvisionApi,
    private readonly log: Logger,
    debug = false,
  ) {
    this.debug = debug;
  }

  /**
   * Start listening for motion events
   */
  start(): void {
    if (this.eventStream) {
      this.log.debug('Event stream already running');
      return;
    }

    this.log.info('🎬 Starting motion event stream...');
    this.log.info(`📡 Connecting to: /ISAPI/Event/notification/alertStream`);
    if (this.listeners.size > 0) {
      this.log.info(`👂 Registered listeners for ${this.listeners.size} camera(s)`);
    } else {
      this.log.warn('⚠️  No cameras registered for motion events!');
    }

    this.eventStream = this.api.openEventStream(
      '/ISAPI/Event/notification/alertStream',
      (chunk) => this.handleChunk(chunk),
      (err) => this.handleError(err),
      () => this.handleClose(),
    );
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (this.eventStream) {
      this.log.info('Stopping motion event stream');
      this.eventStream.close();
      this.eventStream = null;
    }
  }

  /**
   * Register a listener for a specific channel
   */
  onMotion(channelId: number, callback: MotionEventCallback): void {
    if (!this.listeners.has(channelId)) {
      this.listeners.set(channelId, []);
    }
    this.listeners.get(channelId)!.push(callback);
  }

  /**
   * Remove a listener for a specific channel
   */
  offMotion(channelId: number, callback: MotionEventCallback): void {
    const callbacks = this.listeners.get(channelId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Handle incoming data chunk from event stream
   */
  private handleChunk(chunk: string): void {
    // Log first chunk to confirm stream is working
    if (this.buffer.length === 0 && chunk.length > 0) {
      this.log.info('✅ Event stream connected and receiving data');
    }
    
    this.buffer += chunk;

    // Look for complete XML events
    // Events are separated by multipart boundaries
    const eventRegex = /<EventNotificationAlert[^>]*>[\s\S]*?<\/EventNotificationAlert>/g;
    let match;

    while ((match = eventRegex.exec(this.buffer)) !== null) {
      this.parseEvent(match[0]);
    }

    // Keep only unparsed data in buffer (last incomplete event)
    const lastEventEnd = this.buffer.lastIndexOf('</EventNotificationAlert>');
    if (lastEventEnd > -1) {
      this.buffer = this.buffer.substring(lastEventEnd + '</EventNotificationAlert>'.length);
    }

    // Prevent buffer from growing too large
    if (this.buffer.length > 100000) {
      this.log.warn('Event buffer overflow, clearing');
      this.buffer = '';
    }
  }

  /**
   * Parse a single event XML
   */
  private parseEvent(xml: string): void {
    try {
      // Extract channelID - try multiple tag variations
      let channelMatch = xml.match(/<channelID>(\d+)<\/channelID>/);
      if (!channelMatch) {
        // Try lowercase variant
        channelMatch = xml.match(/<channelId>(\d+)<\/channelId>/);
      }
      if (!channelMatch) {
        // Try dynamic channel ID (some NVR models)
        channelMatch = xml.match(/<dynChannelID>(\d+)<\/dynChannelID>/);
      }
      if (!channelMatch) {
        // Try inputIOPortID (for some NVR event types)
        channelMatch = xml.match(/<inputIOPortID>(\d+)<\/inputIOPortID>/);
      }
      
      if (!channelMatch) {
        // Log the problematic XML when debug enabled
        if (this.debug) {
          this.log.debug('❌ Event missing channelID/channelId/dynChannelID. Raw XML:');
          this.log.debug(xml);
        } else {
          this.log.debug('Event missing channelID (enable debugMotion to see raw XML)');
        }
        return;
      }
      const channelId = parseInt(channelMatch[1], 10);

      // Extract eventType
      const eventTypeMatch = xml.match(/<eventType>([^<]+)<\/eventType>/);
      if (!eventTypeMatch) {
        if (this.debug) {
          this.log.debug(`Event from channel ${channelId} missing eventType. Raw XML:`);
          this.log.debug(xml);
        } else {
          this.log.debug(`Event from channel ${channelId} missing eventType`);
        }
        return;
      }
      const eventType = eventTypeMatch[1];

      // Extract eventState (active/inactive)
      const stateMatch = xml.match(/<eventState>([^<]+)<\/eventState>/);
      const eventState = stateMatch ? stateMatch[1] : 'unknown';
      const active = stateMatch ? stateMatch[1].toLowerCase() === 'active' : true;

      // Log ALL events when debug enabled (before filtering)
      if (this.debug) {
        this.log.debug(`📨 Event received: channel=${channelId}, type=${eventType}, state=${eventState}`);
      }

      // Check if this is a motion-related event
      if (!MOTION_EVENT_TYPES.includes(eventType)) {
        if (this.debug) {
          this.log.debug(`⏭️  Ignoring non-motion event type: ${eventType} (not in supported list)`);
        }
        return;
      }

      this.log.info(`🚨 Motion event: channel=${channelId}, type=${eventType}, active=${active}`);

      // Notify listeners
      this.notifyListeners(channelId, eventType, active);
    } catch (err) {
      this.log.warn(`Failed to parse event: ${err}`);
      if (this.debug) {
        this.log.debug('Raw XML that failed to parse:');
        this.log.debug(xml);
      }
    }
  }

  /**
   * Notify registered listeners of a motion event
   */
  private notifyListeners(channelId: number, eventType: string, active: boolean): void {
    const callbacks = this.listeners.get(channelId);
    if (callbacks) {
      this.log.info(`📢 Notifying ${callbacks.length} listener(s) for channel ${channelId}`);
      for (const callback of callbacks) {
        try {
          callback(channelId, eventType, active);
        } catch (err) {
          this.log.error(`Error in motion callback: ${err}`);
        }
      }
    } else {
      this.log.warn(`⚠️  No listeners registered for channel ${channelId} (event type: ${eventType})`);
      if (this.listeners.size > 0) {
        const registeredChannels = Array.from(this.listeners.keys()).join(', ');
        this.log.warn(`   Registered channels: ${registeredChannels}`);
      }
    }
  }

  /**
   * Handle stream error
   */
  private handleError(err: Error): void {
    this.log.error(`Event stream error: ${err.message}`);
  }

  /**
   * Handle stream close
   */
  private handleClose(): void {
    this.log.debug('Event stream closed');
  }
}
