import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Resolve the path to ffmpeg binary
 * Priority:
 * 1. User-specified path (videoProcessor config)
 * 2. ffmpeg-for-homebridge bundled binary
 * 3. System ffmpeg
 */
export function resolveFfmpegPath(customPath?: string): string {
  // 1. User-specified path
  if (customPath && customPath.length > 0) {
    if (existsSync(customPath)) {
      return customPath;
    }
    // User specified a path but it doesn't exist - try it anyway (might be in PATH)
    return customPath;
  }

  // 2. Try ffmpeg-for-homebridge
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegForHomebridge = require('ffmpeg-for-homebridge');
    if (ffmpegForHomebridge && typeof ffmpegForHomebridge === 'string') {
      return ffmpegForHomebridge;
    }
  } catch {
    // ffmpeg-for-homebridge not available or failed to load
  }

  // 3. Fall back to system ffmpeg
  return 'ffmpeg';
}

/**
 * Resolve the path to ffprobe binary
 * Attempts to find ffprobe in the same directory as ffmpeg
 */
export function resolveFfprobePath(ffmpegPath: string): string {
  // If ffmpegPath is just 'ffmpeg', try 'ffprobe'
  if (ffmpegPath === 'ffmpeg') {
    return 'ffprobe';
  }

  // Try to find ffprobe in the same directory as ffmpeg
  const ffmpegDir = dirname(ffmpegPath);
  const ffprobePath = join(ffmpegDir, 'ffprobe');

  if (existsSync(ffprobePath)) {
    return ffprobePath;
  }

  // Try with .exe extension for Windows
  const ffprobeExePath = join(ffmpegDir, 'ffprobe.exe');
  if (existsSync(ffprobeExePath)) {
    return ffprobeExePath;
  }

  // Fall back to system ffprobe
  return 'ffprobe';
}

/**
 * Check if ffmpeg/ffprobe is available and working
 */
export async function checkFfmpegAvailable(path: string): Promise<{ available: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const process = spawn(path, ['-version'], { timeout: 5000 });

    let output = '';

    process.stdout?.on('data', (data) => {
      output += data.toString();
    });

    process.on('error', (err) => {
      resolve({ available: false, error: err.message });
    });

    process.on('close', (code) => {
      if (code === 0) {
        // Extract version from first line
        const versionMatch = output.match(/version\s+(\S+)/i);
        resolve({
          available: true,
          version: versionMatch ? versionMatch[1] : 'unknown',
        });
      } else {
        resolve({ available: false, error: `Exit code: ${code}` });
      }
    });
  });
}
