# Installation Guide

## 📋 Requirements

- Homebridge v1.3.0 or newer
- Node.js v18 or newer
- Hikvision NVR with ISAPI support
- Network access to your NVR

## 🚀 Installation Methods

### Method 1: Homebridge Config UI X (Recommended)

1. Open Homebridge Config UI X in your browser
2. Click on **"Plugins"** tab
3. Search for **"homebridge-hikvision-ultimate"**
4. Click **"Install"**
5. Wait for installation to complete
6. Click **"Settings"** on the plugin
7. Configure (see Configuration section below)
8. Restart Homebridge

### Method 2: Command Line

```bash
sudo npm install -g homebridge-hikvision-ultimate
```

Then restart Homebridge:
```bash
sudo systemctl restart homebridge
```

## ⚙️ Configuration

### Quick Start (Zero Config)

Add this minimal configuration to discover cameras automatically:

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

**That's it!** The plugin will:
1. ✅ Discover all cameras on your NVR
2. ✅ Save them to config.json automatically
3. ✅ Generate RTSP and snapshot URLs
4. ✅ Register cameras in HomeKit
5. ✅ Enable motion detection

### Configuration via UI

1. Go to Homebridge Config UI X
2. Click **"Plugins"** → **"Homebridge Hikvision Ultimate"** → **"Settings"**
3. Fill in:
   - **Name**: Display name (e.g., "Hikvision NVR")
   - **Host**: Your NVR IP address
   - **Username**: NVR username (usually "admin")
   - **Password**: NVR password
4. Click **"Save"**
5. Restart Homebridge
6. Check logs for discovered cameras

## 📹 First Run

### What to Expect

After first installation and restart, you'll see:

```
[Hikvision NVR] 🔍 No cameras configured - starting auto-discovery...
[Hikvision NVR] 💡 Cameras will be automatically added to your config.json
[Hikvision NVR] Connected to NVR: Network Video Recorder (Model)
[Hikvision NVR] ✅ Found 6 channel(s) on NVR
[Hikvision NVR] Discovered new camera: Front Door (Channel 1)
[Hikvision NVR] Discovered new camera: Back Yard (Channel 2)
...
[Hikvision NVR] ✅ Saved 6 camera(s) to config.json
[Hikvision NVR] 🎉 First-time setup complete!
[Hikvision NVR] 📝 6 camera(s) have been saved to config.json
[Hikvision NVR] 💡 Tip: You can customize camera names and settings in the Homebridge UI
```

### Verify Installation

1. **Check Homebridge Logs**: Look for successful discovery and registration
2. **Open Home App**: Cameras should appear as new accessories
3. **Test Streaming**: Open a camera feed in Home app
4. **Test Snapshots**: Camera thumbnails should load

## 🎛️ Customization

### Rename Cameras

After discovery, you can rename cameras:

1. Go to **Config UI X** → **Settings** → **homebridge-hikvision-ultimate**
2. Find camera in the list
3. Change **"name"** field
4. Save and restart

### Adjust Video Quality

For each camera, customize video settings:

```json
{
    "channelId": 1,
    "name": "Front Door",
    "videoConfig": {
        "maxBitrate": 3000,
        "maxWidth": 1920,
        "maxHeight": 1080,
        "maxFPS": 30
    }
}
```

**Quality Presets**:

| Use Case | Bitrate | Resolution | FPS |
|----------|---------|------------|-----|
| Remote/Mobile | 1000 | 1280x720 | 15 |
| Balanced | 2000 | 1920x1080 | 20 |
| Local/High | 4000 | 1920x1080 | 30 |

### Enable Hardware Acceleration

Reduce CPU usage by 70-90%:

1. Go to camera settings in Config UI X
2. Find **"Hardware Encoder"** dropdown under **"Video Configuration"**
3. Select based on your hardware:
   - **software** - Works everywhere (default)
   - **nvenc** - If you have NVIDIA GPU
   - **quicksync** - If you have Intel CPU with iGPU
   - **vaapi** - Intel/AMD GPU on Linux
   - **videotoolbox** - Mac with Apple Silicon
   - **amf** - AMD GPU on Windows
   - **v4l2** - Raspberry Pi
4. Save and restart

**Verify it's working**:
```
[Hikvision NVR] Camera Front Door using nvenc encoder: h264_nvenc
```

## 🔧 Advanced Configuration

### Full Configuration Example

