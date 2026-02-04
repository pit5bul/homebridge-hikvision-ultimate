# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-02-04

### 🚀 VAAPI Hardware Acceleration Quality Profiles

Major update adding quality profile system for hardware encoders with optimized GOP sizes for HomeKit streaming.

### Added
- **Quality Profile System**: New UI dropdown for selecting encoding quality (Speed/Balanced/Quality)
- **7 Hardware Encoder Presets**: VAAPI, QuickSync, NVENC, AMF, VideoToolbox, Jetson, RK MPP
- **HomeKit-Optimized GOP Sizes**: Fixed keyframe intervals to 1-2 seconds for reliable streaming
  - Speed: 2 second keyframes (25 frames @ 12.5fps)
  - Balanced: 1.5 second keyframes (19 frames @ 12.5fps)
  - Quality: 1 second keyframes (13 frames @ 12.5fps)

### Fixed
- **VAAPI Filter Chain**: Removed `-color_range mpeg` that caused auto-insertion of CPU scaler
- **HomeKit Stream Stability**: Reduced GOP from 120 to 13-25 frames for better compatibility
- **Frame Rate Detection**: GOP sizes now properly scaled to source framerate
- **VAAPI Parameters**: Changed from unsupported `-b_depth` to `-bf` for B-frames

### Changed
- **Full GPU Pipeline**: Decode → Scale → Encode stays on GPU (80% CPU reduction)
- **Minimal Parameters**: Only universally supported VAAPI options (`-bf`, `-g`)
- **Config Schema**: Added quality profile dropdown in UI

### Performance
- VAAPI Speed profile: ~5% CPU, ~40% GPU utilization
- VAAPI Quality profile: ~10% CPU, ~30% GPU utilization
- No more CPU↔GPU memory transfers

## [1.2.0] - 2026-01-28

### 🎉 Production Ready Release
This version makes the plugin ready for public NPM distribution with zero-config setup.

### Added
- **Auto-Save to config.json**: Discovered cameras automatically saved to disk, persisting across restarts
- **Enhanced First-Run Experience**: Helpful emoji-based logging guides users through setup
- **Improved Cleanup Logging**: Clear messages when orphaned accessories are removed
- **User-Friendly Messages**: Better error messages and troubleshooting hints
- **Comprehensive README**: Full documentation for public distribution

### Changed
- **Better Discovery Logging**: More informative messages during camera discovery
- **Enhanced Config Schema**: Improved hardware encoder descriptions with platform guidance
- **Cleaner Config Output**: Pretty-printed JSON with 4-space indentation

### Fixed
- Config persistence across restarts (cameras now saved to config.json)
- Hardware acceleration profiles properly displayed in Homebridge UI

## [1.1.1] - 2026-01-28

### Fixed
- **Automatic Cleanup**: Orphaned accessories now removed BEFORE creating new ones
- **forceDiscovery Warning**: Warns users when forceDiscovery is enabled with existing cameras
- **Better Error Prevention**: Prevents "already bridged" errors during upgrades

### Added
- Comprehensive logging for cleanup operations

## [1.1.0] - 2026-01-28

### 🚀 Major Quality & Performance Update

### Fixed
- **Bitrate**: Changed default from 299kbps to 2000kbps for excellent quality
- **Snapshots**: Corrected ISAPI endpoint format (`/ISAPI/Streaming/channels/{channelId}/picture`)
- **Snapshot Format**: Added `-f image2` flag for proper JPEG handling

### Added
- **Hardware Acceleration**: Support for 7 encoder profiles:
  - `software` - CPU encoding (default, works everywhere)
  - `vaapi` - Intel/AMD GPU on Linux
  - `quicksync` - Intel iGPU (all platforms)
  - `nvenc` - NVIDIA GPU (all platforms)
  - `amf` - AMD GPU on Windows
  - `videotoolbox` - Apple Silicon / Intel Mac
  - `v4l2` - Raspberry Pi
- **Enhanced Logging**: Shows generated RTSP URLs, snapshot URLs, and camera settings
- **Encoder Selection**: Automatic encoder preset application based on config

### Performance
- Hardware acceleration reduces CPU usage by 60-90%
- Example: 6 cameras at 1080p@30fps
  - Software encoding: 60-80% CPU
  - NVENC encoding: 5-10% CPU

## [1.0.0] - 2026-01-27

### 🎊 Initial Release

### Added
- NVR auto-discovery via ISAPI
- Motion detection support via event streams
- FFmpeg-based video streaming
- Automatic RTSP URL generation
- Support for mainstream, substream, and thirdstream
- Configurable video quality settings
- Camera enable/disable support
- Motion timeout configuration
- TypeScript implementation with full type safety

### Features
- Discovers all cameras on Hikvision NVR
- Real-time motion detection
- HomeKit integration via Homebridge
- Configurable per-camera settings
- Child bridge support

---

## Version History Summary

| Version | Date | Key Features |
|---------|------|--------------|
| 1.2.0 | 2026-01-28 | Auto-save, production-ready, enhanced UX |
| 1.1.1 | 2026-01-28 | Auto-cleanup, better error prevention |
| 1.1.0 | 2026-01-28 | Hardware acceleration, 2000kbps, working snapshots |
| 1.0.0 | 2026-01-27 | Initial release with auto-discovery |

---

## Upgrade Guide

### From 1.1.x to 1.2.0
No breaking changes! Simply update:
```bash
npm install -g homebridge-hikvision-ultimate@1.2.0
```

Benefits:
- Discovered cameras now persist in config.json
- Better logging and user guidance
- No configuration changes required

### From 1.0.0 to 1.2.0
Recommended upgrade path:
1. Backup your config.json
2. Update plugin: `npm install -g homebridge-hikvision-ultimate@1.2.0`
3. Restart Homebridge
4. Verify logs show "2000kbps" and working snapshots
5. (Optional) Enable hardware acceleration in camera settings

Your existing cameras will continue to work. New features:
- 7x better bitrate (2000kbps vs 299kbps)
- Working snapshots
- Hardware acceleration options
- Auto-save to config.json

---

## Future Roadmap

### Planned Features
- [ ] Two-way audio support
- [ ] PTZ camera control
- [ ] Recording triggers from HomeKit
- [ ] Multi-NVR support
- [ ] Advanced motion zones
- [ ] Substream for remote viewing
- [ ] Webhook support for events
- [ ] Home Assistant integration

### Under Consideration
- [ ] Doorbell support
- [ ] Face detection integration
- [ ] Cloud recording support
- [ ] Mobile app notifications

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Reporting bugs
- Suggesting features
- Submitting pull requests
- Development setup

---

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.
