/**
 * Resolve the path to ffmpeg binary
 * Priority:
 * 1. User-specified path (videoProcessor config)
 * 2. ffmpeg-for-homebridge bundled binary
 * 3. System ffmpeg
 */
export declare function resolveFfmpegPath(customPath?: string): string;
/**
 * Resolve the path to ffprobe binary
 * Attempts to find ffprobe in the same directory as ffmpeg
 */
export declare function resolveFfprobePath(ffmpegPath: string): string;
/**
 * Check if ffmpeg/ffprobe is available and working
 */
export declare function checkFfmpegAvailable(path: string): Promise<{
    available: boolean;
    version?: string;
    error?: string;
}>;
