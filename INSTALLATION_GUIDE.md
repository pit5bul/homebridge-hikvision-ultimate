# Manual Installation Instructions

## The Problem
Homebridge uses `--strict-plugin-resolution` which means plugins MUST be in `/var/lib/homebridge/node_modules/` directory.

Using `npm link` doesn't work with this flag.

## Solution: Direct Installation to node_modules

### Method 1: Using the Installation Script (Recommended)

1. **Upload files to your Homebridge server**:
   ```bash
   # On your server, extract the zip
   cd /var/lib/homebridge
   unzip homebridge-hikvision-ultimate.zip
   ```

2. **Run the installation script**:
   ```bash
   cd /var/lib/homebridge
   chmod +x install-plugin.sh
   ./install-plugin.sh
   ```

3. **Restart Homebridge** (via UI or command)

---

### Method 2: Manual Installation (Step by Step)

If the script doesn't work, follow these manual steps:

#### Step 1: Extract the Plugin
```bash
cd /var/lib/homebridge
unzip homebridge-hikvision-ultimate.zip
```

#### Step 2: Remove Old Version (if exists)
```bash
rm -rf /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate
```

#### Step 3: Copy Plugin to node_modules
```bash
cp -r /var/lib/homebridge/homebridge-hikvision-ultimate /var/lib/homebridge/node_modules/
```

#### Step 4: Install Dependencies
```bash
cd /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate
npm install --production
```

#### Step 5: Verify Installation
```bash
# Check that these exist:
ls -la /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate/dist/index.js
ls -la /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate/package.json
```

You should see both files listed.

#### Step 6: Restart Homebridge
- **Via Homebridge UI**: Click the "Restart" button
- **Via Command Line**: 
  ```bash
  sudo systemctl restart homebridge
  # or
  sudo hb-service restart
  ```

---

### Method 3: Using NPM Install from Local Directory

```bash
cd /var/lib/homebridge
npm install ./homebridge-hikvision-ultimate
```

This will install the plugin properly into node_modules.

---

## Verify Installation

After restart, check the Homebridge logs. You should see:

```
[HB Supervisor] Starting Homebridge with extra flags: -I -P /var/lib/homebridge/node_modules --strict-plugin-resolution
Loaded plugin: homebridge-hikvision-ultimate@1.0.0
Registering platform 'homebridge-hikvision-ultimate.HikvisionUltimate'
```

**If you see**:
- ✅ `Loaded plugin: homebridge-hikvision-ultimate` → Success!
- ❌ `No plugins found` → Plugin not in correct location
- ❌ `Cannot find module` → Dependencies not installed

---

## Troubleshooting

### Problem: "No plugins found"

**Cause**: Plugin is not in the node_modules directory.

**Solution**:
```bash
# Check where the plugin actually is:
find /var/lib/homebridge -name "homebridge-hikvision-ultimate" -type d

# It should show:
# /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate

# If it shows a different location, copy it:
cp -r /path/to/homebridge-hikvision-ultimate /var/lib/homebridge/node_modules/
```

### Problem: "Cannot find module 'homebridge'"

**Cause**: Dependencies not installed or installed in wrong location.

**Solution**:
```bash
cd /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate
rm -rf node_modules package-lock.json
npm install --production
```

### Problem: Plugin appears but doesn't load

**Cause**: Missing dist folder or build files.

**Solution**:
```bash
cd /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate
npm run build
```

---

## Configuration

Once the plugin is loaded, add this to your config.json:

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
      "streamType": "substream",
      "probeOnStartup": false
    }
  ]
}
```

Save and restart Homebridge.

---

## Verification Checklist

After installation and configuration:

- [ ] Plugin shows in Homebridge logs as "Loaded plugin"
- [ ] Platform registers as "HikvisionUltimate"
- [ ] NVR connection succeeds
- [ ] Cameras are discovered
- [ ] No "undefined" camera errors
- [ ] Cameras appear in HomeKit

---

## Directory Structure

Your final structure should look like:

```
/var/lib/homebridge/
├── node_modules/
│   └── homebridge-hikvision-ultimate/    ← Plugin must be here!
│       ├── dist/
│       │   ├── index.js                   ← Main entry point
│       │   ├── platform.js
│       │   └── ...
│       ├── package.json
│       └── node_modules/                  ← Plugin's dependencies
└── homebridge-hikvision-ultimate/         ← Source (can be deleted after install)
    └── ...
```

---

## Still Not Working?

If none of these methods work:

1. **Check Homebridge version**: Must be 1.6.0+ or 2.0.0-beta
2. **Check Node.js version**: Must be 18.17+, 20.9+, 22+, or 24+
3. **Check permissions**: 
   ```bash
   ls -la /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate
   # Should be owned by homebridge user
   ```
4. **Try installing dependencies globally**:
   ```bash
   cd /var/lib/homebridge/node_modules/homebridge-hikvision-ultimate
   npm install
   ```

5. **Check for other errors**:
   ```bash
   tail -f ~/.homebridge/homebridge.log
   # or
   journalctl -u homebridge -f
   ```

---

## Quick Test

To quickly test if the plugin file structure is correct:

```bash
node -e "require('/var/lib/homebridge/node_modules/homebridge-hikvision-ultimate')"
```

If this runs without error, the plugin structure is correct.
