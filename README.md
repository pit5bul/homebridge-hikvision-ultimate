# homebridge-hikvision-ultimate

[![npm version](https://badge.fury.io/js/homebridge-hikvision-ultimate.svg)](https://www.npmjs.com/package/homebridge-hikvision-ultimate)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Hikvision NVR cameras with **automatic discovery**, motion detection, and hardware-accelerated streaming.

## ✨ Features

- 🔍 **Automatic Camera Discovery** - Zero configuration required, just add NVR credentials
- 📹 **High Quality Streaming** - Hardware-accelerated with quality profiles (Speed/Balanced/Quality)
- 🎯 **Motion Detection** - Real-time motion events via ISAPI with enhanced debugging
- 🚀 **Hardware Acceleration** - Support for 7 encoders: VAAPI, QuickSync, NVENC, AMF, VideoToolbox, Jetson, RK MPP
- ⚡ **Quality Profiles** - One-click presets optimized for HomeKit streaming
- 🎬 **80% CPU Reduction** - Full GPU pipeline (decode → scale → encode) with VAAPI
- 📸 **Working Snapshots** - Fast JPEG snapshots using ISAPI endpoints
- ⚙️ **Auto-Config Persistence** - Discovered cameras automatically saved to config.json
- 🧹 **Auto-Cleanup** - Orphaned accessories automatically removed
- 🎛️ **UI-Friendly** - Full configuration via Homebridge Config UI X
- 🐛 **Enhanced Debugging** - Comprehensive motion detection diagnostics

## 🚀 Quick Start

### Installation

```bash
npm install -g homebridge-hikvision-ultimate
```

Or install via Homebridge Config UI X: Search for "Hikvision Ultimate"

### Minimal Configuration

```json
{
    "platforms": [
        {
            "platform": "HikvisionUltimate",
            "name": "Hikvision NVR",
            "host": "192.168.1.100",
            "username": "admin",
            "password": "your_password"
        }
    ]
}
```

That's it! The plugin will:
1. 🔍 Discover all cameras on your NVR
2. 💾 Save them to config.json automatically
3. 📹 Stream at 2000kbps with 1080p resolution
4. 📸 Generate snapshot URLs
5. 🎯 Enable motion detection

## 📖 Configuration Options

### Platform Settings

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | - | Must be `HikvisionUltimate` |
| `name` | Yes | - | Display name in Homebridge |
| `host` | Yes | - | NVR IP address or hostname |
| `username` | Yes | - | NVR username |
| `password` | Yes | - | NVR password |
| `port` | No | `80` | NVR HTTP port |
| `secure` | No | `false` | Use HTTPS |
| `streamType` | No | `mainstream` | Default stream: `mainstream`, `substream`, or `thirdstream` |
| `probeOnStartup` | No | `false` | Probe streams on startup (requires ffprobe) |
| `forceDiscovery` | No | `false` | Force re-discovery on every restart |

### Per-Camera Settings

After first discovery, customize individual cameras in the Homebridge UI:

```json
{
    "cameras": [
        {
            "channelId": 1,
            "name": "Front Door",
            "enabled": true,
            "motion": true,
            "motionTimeout": 30,
            "videoConfig": {
                "encoder": "vaapi",
                "qualityProfile": "balanced",
                "maxBitrate": 3000,
                "maxWidth": 1920,
                "maxHeight": 1080,
                "maxFPS": 30
            }
        }
    ]
}
```

### Quality Profiles (v1.5.0+)

Select encoding quality presets optimized for HomeKit streaming:

| Profile | Use Case | B-Frames | GOP Size | Performance |
|---------|----------|----------|----------|-------------|
| `speed` | Live viewing, multiple streams | 0 | 2s keyframes | ~40% GPU |
| `balanced` | General use (recommended) | 0-1 | 1.5s keyframes | ~35% GPU |
| `quality` | Recording, single stream | 2 | 1s keyframes | ~30% GPU |

**Example**:
```json
{
    "videoConfig": {
        "encoder": "vaapi",
        "qualityProfile": "balanced"
    }
}
```

### Hardware Acceleration

Reduce CPU usage by 70-90% with hardware encoding:

| Encoder | Platform | Hardware | Quality Profiles |
|---------|----------|----------|------------------|
| `software` | All | CPU only (default) | No |
| `vaapi` | Linux | Intel/AMD GPU | ✅ Yes |
| `quicksync` | All | Intel CPU with iGPU | ✅ Yes |
| `nvenc` | All | NVIDIA GPU | ✅ Yes |
| `amf` | Windows | AMD GPU | ✅ Yes |
| `videotoolbox` | macOS | Apple Silicon / Intel Mac | ✅ Yes |
| `jetson` | Linux | NVIDIA Jetson | ✅ Yes |
| `rkmpp` | Linux | Rockchip SoC | ✅ Yes |
| `v4l2` | Linux | Raspberry Pi | No |

**VAAPI Example (80% CPU reduction)**:
```json
{
    "videoConfig": {
        "encoder": "vaapi",
        "qualityProfile": "balanced"
    }
}
```

**Performance** (VAAPI on AMD GPU):
- Speed profile: 5% CPU, 40% GPU, 12.5 FPS
- Balanced profile: 7% CPU, 35% GPU, 12.5 FPS
- Quality profile: 10% CPU, 30% GPU, 10-12 FPS

## 🎯 How It Works

### First Run (Zero Config)
```
1. Plugin connects to NVR
2. Discovers all cameras via ISAPI
3. Generates RTSP URLs automatically
4. Saves cameras to config.json
5. Registers cameras in HomeKit
```

### Subsequent Runs
```
1. Loads cameras from config.json
2. Cleans up orphaned accessories
3. Restores cached cameras
4. Starts motion detection
5. Ready for streaming
```

## 📸 Stream Configuration

### Quality Presets

**Low (Mobile/Remote)**
```json
{
    "maxBitrate": 1000,
    "maxWidth": 1280,
    "maxHeight": 720,
    "maxFPS": 15
}
```

**Medium (Balanced)**
```json
{
    "maxBitrate": 2000,
    "maxWidth": 1920,
    "maxHeight": 1080,
    "maxFPS": 20
}
```

**High (Local Network)**
```json
{
    "maxBitrate": 4000,
    "maxWidth": 1920,
    "maxHeight": 1080,
    "maxFPS": 30
}
```

## 🔧 Troubleshooting

### Cameras Not Appearing

1. **Check logs** for discovery messages:
   ```
   [Hikvision NVR] Found 6 channel(s) on NVR
   [Hikvision NVR] Discovered new camera: Front Door (Channel 1)
   ```

2. **Verify NVR credentials** are correct

3. **Check network** - NVR must be accessible from Homebridge server

### Snapshots Not Working

The plugin uses the ISAPI endpoint: `/ISAPI/Streaming/channels/{channelId}01/picture`

If snapshots timeout:
1. Verify endpoint works: `curl -u admin:password http://NVR_IP/ISAPI/Streaming/channels/101/picture --output test.jpg`
2. Check NVR firmware is up to date
3. Try substream: `"streamType": "substream"`

### High CPU Usage

Enable hardware acceleration:
1. Go to camera settings in Homebridge UI
2. Set "Hardware Encoder" to match your hardware
3. Restart Homebridge
4. Check logs for: `Camera X using nvenc encoder`

### Motion Detection Not Working

**v1.5.1+ Enhanced Debugging**

1. **Enable debug mode**:
   ```json
   {
       "debugMotion": true
   }
   ```

2. **Check startup logs** for:
   ```
   🎬 Starting motion event stream...
   📡 Connecting to: /ISAPI/Event/notification/alertStream
   👂 Registered listeners for X camera(s)
   ✅ Event stream connected and receiving data
   ```

3. **Trigger motion** and look for:
   ```
   📨 Event received: channel=X, type=VMD, state=active
   🚨 Motion event: channel=X, type=VMD, active=true
   📢 Notifying 1 listener(s) for channel X
   Motion detected: [Camera Name]
   ```

4. **Common issues**:
   - **"Event missing channelID"** (v1.5.0) - Fixed in v1.5.1
   - **Rapid flapping** (on/off every second) - Increase `motionTimeout` to 30-60 seconds
   - **Wrong camera triggers** - Verify channel IDs with debug logs

5. **Manual test** (optional):
   ```bash
   curl -u admin:password --digest --no-buffer \
     http://NVR_IP/ISAPI/Event/notification/alertStream
   ```
   Wave in front of camera - you should see XML events

6. **NVR Configuration**:
   - Enable motion detection on NVR
   - Draw detection zones
   - Enable "Notify Surveillance Center"

## 📊 Performance

### Without Hardware Acceleration
- 6 cameras streaming: ~60-80% CPU usage
- FFmpeg software encoding (libx264)
- Single-threaded per stream

### With Hardware Acceleration + Quality Profiles (v1.5.0+)

**VAAPI on AMD GPU (Proxmox LXC)**:
- Speed profile: 5% CPU, 40% GPU per stream
- Balanced profile: 7% CPU, 35% GPU per stream
- Quality profile: 10% CPU, 30% GPU per stream
- **80% CPU reduction** vs software encoding

**NVENC on NVIDIA GPU**:
- 6 cameras streaming: ~5-10% CPU usage
- GPU encoding, CPU free for other tasks
- Near-zero latency encoding

**Key Improvements**:
- Full GPU pipeline (decode → scale → encode)
- HomeKit-optimized GOP sizes (1-2s keyframes)
- Stable streaming with no disconnections
- Quality profiles match different use cases

## 🔐 Security

- Credentials stored in Homebridge config.json (same as other plugins)
- RTSP URLs use URL-encoded credentials
- Consider using HTTPS if NVR supports it: `"secure": true`

## 🐛 Known Issues

- ffprobe not bundled: Set `"probeOnStartup": false` (default)
- Some NVR models may require different ISAPI endpoints for snapshots

## 📝 Changelog
### v1.5.3
- 🐛 **Fixed**:`-f rawvideo` removal (video now plays!)

### v1.5.2
- 🐛 **Fixed**:-color_range mpeg` for software encoding
- ⚠️ Exposed videoFormat bug (video doesn't play)

### v1.5.1 (2026-02-05) - Latest
- 🐛 **Fixed**: Channel ID parsing for multiple XML tag variants (channelID, channelId, dynChannelID, inputIOPortID)
- 🐛 **Fixed**: "Event missing channelID" errors on some NVR models
- ✨ **Added**: Enhanced debug logging with emoji indicators and full raw XML output
- ✨ **Added**: Comprehensive startup diagnostics for motion detection
- ✨ **Added**: Better error messages with actionable guidance
- 📚 **Added**: Motion detection troubleshooting guide

### v1.5.0 (2026-02-04)
- 🚀 **Added**: Quality profile system (Speed/Balanced/Quality) for all hardware encoders
- 🚀 **Added**: Support for 7 hardware encoders (VAAPI, QuickSync, NVENC, AMF, VideoToolbox, Jetson, RK MPP)
- 🐛 **Fixed**: VAAPI filter chain (removed `-color_range mpeg` causing CPU scaler insertion)
- 🐛 **Fixed**: HomeKit GOP sizes optimized to 1-2s keyframes (was 9.6s)
- ⚡ **Performance**: 80% CPU reduction with proper VAAPI GPU pipeline
- ⚡ **Performance**: Full GPU processing (decode → scale → encode)
- 🎯 **Fixed**: Stream stability (no more 19s disconnections)
- 📚 **Added**: Quality profiles documentation and user guide

### v1.2.0
- ✅ Auto-save discovered cameras to config.json
- ✅ Improved cleanup with better logging
- ✅ Enhanced first-run experience
- ✅ Better error messages and user guidance
- ✅ Hardware acceleration dropdown in UI

### v1.1.1
- ✅ Auto-cleanup before accessory registration
- ✅ Warning for forceDiscovery with existing cameras
- ✅ Comprehensive logging for troubleshooting

### v1.1.0
- ✅ Fixed bitrate (2000kbps default)
- ✅ Working snapshots (correct ISAPI endpoint)
- ✅ Hardware acceleration support (7 encoders)
- ✅ Enhanced logging (shows URLs and settings)

### v1.0.0
- Initial release
- NVR auto-discovery via ISAPI
- Motion detection support
- FFmpeg streaming

## 🤝 Contributing

Issues and pull requests welcome! Please test thoroughly before submitting.

## 📜 License

Personal‑use, Non‑Commercial license

## 🙏 Credits

- [homebridge-camera-ffmpeg](https://github.com/Sunoo/homebridge-camera-ffmpeg) - Inspiration for streaming implementation
- [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) - Bundled FFmpeg binaries

## 💬 Support

- GitHub Issues: [Report bugs or request features](https://github.com/pit5bul/homebridge-hikvision-ultimate/issues)
- Homebridge Discord: #plugin-development channel
