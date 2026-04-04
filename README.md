# homebridge-hikvision-ultimate

[![npm version](https://badge.fury.io/js/homebridge-hikvision-ultimate.svg)](https://www.npmjs.com/package/homebridge-hikvision-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-hikvision-ultimate)](https://www.npmjs.com/package/homebridge-hikvision-ultimate)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

> **Official Homebridge Plugin** — listed in the [Homebridge Plugin Repository](https://www.npmjs.com/package/homebridge-hikvision-ultimate) and verified by the Homebridge team.

Homebridge plugin for Hikvision NVR cameras with **automatic ISAPI discovery**, motion detection, and hardware-accelerated streaming.

## What's New in v2.1.4

- **Stream Type Override removed from UI** — configure stream type globally via Default Stream Type. Advanced users can still set `streamType` per-camera in config.json directly.
- **Security patch** — resolved `micromatch` Method Injection vulnerability in dev dependencies.

---

---

## Features

### 🔍 Automatic Discovery
- Zero-configuration camera setup — just provide NVR IP, username and password
- Automatically detects all cameras connected to your Hikvision NVR via ISAPI
- Auto-generates RTSP URLs and snapshot sources for each camera
- Saves discovered cameras to config.json automatically

### 📹 High-Quality Streaming
- Up to 1080p @ 30fps streaming to HomeKit
- Simple quality preset selection (720p / 1080p / 1080p HQ)
- Hardware acceleration support — reduces CPU usage by 75–90%
- Software encoding fallback that works everywhere

### 🎯 Motion Detection
- Real-time motion events via ISAPI alert stream
- Native Hikvision motion detection — no video analysis needed
- Supports VMD, line crossing, intrusion, region entrance/exit, tamper events
- Configurable motion timeout per camera

### 🚀 Hardware Acceleration
- **VAAPI** — Intel/AMD GPUs on Linux (full GPU pipeline: decode→scale→encode)
- **QuickSync** — Intel integrated graphics
- **NVENC** — NVIDIA GPUs
- **AMF** — AMD GPUs
- **VideoToolbox** — Apple Silicon and Intel Macs
- **V4L2** — Raspberry Pi 4+

### 📸 Snapshots
- ISAPI-based snapshots for instant response
- No video decoding required

### 🎥 HomeKit Secure Video (HKSV)
- Full HKSV recording support with iCloud storage
- Optional prebuffering for pre-motion capture (2–8 seconds)
- Requires iCloud+ plan and HomeKit hub (HomePod, Apple TV, or iPad)

---

## Installation

### Via Homebridge UI (Recommended)

Search for `homebridge-hikvision-ultimate` in the Homebridge UI plugin browser and click Install.

### Via CLI

```bash
npm install -g homebridge-hikvision-ultimate
```

---

## Quick Start

1. Install the plugin
2. In Homebridge UI → Plugins → Hikvision Ultimate → Settings:
   - Enter your NVR IP address, username and password
3. Restart Homebridge
4. Cameras are auto-discovered and added to HomeKit

That's it. No manual camera configuration required.

---

## Configuration

### Minimal Configuration

```json
{
  "platform": "HikvisionUltimate",
  "name": "Hikvision NVR",
  "host": "192.168.1.100",
  "username": "admin",
  "password": "your-password"
}
```

### Full Platform Options

| Option | Default | Description |
|--------|---------|-------------|
| `host` | — | NVR IP address or hostname (required) |
| `port` | `80` | NVR HTTP port |
| `secure` | `false` | Use HTTPS |
| `username` | — | NVR username (required) |
| `password` | — | NVR password (required) |
| `streamType` | `mainstream` | Default stream: `mainstream`, `substream`, `thirdstream` |
| `forceDiscovery` | `false` | Re-discover all cameras on next restart |
| `interfaceName` | — | Network interface for streaming (auto-detect if empty) |
| `videoProcessor` | — | Path to custom FFmpeg binary (required for hardware encoders) |
| `probeOnStartup` | `false` | Run ffprobe on all cameras at startup |
| `probeTimeout` | `10000` | ffprobe timeout in milliseconds |
| `debugMotion` | `false` | Log all raw motion events |

### Per-Camera Options

| Option | Default | Description |
|--------|---------|-------------|
| `name` | — | Camera display name in HomeKit |
| `channelId` | — | NVR channel number (auto-populated) |
| `enabled` | `true` | Set false to exclude from HomeKit |
| `streamType` | — | Override global stream type for this camera |
| `motion` | `true` | Enable motion sensor |
| `motionTimeout` | `1` | Seconds before motion sensor resets (0 = manual) |

### Per-Camera Video Options (`videoConfig`)

| Option | Default | Description |
|--------|---------|-------------|
| `qualityPreset` | `1080p-standard` | `720p-standard`, `1080p-standard`, `1080p-hq` |
| `audio` | `true` | Enable audio |
| `copyAudio` | `false` | Copy audio without re-encoding (works if camera outputs AAC) |
| `vflip` | `false` | Flip video vertically |
| `hflip` | `false` | Flip video horizontally |
| `encoder` | `software` | `software`, `vaapi`, `nvenc`, `quicksync`, `amf`, `videotoolbox`, `v4l2` |
| `qualityProfile` | `""` | Hardware encoder profile: `speed`, `balanced`, `quality` |
| `hwaccelDevice` | `/dev/dri/renderD128` | VAAPI device path |
| `recording` | `false` | Enable HKSV recording |
| `unbridge` | `false` | Run as separate accessory (recommended with HKSV) |
| `prebuffer` | `false` | Enable pre-motion buffer |
| `prebufferLength` | `4000` | Buffer duration in ms: `2000`, `4000`, `6000`, `8000` |
| `packetSize` | `1316` | RTP packet size (try `564` if video is choppy) |
| `debug` | `false` | Log full FFmpeg output |

---

## Hardware Acceleration

> **Important:** The bundled FFmpeg does **not** include hardware encoder support. You must install a custom FFmpeg with the required codecs compiled in, and set the `videoProcessor` path in Global FFmpeg settings.

### VAAPI (Intel/AMD on Linux)

```bash
# Install FFmpeg with VAAPI support
sudo apt install ffmpeg

# Verify VAAPI support
ffmpeg -hwaccels | grep vaapi

# Add to Homebridge config
"videoProcessor": "/usr/bin/ffmpeg",
"encoder": "vaapi"
```

The VAAPI pipeline uses full GPU acceleration: hardware decode → GPU scale → hardware encode. CPU usage typically drops from 40–80% to 5–15%.

### NVENC (NVIDIA)

```bash
# Requires NVIDIA drivers and FFmpeg compiled with NVENC
"videoProcessor": "/usr/local/bin/ffmpeg",
"encoder": "nvenc"
```

### QuickSync (Intel integrated GPU)

```bash
"videoProcessor": "/usr/bin/ffmpeg",
"encoder": "quicksync"
```

### VideoToolbox (macOS)

```bash
"videoProcessor": "/usr/local/bin/ffmpeg",
"encoder": "videotoolbox"
```

### Raspberry Pi V4L2

```bash
"videoProcessor": "/usr/bin/ffmpeg",
"encoder": "v4l2"
```

---

## HomeKit Secure Video (HKSV)

HKSV records motion-triggered clips to iCloud, encrypted end-to-end.

**Requirements:**
- iCloud+ plan (50GB for 1 camera, 200GB for up to 5 cameras)
- HomeKit hub (HomePod mini/2, Apple TV 4K, or iPad set as hub)
- Motion detection enabled on the camera

**Recommended per-camera config for HKSV:**

```json
{
  "name": "Front Door",
  "channelId": 1,
  "motion": true,
  "videoConfig": {
    "recording": true,
    "unbridge": true,
    "prebuffer": true,
    "prebufferLength": 4000
  }
}
```

> Unbridging cameras (`unbridge: true`) is strongly recommended for HKSV — it gives each camera its own HomeKit accessory and significantly improves recording reliability.

---

## Motion Detection

Motion events are received via the ISAPI alert stream (`/ISAPI/Event/notification/alertStream`). The following event types are supported:

| Event | Description |
|-------|-------------|
| `VMD` | Video Motion Detection |
| `linedetection` | Line Crossing |
| `fielddetection` | Intrusion Detection |
| `regionEntrance` | Region Entrance |
| `regionExiting` | Region Exiting |
| `shelteralarm` | Video Tampering |

Enable `debugMotion: true` in Global FFmpeg settings to log all raw events — useful for diagnosing motion issues.

---

## Troubleshooting

### Cameras not discovered
- Verify NVR credentials are correct
- Check the NVR HTTP port (try `8080` if `80` doesn't work)
- Enable `forceDiscovery` and restart

### Video choppy or stuttering
- Try reducing `packetSize` to `564` or `376`
- Switch from `mainstream` to `substream`
- Lower the `qualityPreset` to `720p-standard`

### No motion events
- Ensure motion detection is enabled on the NVR for each channel
- Enable `debugMotion: true` and check logs for incoming events
- Verify the NVR firewall allows the Homebridge host to connect on port 80

### Hardware encoder not working
- Confirm `videoProcessor` is set to a custom FFmpeg with hardware support
- Verify the hardware device exists: `ls /dev/dri/` (VAAPI)
- Check Homebridge logs for FFmpeg errors with `debug: true`

### HKSV recordings not appearing
- Ensure the camera is unbridged (`unbridge: true`)
- Verify your iCloud+ plan supports the number of cameras
- Check that motion events are being received (see Motion Detection above)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Support

- [GitHub Issues](https://github.com/pit5bul/homebridge-hikvision-ultimate/issues)
- [Homebridge Discord](https://discord.gg/homebridge)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-pit5bul-yellow?logo=buy-me-a-coffee)](https://buymeacoffee.com/pit5bul)
