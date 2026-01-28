"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeStream = probeStream;
const child_process_1 = require("child_process");
/**
 * Run ffprobe on a stream URL and return detected information
 */
async function probeStream(ffprobePath, streamUrl, timeout, log) {
    return new Promise((resolve) => {
        const args = [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-rtsp_transport', 'tcp',
            '-timeout', String(timeout * 1000), // ffprobe uses microseconds
            streamUrl,
        ];
        log.debug(`Running ffprobe: ${ffprobePath} ${args.join(' ')}`);
        const process = (0, child_process_1.spawn)(ffprobePath, args, { timeout });
        let stdout = '';
        let stderr = '';
        process.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        process.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        process.on('error', (err) => {
            log.warn(`ffprobe error: ${err.message}`);
            resolve(null);
        });
        process.on('close', (code) => {
            if (code !== 0) {
                log.debug(`ffprobe exited with code ${code}: ${stderr}`);
                resolve(null);
                return;
            }
            try {
                const result = JSON.parse(stdout);
                const detected = parseProbeResult(result);
                resolve(detected);
            }
            catch (err) {
                log.warn(`Failed to parse ffprobe output: ${err}`);
                resolve(null);
            }
        });
        // Handle timeout
        setTimeout(() => {
            if (!process.killed) {
                log.debug('ffprobe timeout - killing process');
                process.kill('SIGKILL');
            }
        }, timeout + 1000);
    });
}
/**
 * Parse ffprobe JSON result into DetectedStreamInfo
 */
function parseProbeResult(result) {
    const detected = {
        probedAt: new Date().toISOString(),
    };
    if (!result.streams || result.streams.length === 0) {
        return detected;
    }
    // Find video stream
    const videoStream = result.streams.find(s => s.codec_type === 'video');
    if (videoStream) {
        detected.videoCodec = videoStream.codec_name;
        detected.videoProfile = videoStream.profile;
        detected.width = videoStream.width;
        detected.height = videoStream.height;
        // Parse frame rate (format: "30/1" or "30000/1001")
        const fps = parseFrameRate(videoStream.r_frame_rate || videoStream.avg_frame_rate);
        if (fps) {
            detected.fps = fps;
        }
        if (videoStream.bit_rate) {
            detected.videoBitrate = parseInt(videoStream.bit_rate, 10);
        }
    }
    // Find audio stream
    const audioStream = result.streams.find(s => s.codec_type === 'audio');
    if (audioStream) {
        detected.audioCodec = audioStream.codec_name;
        if (audioStream.sample_rate) {
            detected.audioSampleRate = parseInt(audioStream.sample_rate, 10);
        }
        detected.audioChannels = audioStream.channels;
    }
    return detected;
}
/**
 * Parse frame rate string (e.g., "30/1", "30000/1001") to number
 */
function parseFrameRate(frameRate) {
    if (!frameRate) {
        return undefined;
    }
    const parts = frameRate.split('/');
    if (parts.length === 2) {
        const num = parseInt(parts[0], 10);
        const den = parseInt(parts[1], 10);
        if (den > 0) {
            return Math.round((num / den) * 100) / 100;
        }
    }
    const parsed = parseFloat(frameRate);
    return isNaN(parsed) ? undefined : parsed;
}
