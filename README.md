# homebridge-hikvision-ultimate

[![npm version](https://badge.fury.io/js/homebridge-hikvision-ultimate.svg)](https://www.npmjs.com/package/homebridge-hikvision-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-hikvision-ultimate)](https://www.npmjs.com/package/homebridge-hikvision-ultimate)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Hikvision NVR cameras with **automatic discovery**, motion detection, and hardware-accelerated streaming.

## Features

### 🔍 Automatic Discovery
- Zero-configuration camera setup
- Automatically detects all cameras connected to your Hikvision NVR
- Auto-generates optimal RTSP URLs for each camera
- Saves discovered cameras to config.json automatically

### 📹 High-Quality Streaming
- 1080p @ 30fps streaming to HomeKit
- Hardware acceleration support (reduces CPU usage by 75-80%)
- Software encoding fallback for immediate operation
- Configurable bitrate and resolution per camera

### 🎯 Motion Detection
- Real-time motion events via ISAPI event streams
- Native Hikvision motion detection (no video analysis needed)
- Configurable motion timeout
- Triggers HomeKit motion sensor

### 🚀 Hardware Acceleration
- **VAAPI** - Intel/AMD GPUs on Linux
- **QuickSync** - Intel integrated graphics
- **NVENC** - NVIDIA GPUs
- **AMF** - AMD GPUs on Windows
- **VideoToolbox** - Apple Silicon and Intel Macs
- **V4L2** - Raspberry Pi 4+

### 📸 Fast Snapshots
- ISAPI-based snapshots (instant response)
- No video decoding required
- Optimized for HomeKit responsiveness

### 🎥 HomeKit Secure Video (HKSV)
- Full recording support with iCloud storage
- Prebuffering for instant recording start
- Efficient vcodec copy mode
- Activity zones and notifications

### ⚙️ Easy Configuration
- Homebridge Config UI X integration
- Visual camera configuration
- Live config updates without restart
- Automatic cleanup of orphaned accessories

## Installation

### 1. Install Homebridge

If you haven't already, install Homebridge:
```bash
sudo npm install -g --unsafe-perm homebridge
```

Or follow the [official installation guides](https://github.com/homebridge/homebridge/wiki).

### 2. Install Plugin

```bash
sudo npm install -g homebridge-hikvision-ultimate
```

### 3. Configure via UI

1. Open Homebridge Config UI X
2. Navigate to Plugins → homebridge-hikvision-ultimate
3. Click Settings
4. Enter your NVR connection details:
   - NVR IP address/hostname
   - Username (admin user with camera access)
   - Password
5. Save and restart Homebridge

The plugin will automatically discover all cameras and add them to your config.

## Quick Start

### Minimum Configuration

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

### First Run

1. Add the minimum configuration
2. Restart Homebridge
3. Watch the logs - you'll see:
   ```
   [Hikvision NVR] 🔍 No cameras configured - starting auto-discovery...
   [Hikvision NVR] ✅ Found 4 channel(s) on NVR
   [Hikvision NVR] Discovered new camera: Front Door (Channel 1)
   [Hikvision NVR] Discovered new camera: Backyard (Channel 2)
   ```
4. Cameras are automatically saved to your config.json
5. Add cameras to HomeKit using your Homebridge PIN

### Adding New Cameras

If you add cameras to your NVR later:

1. Go to plugin settings
2. Enable **Force Discovery**
3. Restart Homebridge
4. New cameras will be discovered and added
5. Disable Force Discovery after successful discovery

## Hardware Acceleration

### Why Hardware Acceleration?

By default, the plugin uses software encoding which:
- ✅ Works immediately out of the box
- ❌ Consumes 80-100% CPU per camera stream
- ❌ Not suitable for multiple cameras

With hardware acceleration:
- ✅ Reduces CPU usage by 75-80%
- ✅ Supports multiple camera streams
- ✅ Lower power consumption
- ✅ Better system performance

### Setup

The bundled `ffmpeg-for-homebridge` package **does not contain hardware acceleration codecs**. To enable hardware acceleration:

#### 1. Install FFmpeg with Hardware Support

You must install or compile FFmpeg with the appropriate hardware codecs for your system (VAAPI, NVENC, QuickSync, AMF, VideoToolbox). This is system-specific and beyond the scope of this plugin.

**Verify your FFmpeg has hardware support:**
```bash
# Check for VAAPI
ffmpeg -encoders | grep vaapi

# Check for NVENC
ffmpeg -encoders | grep nvenc

# Check for QuickSync
ffmpeg -encoders | grep qsv
```

#### 2. Configure FFmpeg Path

**Via Homebridge Config UI X:**
1. Scroll to bottom → **FFmpeg Configuration** section
2. Set **Custom FFmpeg Path**: `/usr/bin/ffmpeg` (or your FFmpeg location)
3. Restart Homebridge

**Via config.json:**
```json
{
  "platform": "HikvisionUltimate",
  "name": "Hikvision NVR",
  "host": "192.168.1.100",
  "username": "admin",
  "password": "your_password",
  "videoProcessor": "/usr/bin/ffmpeg",
  "cameras": [...]
}
```

#### 3. Select Hardware Encoder Per Camera

1. Go to camera settings → **Video Settings**
2. Set **Hardware Encoder** to your GPU type:
   - `vaapi` - Intel/AMD GPUs on Linux
   - `qsv` - Intel QuickSync
   - `h264_nvenc` - NVIDIA GPUs
   - `h264_videotoolbox` - Apple Silicon/Intel Macs
   - `h264_amf` - AMD GPUs on Windows
   - `v4l2` - Raspberry Pi 4+

#### 4. Optional: Quality Profile

By default, hardware encoders use their built-in defaults (recommended).

You can optionally select a quality profile:
- **Use Encoder Defaults** - Let encoder optimize (recommended)
- **Speed** - Fastest encoding, lower quality
- **Balanced** - Medium speed and quality
- **Quality** - Best quality, slower encoding

### Verification

Check Homebridge logs:
```
[Hikvision NVR] Using FFmpeg: /usr/bin/ffmpeg
[Hikvision NVR] FFmpeg version: 6.0
[Front Door] Hardware encoder: vaapi
```

CPU usage should drop from 80-100% to 15-25% per camera stream.

### Default Encoder Options

**Software Encoding (libx264):**
- Automatically uses: `-preset ultrafast -tune zerolatency`
- Optimized for low-latency streaming

**Hardware Encoding:**
- With no quality profile: Uses encoder defaults (recommended)
- With quality profile: Applies profile-specific GOP size and B-frame settings
- Custom options: Can override in **Advanced Video** section

## HomeKit Secure Video (HKSV)

### Requirements

- iCloud+ subscription with sufficient storage
- HomeKit Home Hub (Apple TV, HomePod, or iPad)
- iOS 13.2 or later

### Setup

1. Go to camera settings → **HomeKit Secure Video (HKSV)**
2. Enable **Recording**
3. Optional: Enable **Prebuffer** for instant recording start
4. Set **Prebuffer Length** (default: 4000ms)
5. Restart Homebridge
6. In the Home app:
   - Open camera settings
   - Enable recording
   - Configure activity zones and notifications

### How It Works

- Uses separate recording pipeline from live streaming
- Prebuffer maintains rolling 4-second buffer
- H.264 baseline profile for HomeKit compatibility
- Fragmented MP4 format for efficient storage
- Motion events trigger recording with prebuffer content

## Configuration Reference

### Platform Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `name` | string | "Hikvision NVR" | Platform name in Homebridge logs |
| `host` | string | **required** | NVR IP address or hostname |
| `port` | number | 80 | NVR HTTP port |
| `secure` | boolean | false | Use HTTPS for NVR connection |
| `username` | string | **required** | NVR username (admin) |
| `password` | string | **required** | NVR password |
| `forceDiscovery` | boolean | false | Force re-discovery of cameras |
| `videoProcessor` | string | (bundled) | Path to custom FFmpeg binary |

### Camera Settings

#### Basic
- `name` - Camera display name in HomeKit
- `enabled` - Enable/disable camera
- `source` - FFmpeg source options (auto-generated)
- `stillImageSource` - Snapshot source (auto-generated)

#### Video Settings
- `maxWidth` - Maximum width (default: 1920)
- `maxHeight` - Maximum height (default: 1080)
- `maxBitrate` - Maximum bitrate in kbps (default: 2000)
- `minBitrate` - Minimum bitrate in kbps (default: 0)
- `encoder` - Hardware encoder type
- `qualityProfile` - Optional quality preset
- `audio` - Enable audio streaming (default: true)

#### HKSV
- `recording` - Enable HomeKit Secure Video
- `prebuffer` - Enable prebuffering
- `prebufferLength` - Prebuffer duration in ms (default: 4000)

#### Motion Detection
- `motion` - Enable motion sensor (default: true)
- `motionTimeout` - Motion reset timeout in seconds (default: 1)

#### Advanced Video
- `encoderOptions` - Custom FFmpeg encoder options
- `videoFilter` - Custom FFmpeg video filters
- `mapvideo` - Video stream mapping
- `mapaudio` - Audio stream mapping
- `packetSize` - RTP packet size (default: 1316)
- `debug` - Show FFmpeg output in logs

#### HomeKit Info
- `manufacturer` - Manufacturer name
- `model` - Model name
- `serialNumber` - Serial number
- `firmwareRevision` - Firmware version
- `unbridge` - Run as separate accessory

## Advanced Configuration

### Multiple Stream Types

Hikvision cameras provide multiple streams:
- **Mainstream** (101) - High quality, 1080p
- **Substream** (102) - Lower quality, reduced CPU
- **Third Stream** (103) - Lowest quality

The plugin uses mainstream by default. To manually override:

```json
{
  "cameras": [{
    "channelId": 1,
    "name": "Front Door",
    "videoConfig": {
      "source": "-rtsp_transport tcp -i rtsp://admin:pass@192.168.1.100/Streaming/Channels/102"
    }
  }]
}
```

### Custom Encoder Options

Override encoder settings for specific use cases:

```json
{
  "cameras": [{
    "videoConfig": {
      "encoder": "vaapi",
      "encoderOptions": "-quality 1 -g 30 -bf 0"
    }
  }]
}
```

### Multi-GPU Systems

If you have multiple GPUs, specify which to use (advanced users can add this to config.json manually):

```json
{
  "cameras": [{
    "videoConfig": {
      "encoder": "vaapi",
      "hwaccelDevice": "/dev/dri/renderD129"
    }
  }]
}
```

## Troubleshooting

### Cameras Not Appearing in HomeKit

1. **Check Homebridge logs** for errors
2. **Verify NVR credentials** - admin user required
3. **Check network connectivity** to NVR
4. **Enable Force Discovery** to refresh cameras
5. **Remove cached accessories** via Homebridge UI

### High CPU Usage

1. **Enable hardware acceleration** (see Hardware Acceleration section)
2. **Reduce resolution** - Set maxWidth/maxHeight to 1280x720
3. **Lower bitrate** - Reduce maxBitrate to 1000-1500
4. **Use substream** - Manually configure source to use channel 102

### Motion Detection Not Working

1. **Check motion is enabled** in camera config
2. **Verify ISAPI events** are working on NVR
3. **Check Homebridge logs** for "Motion detected" messages

### Snapshots Slow or Failing

1. **Verify stillImageSource** is using ISAPI endpoint
2. **Check network latency** to NVR
3. **Try mainstream instead of substream** for snapshots

### Audio Issues

1. **Verify camera supports audio** in NVR settings
2. **Check audio codec** (AAC-eld or Opus required)
3. **Some cameras have broken AAC streams** - disable audio if errors persist

### HKSV Recording Not Working

1. **Verify iCloud+ subscription** with sufficient storage
2. **Check Home Hub** is available and functioning
3. **Enable recording** in Home app camera settings
4. **Verify prebuffer is enabled** in plugin config
5. **Check Homebridge logs** for HKSV-related messages

## Development

### Building from Source

```bash
git clone https://github.com/pit5bul/homebridge-hikvision-ultimate.git
cd homebridge-hikvision-ultimate
npm install
npm run build
npm link
```

### Testing

```bash
# Watch mode for development
npm run watch

# Lint code
npm run lint
```

## Support

- **Issues**: [GitHub Issues](https://github.com/pit5bul/homebridge-hikvision-ultimate/issues)
- **Homebridge Discord**: [#plugin-development](https://discord.gg/homebridge)
- **Funding**: [Buy Me a Coffee](https://buymeacoffee.com/pit5bul)

## Credits

- **Author**: pit5bul
- **Inspired by**: homebridge-camera-ffmpeg
- **FFmpeg**: The FFmpeg team for the incredible video processing library

## License

PERSONAL‑USE LICENSE AGREEMENT - see [LICENSE](LICENSE) file for details