```json
{
    "platforms": [
        {
            "platform": "HikvisionUltimate",
            "name": "Hikvision NVR",
            "host": "192.168.1.100",
            "port": 80,
            "username": "admin",
            "password": "your_password",
            "secure": false,
            "streamType": "mainstream",
            "probeOnStartup": false,
            "forceDiscovery": false,
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
                        "maxFPS": 30,
                        "audio": false
                    }
                },
                {
                    "channelId": 2,
                    "name": "Back Yard",
                    "enabled": true,
                    "motion": true,
                    "motionTimeout": 1,
                    "videoConfig": {
                        "encoder": "software",
                        "maxBitrate": 2000
                    }
                }
            ]
        }
    ]
}
```

### Platform Options Explained

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | string | **required** | Must be "HikvisionUltimate" |
| `name` | string | **required** | Display name in Homebridge |
| `host` | string | **required** | NVR IP address |
| `port` | number | 80 | NVR HTTP port |
| `username` | string | **required** | NVR username |
| `password` | string | **required** | NVR password |
| `secure` | boolean | false | Use HTTPS instead of HTTP |
| `streamType` | string | "mainstream" | Default stream quality |
| `probeOnStartup` | boolean | false | Probe streams at startup |
| `forceDiscovery` | boolean | false | Force re-discovery every restart |

### Camera Options Explained

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channelId` | number | **required** | Camera channel (1-based) |
| `name` | string | **required** | Camera display name |
| `enabled` | boolean | true | Enable/disable camera |
| `motion` | boolean | true | Enable motion detection |
| `motionTimeout` | number | 1 | Motion sensor timeout (seconds) |
| `videoConfig.encoder` | string | "software" | Hardware encoder selection |
| `videoConfig.maxBitrate` | number | 2000 | Max bitrate in kbps |
| `videoConfig.maxWidth` | number | 1920 | Max resolution width |
| `videoConfig.maxHeight` | number | 1080 | Max resolution height |
| `videoConfig.maxFPS` | number | 30 | Max frames per second |
| `videoConfig.audio` | boolean | false | Enable audio streaming |

## 🐛 Troubleshooting

### Cameras Not Discovered

**Check Logs**:
```
[Hikvision NVR] ❌ Failed to discover cameras: [error]
```

**Solutions**:
1. Verify NVR IP address is correct
2. Check username/password
3. Ensure NVR is accessible: `ping 192.168.1.100`
4. Try accessing NVR web interface
5. Check NVR has ISAPI enabled

### Snapshots Timeout

**Symptoms**:
- Camera thumbnails don't load
- Black preview images

**Solutions**:
1. Test snapshot URL manually:
   ```bash
   curl -u admin:password http://NVR_IP/ISAPI/Streaming/channels/101/picture --output test.jpg
   ```
2. If fails, try substream:
   ```json
   "streamType": "substream"
   ```

### High CPU Usage

**Symptoms**:
- Homebridge server slow
- FFmpeg processes using high CPU

**Solution**: Enable hardware acceleration:
1. Check available encoders:
   ```bash
   ffmpeg -encoders | grep h264
   ```
2. Set appropriate encoder in camera config
3. Verify with logs: `Camera X using nvenc encoder`

### Motion Detection Not Working

**Check**:
1. Motion enabled: `"motion": true`
2. Test ISAPI events:
   ```bash
   curl -u admin:password http://NVR_IP/ISAPI/Event/notification/alertStream
   ```
3. Check logs for: `Starting motion event stream...`

### Config Not Saving

**Symptoms**:
- Changes revert after restart
- Cameras disappear

**Solutions**:
1. Check Homebridge has write permission to config.json
2. Verify config.json syntax is valid
3. Check logs for save errors
4. Manually verify config.json was updated

## 🔄 Updating

### Via Config UI X
1. Go to **Plugins**
2. Find **homebridge-hikvision-ultimate**
3. Click **"Update"** if available
4. Wait for completion
5. Restart Homebridge

### Via Command Line
```bash
sudo npm install -g homebridge-hikvision-ultimate@latest
sudo systemctl restart homebridge
```

### Check Version
```bash
npm list -g homebridge-hikvision-ultimate
```

## 📞 Support

- **GitHub Issues**: https://github.com/pit5bul/homebridge-hikvision-ultimate/issues
- **Homebridge Discord**: #plugin-development channel
- **Documentation**: https://github.com/pit5bul/homebridge-hikvision-ultimate

## ✅ Post-Installation Checklist

After installation:

- [ ] Cameras discovered and saved to config.json
- [ ] All cameras appear in Home app
- [ ] Video streaming works
- [ ] Snapshots load (thumbnails visible)
- [ ] Motion detection triggers
- [ ] Logs show no errors
- [ ] (Optional) Hardware acceleration enabled
- [ ] (Optional) Camera names customized
- [ ] (Optional) Video quality adjusted

If all checked ✅ = Installation successful! 🎉
