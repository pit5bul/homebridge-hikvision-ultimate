# Release v1.5.3 - Software Encoding Playback Fix

## 🚨 CRITICAL BUG FIX

This patch release fixes a **critical bug** that prevented video from playing when using software encoding.

## 🔍 The Problem

In v1.5.2, software encoding had an incorrect `-f rawvideo` parameter:

```bash
# v1.5.2 (BROKEN)
-codec:v libx264 ... -f rawvideo -payload_type 99 -ssrc X -f rtp srtp://...
                     ^^^^^^^^^^^^
                     Wrong format!
```

**Symptoms**:
- ❌ Stream starts and FFmpeg shows successful encoding
- ❌ Video is black screen or frozen in HomeKit
- ❌ HomeKit shows "No Response" or "Loading..."
- ✅ FFmpeg logs show frames encoding (misleading!)

## ✅ The Fix

v1.5.3 removes the incorrect format specifier:

```bash
# v1.5.3 (FIXED)
-codec:v libx264 ... -payload_type 99 -ssrc X -f rtp srtp://...
```

Now software encoding outputs directly to RTP format (correct for streaming).

## 📋 Who Is Affected

### CRITICAL UPDATE IF:
- ❌ Using software encoding (`"encoder": "software"`)
- ❌ Stream starts but video doesn't play
- ❌ Black screen or frozen video in HomeKit
- ❌ "No Response" after stream connects

### NOT AFFECTED IF:
- ✅ Using hardware encoding (VAAPI, NVENC, AMF, etc.)
- ✅ Video plays fine currently

## 📦 Installation

### NPM (Recommended)
```bash
npm install -g homebridge-hikvision-ultimate@1.5.3
```

### Homebridge UI
1. Go to **Plugins**
2. Search "homebridge-hikvision-ultimate"
3. Click **Update** to v1.5.3
4. Restart Homebridge

## 🎯 What Changed

### Before (v1.5.2)
```
[Hikvision NVR] FFmpeg command: ... -f rawvideo -payload_type 99 -f rtp ...
[FFmpeg] frame= 100 fps= 12 ... (encodes successfully)
[HomeKit] Black screen / No video
```

### After (v1.5.3)
```
[Hikvision NVR] FFmpeg command: ... -payload_type 99 -f rtp ...
[FFmpeg] frame= 100 fps= 12 ... (encodes successfully)
[HomeKit] ✅ Video plays!
```

## 🔧 Technical Details

### The Bug
The `-f rawvideo` format specifier tells FFmpeg to output raw video frames. This is incompatible with RTP streaming for HomeKit. The subsequent `-f rtp` was being used, but having `-f rawvideo` in the command caused the video stream to be malformed.

### The Fix
```typescript
// REMOVED (v1.5.2 - caused bug)
const videoFormat = isHardwareEncoder ? '' : ' -f rawvideo';

// FIXED (v1.5.3)
// No format specifier before payload_type
// Only -f rtp at the end (correct!)
```

### Why This Happened
During v1.5.0 development for hardware encoding, a `videoFormat` variable was added but the logic was backwards. It added `-f rawvideo` to software encoding instead of hardware encoding (where it's actually not needed either).

### Why It Wasn't Caught Earlier
- The bug was introduced in v1.5.0/v1.5.1 but masked by other issues
- v1.5.2 fixed the `-color_range` issue, exposing this bug
- FFmpeg shows successful encoding even when output format is wrong
- Testing focused on hardware encoding (which wasn't affected)

## ⚙️ Configuration

### No Changes Required!
Your config works as-is. Just update and restart.

**Software Encoding** (now works!):
```json
{
  "encoder": "software",
  "encoderOptions": "-preset ultrafast -tune zerolatency"
}
```

## 🔍 How to Verify

After updating to v1.5.3:

1. **Restart Homebridge completely**
2. **Open HomeKit** and view a camera
3. **Check logs** for FFmpeg command:

```bash
# Should see (no -f rawvideo):
-codec:v libx264 -pix_fmt yuv420p -filter:v scale=... -preset ultrafast -tune zerolatency -b:v 720k -payload_type 99
```

4. **Video should play** immediately!

## 🆘 Troubleshooting

### Still Not Playing?

If video still doesn't work after v1.5.3:

1. **Verify version**: `npm list -g homebridge-hikvision-ultimate`
2. **Clear Homebridge cache**: Delete `~/.homebridge/accessories/cachedAccessories`
3. **Restart completely**: Stop Homebridge, clear cache, start Homebridge
4. **Check encoder config**: Make sure `"encoder": "software"` is set
5. **Check logs**: Look for the FFmpeg command - should NOT have `-f rawvideo`

### Switching from Hardware to Software

If you were using hardware encoding to work around this bug:

```json
// Before (workaround)
{
  "encoder": "vaapi"  // Used this because software didn't work
}

// After (can use software now)
{
  "encoder": "software",
  "encoderOptions": "-preset ultrafast -tune zerolatency"
}
```

## 📊 Impact Summary

- **Severity**: Critical - Complete playback failure
- **Scope**: Software encoding only (hardware unaffected)
- **Users Affected**: Anyone using software encoding in v1.5.0-1.5.2
- **Breaking Changes**: None
- **Config Changes**: None required

## 🎉 Success Stories

Expected after update:
```
Before: "Stream connects but just black screen"
After:  "Video plays perfectly!" ✅
```

## 📝 Version History Context

### v1.5.0
- ✅ Added hardware acceleration quality profiles
- ⚠️ Introduced videoFormat bug (not noticed)

### v1.5.1
- ✅ Fixed motion detection XML parsing
- ⚠️ videoFormat bug still present

### v1.5.2
- ✅ Fixed `-color_range mpeg` for software encoding
- ⚠️ Exposed videoFormat bug (video doesn't play)

### v1.5.3
- ✅ Fixed `-f rawvideo` removal (video now plays!)

## 🔗 Related Issues

This fix resolves:
- "Software encoding stream doesn't play"
- "Black screen in HomeKit but FFmpeg shows encoding"
- "Video frozen after stream starts"
- "No Response after connection"

## 🚀 What's Next

After installing v1.5.3:
1. ✅ Software encoding now works perfectly
2. ✅ Clean FFmpeg commands (no color_range, no rawvideo)
3. ✅ Hardware encoding unchanged (still working)
4. ✅ Motion detection working (v1.5.1 fix)

## 📈 Timeline

- v1.5.0: Bug introduced (Feb 4)
- v1.5.1: Bug still present (Feb 5)
- v1.5.2: Bug exposed (Feb 5)
- v1.5.3: **BUG FIXED** (Feb 5) ✅

## 🙏 Thanks

Special thanks to the user who reported: "Software encoding streams but doesn't play" - this helped us identify and fix the issue quickly!

---

**Full Diff**: v1.5.2...v1.5.3  
**Release Date**: 2026-02-05  
**Priority**: CRITICAL for software encoding users  
**Compatibility**: Homebridge v1.6.0+, Node.js v18+
