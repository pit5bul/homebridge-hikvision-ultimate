#!/bin/bash

# Homebridge Hikvision Ultimate v1.1.0 - Automated Installation
# This script handles cache cleanup and plugin installation

set -e

echo "=========================================="
echo "Homebridge Hikvision Ultimate v1.1.0"
echo "Automated Installation & Cache Cleanup"
echo "=========================================="
echo ""

# Define paths
HOMEBRIDGE_DIR="/var/lib/homebridge"
PLUGIN_DIR="${HOMEBRIDGE_DIR}/node_modules/homebridge-hikvision-ultimate"
SOURCE_DIR="${HOMEBRIDGE_DIR}/homebridge-hikvision-ultimate"
ACCESSORIES_DIR="${HOMEBRIDGE_DIR}/accessories"
PERSIST_DIR="${HOMEBRIDGE_DIR}/persist"

# Check if running as root or homebridge user
if [ "$EUID" -ne 0 ] && [ "$(whoami)" != "homebridge" ]; then 
    echo "⚠️  Warning: Not running as root or homebridge user"
    echo "You may need to use 'sudo' for some operations"
    echo ""
fi

# Step 1: Check source directory
echo "Step 1: Checking source directory..."
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ ERROR: Source directory not found at $SOURCE_DIR"
    echo "Please extract homebridge-hikvision-ultimate.zip to $HOMEBRIDGE_DIR first"
    exit 1
fi
echo "✓ Source directory found"
echo ""

# Step 2: Stop Homebridge (optional, can be done manually)
echo "Step 2: Stopping Homebridge..."
echo "⚠️  Please stop Homebridge via the UI or run:"
echo "    sudo systemctl stop homebridge"
echo ""
read -p "Press Enter when Homebridge is stopped..."
echo ""

# Step 3: Clear cache
echo "Step 3: Clearing cached accessories..."
if [ -d "$ACCESSORIES_DIR" ]; then
    CACHE_FILES=$(ls -1 ${ACCESSORIES_DIR}/cachedAccessories* 2>/dev/null | wc -l)
    if [ "$CACHE_FILES" -gt 0 ]; then
        echo "Found $CACHE_FILES cache file(s)"
        rm -f ${ACCESSORIES_DIR}/cachedAccessories*
        echo "✓ Cleared accessory cache"
    else
        echo "✓ No cache files found"
    fi
else
    echo "✓ Accessories directory not found (fresh install)"
fi
echo ""

# Step 4: Clear persist files (optional but recommended)
echo "Step 4: Clearing persist files..."
read -p "Clear persist files? This will require re-pairing HomeKit (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "$PERSIST_DIR" ]; then
        rm -f ${PERSIST_DIR}/AccessoryInfo.*.json
        rm -f ${PERSIST_DIR}/IdentifierCache.*.json
        echo "✓ Cleared persist files"
    else
        echo "✓ Persist directory not found"
    fi
else
    echo "⊘ Skipped persist file cleanup"
fi
echo ""

# Step 5: Backup old plugin
echo "Step 5: Backing up old plugin..."
if [ -d "$PLUGIN_DIR" ]; then
    BACKUP_DIR="${PLUGIN_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    mv "$PLUGIN_DIR" "$BACKUP_DIR"
    echo "✓ Backed up to ${BACKUP_DIR}"
else
    echo "✓ No previous installation found"
fi
echo ""

# Step 6: Install new version
echo "Step 6: Installing new version..."
cp -r "$SOURCE_DIR" "$PLUGIN_DIR"
echo "✓ Copied plugin to node_modules"
echo ""

# Step 7: Install dependencies
echo "Step 7: Installing dependencies..."
cd "$PLUGIN_DIR"
npm install --production 2>&1 | grep -v "npm warn" || true
echo "✓ Dependencies installed"
echo ""

# Step 8: Verify installation
echo "Step 8: Verifying installation..."

# Check dist folder
if [ ! -d "$PLUGIN_DIR/dist" ]; then
    echo "❌ ERROR: dist folder not found"
    exit 1
fi

# Check main entry point
if [ ! -f "$PLUGIN_DIR/dist/index.js" ]; then
    echo "❌ ERROR: Main entry point not found"
    exit 1
fi

# Check package.json version
VERSION=$(cat "$PLUGIN_DIR/package.json" | grep '"version"' | cut -d'"' -f4)
echo "✓ Plugin version: $VERSION"
echo ""

# Step 9: Suggest config
echo "Step 9: Configuration recommendation..."
echo ""
echo "Use this MINIMAL config for best results:"
echo ""
cat << 'EOF'
{
    "name": "Hikvision NVR",
    "host": "YOUR_NVR_IP",
    "username": "admin",
    "password": "YOUR_PASSWORD",
    "streamType": "mainstream",
    "probeOnStartup": false,
    "cameras": [
        {"channelId": 1, "name": "Camera 1"},
        {"channelId": 2, "name": "Camera 2"},
        {"channelId": 3, "name": "Camera 3"}
    ],
    "platform": "HikvisionUltimate"
}
EOF
echo ""
echo "This gives you:"
echo "  • 2000kbps bitrate (excellent quality)"
echo "  • Working snapshots"
echo "  • Auto-generated RTSP URLs"
echo "  • Motion detection"
echo "  • 1920x1080@30fps"
echo ""

# Final instructions
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update your config.json (use minimal config above)"
echo "2. Start Homebridge via UI or:"
echo "   sudo systemctl start homebridge"
echo "3. Check logs for:"
echo "   [Hikvision NVR] Camera X config: 1920x1080@30fps, 2000kbps"
echo ""
echo "Expected behavior:"
echo "  ✓ No 'Snapshot timeout' errors"
echo "  ✓ No 'Tried to bridge' errors"
echo "  ✓ Shows '2000kbps' not '299kbps'"
echo "  ✓ Cameras appear in Home app"
echo ""
echo "If you still see errors, you may need to:"
echo "  • Re-pair the HomeKit bridge"
echo "  • Clear persist files (run this script again with 'y')"
echo ""
