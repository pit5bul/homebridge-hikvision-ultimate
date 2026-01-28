import { Logger } from 'homebridge';
import { DetectedStreamInfo } from '../configTypes';
/**
 * Run ffprobe on a stream URL and return detected information
 */
export declare function probeStream(ffprobePath: string, streamUrl: string, timeout: number, log: Logger): Promise<DetectedStreamInfo | null>;
