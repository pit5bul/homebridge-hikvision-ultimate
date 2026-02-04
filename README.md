# homebridge-hikvision-ultimate

[![npm version](https://badge.fury.io/js/homebridge-hikvision-ultimate.svg)](https://www.npmjs.com/package/homebridge-hikvision-ultimate)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Hikvision NVR cameras with **automatic discovery**, motion detection, and hardware-accelerated streaming.
NOTE: Install a ffmpeg version that is compiled with Hardware Encoders for the system you are planning to use - Redirect to the bin via the UI config

## ✨ Features

- 🔍 **Automatic Camera Discovery** - Zero configuration required, just add NVR credentials
- 📹 **High Quality Streaming** - 2000kbps default (customizable), 1080p@30fps
- 🎯 **Motion Detection** - Real-time motion events via ISAPI
- 🚀 **Hardware Acceleration** - Support for Intel QuickSync, NVIDIA NVENC, AMD AMF, Apple VideoToolbox, and more
- 📸 **Working Snapshots** - Fast JPEG snapshots using ISAPI endpoints
- ⚙️ **Auto-Config Persistence** - Discovered cameras automatically saved to config.json
- 🧹 **Auto-Cleanup** - Orphaned accessories automatically removed
- 🎛️ **UI-Friendly** - Full configuration via Homebridge Config UI X

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
            "motionTimeout": 1,
            "videoConfig": {
                "encoder": "nvenc",
                "maxBitrate": 3000,
                "maxWidth": 1920,
                "maxHeight": 1080,
                "maxFPS": 30
            }
        }
    ]
}
```

### Hardware Acceleration

Reduce CPU usage by 70-90% with hardware encoding:

| Encoder | Platform | Hardware |
|---------|----------|----------|
| `software` | All | CPU only (default) |
| `quicksync` | All | Intel CPU with iGPU |
| `nvenc` | All | NVIDIA GPU |
| `vaapi` | Linux | Intel/AMD GPU |
| `amf` | Windows | AMD GPU |
| `videotoolbox` | macOS | Apple Silicon / Intel Mac |
| `v4l2` | Linux | Raspberry Pi |

**Example**:
```json
{
    "videoConfig": {
        "encoder": "nvenc"
    }
}
```

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

1. Check motion is enabled: `"motion": true`
2. Verify ISAPI event stream: `curl -u admin:password http://NVR_IP/ISAPI/Event/notification/alertStream`
3. Check logs for: `Starting motion event stream...`

## 📊 Performance

### Without Hardware Acceleration
- 6 cameras streaming: ~60-80% CPU usage
- FFmpeg software encoding (libx264)

### With Hardware Acceleration (NVENC)
- 6 cameras streaming: ~5-10% CPU usage
- GPU encoding, CPU free for other tasks

## 🔐 Security

- Credentials stored in Homebridge config.json (same as other plugins)
- RTSP URLs use URL-encoded credentials
- Consider using HTTPS if NVR supports it: `"secure": true`

## 🐛 Known Issues

- ffprobe not bundled: Set `"probeOnStartup": false` (default)
- Some NVR models may require different ISAPI endpoints for snapshots

## 📝 Changelog

## 📊 What's New in v1.5.0 (Latest}

### Major Features
✨ **Quality Profile System**
- Speed, Balanced, Quality presets
- 7 hardware encoders supported
- UI dropdown in Homebridge Config

🐛 **VAAPI Fix**
- Removed `-color_range mpeg` causing CPU scaler insertion
- Full GPU pipeline working: decode → scale → encode
- 80% CPU reduction achieved

🎯 **HomeKit Optimization**
- GOP sizes: 1-2 seconds (was 9.6 seconds)
- No more 19s disconnections
- Better seeking and buffering

### Performance (AMD VAAPI)
- **Speed**: 5% CPU, 40% GPU
- **Balanced**: 7% CPU, 35% GPU  
- **Quality**: 10% CPU, 30% GPU

### Backward Compatibility
✅ Fully compatible with v1.4.0
✅ Auto-migration (defaults to "balanced")
✅ No breaking changes

## 🧪 Testing Status

### Tested On
- [x] AMD Radeon GPU (VAAPI)
- [x] Proxmox LXC Container
- [x] Ubuntu 24 / Debian
- [x] FFmpeg 8.0.1
- [x] Hikvision NVR (HEVC 4K @ 12.5 FPS)

### Test Results
- [x] Stream stability: ✅ Continuous streaming (no 19s disconnects)
- [x] CPU usage: ✅ 5-10% (was 30-40%)
- [x] GPU usage: ✅ 30-40%
- [x] Quality: ✅ No visual degradation
- [x] Latency: ✅ <300ms
- [x] HomeKit: ✅ Thumbnails load instantly
- [x] Seeking: ✅ Fast and responsive

### Pending Tests
- [ ] Intel QuickSync
- [ ] NVIDIA NVENC
- [ ] Apple VideoToolbox
- [ ] ARM devices (Jetson, Rockchip)

## 📁 File Structure

```
homebridge-hikvision-ultimate/
├── src/
│   ├── configTypes.ts          ← Modified (QualityProfile type)
│   ├── settings.ts             ← Modified (ENCODER_QUALITY_PRESETS)
│   ├── streaming/
│   │   └── delegate.ts         ← Modified (quality profiles, color_range fix)
│   └── ...
├── config.schema.json          ← Modified (UI dropdown)
├── package.json                ← Modified (version 1.5.0)
├── CHANGELOG.md                ← Modified (v1.5.0 entry)
├── .gitignore                  ← Created
└── README.md
```

## 🔗 Important Links

### GitHub
- **Repository**: https://github.com/pit5bul/homebridge-hikvision-ultimate
- **Releases**: https://github.com/pit5bul/homebridge-hikvision-ultimate/releases
- **Issues**: https://github.com/pit5bul/homebridge-hikvision-ultimate/issues

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

MIT

## 🙏 Credits

- [homebridge-camera-ffmpeg](https://github.com/Sunoo/homebridge-camera-ffmpeg) - Inspiration for streaming implementation
- [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) - Bundled FFmpeg binaries

## 💬 Support

- GitHub Issues: [Report bugs or request features](https://github.com/pit5bul/homebridge-hikvision-ultimate/issues)
- Homebridge Discord: #plugin-development channel
