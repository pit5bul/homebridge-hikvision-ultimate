import { Logger } from 'homebridge';
import { HikvisionApi } from './api';
/**
 * Event listener callback type
 */
export type MotionEventCallback = (channelId: number, eventType: string, active: boolean) => void;
/**
 * Hikvision ISAPI event stream handler for motion detection
 * Connects to /ISAPI/Event/notification/alertStream
 */
export declare class HikvisionEvents {
    private readonly api;
    private readonly log;
    private eventStream;
    private buffer;
    private listeners;
    private readonly debug;
    constructor(api: HikvisionApi, log: Logger, debug?: boolean);
    /**
     * Start listening for motion events
     */
    start(): void;
    /**
     * Stop listening for events
     */
    stop(): void;
    /**
     * Register a listener for a specific channel
     */
    onMotion(channelId: number, callback: MotionEventCallback): void;
    /**
     * Remove a listener for a specific channel
     */
    offMotion(channelId: number, callback: MotionEventCallback): void;
    /**
     * Handle incoming data chunk from event stream
     */
    private handleChunk;
    /**
     * Parse a single event XML
     */
    private parseEvent;
    /**
     * Notify registered listeners of a motion event
     */
    private notifyListeners;
    /**
     * Handle stream error
     */
    private handleError;
    /**
     * Handle stream close
     */
    private handleClose;
}
