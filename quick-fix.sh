#!/bin/bash

# Quick Fix for "No plugins found" issue

echo "=========================================="
echo "Fixing 'No plugins found' Issue"
echo "=========================================="
echo ""

# Check if we're in the right place
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: Run this script from inside the homebridge-hikvision-ultimate directory"
    echo ""
    echo "Correct usage:"
    echo "  cd /var/lib/homebridge/homebridge-hikvision-ultimate"
    echo "  bash quick-fix.sh"
    exit 1
fi

# Get plugin name from package.json
PLUGIN_NAME=$(cat package.json | grep '"name"' | head -1 | cut -d'"' -f4)
echo "Plugin name: $PLUGIN_NAME"
echo ""

# Stop Homebridge
echo "Stopping Homebridge..."
sudo systemctl stop homebridge
sleep 2
echo "✅ Stopped"
echo ""

# Check if dist/ exists
echo "Checking compiled code..."
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    echo "❌ dist/ folder missing or incomplete"
    echo "Building plugin..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed. Trying to install and build..."
        npm install
        npm run build
    fi
    echo "✅ Built"
else
    echo "✅ dist/ folder exists"
fi
echo ""

# Install production dependencies
echo "Installing dependencies..."
npm install --production --loglevel=error
echo "✅ Dependencies installed"
echo ""

# Install production dependencies
echo "Installing dependencies..."
npm install --production --loglevel=error
echo "✅ Dependencies installed"
echo ""

# Verify critical dependencies
echo "Verifying dependencies..."
for dep in "xml2js" "ffmpeg-for-homebridge" "pick-port"; do
    if [ -d "node_modules/$dep" ]; then
        echo "  ✅ $dep"
    else
        echo "  ❌ $dep - MISSING"
    fi
done
echo ""

# Copy to node_modules
echo "Installing plugin to node_modules..."
TARGET_DIR="/var/lib/homebridge/node_modules/$PLUGIN_NAME"

# Remove old version
if [ -d "$TARGET_DIR" ]; then
    echo "Removing old version..."
    sudo rm -rf "$TARGET_DIR"
fi

# Copy current directory to node_modules
echo "Copying plugin..."
sudo cp -r . "$TARGET_DIR"
echo "✅ Copied to $TARGET_DIR"
echo ""

# Fix permissions
echo "Setting permissions..."
sudo chown -R homebridge:homebridge "$TARGET_DIR"
echo "✅ Permissions set"
echo ""

# Verify installation
echo "Verifying installation..."
if [ ! -f "$TARGET_DIR/package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi

if [ ! -f "$TARGET_DIR/dist/index.js" ]; then
    echo "❌ dist/index.js not found"
    exit 1
fi

VERSION=$(cat "$TARGET_DIR/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)
echo "✅ Plugin installed: $PLUGIN_NAME v$VERSION"
echo ""

# Start Homebridge
echo "Starting Homebridge..."
sudo systemctl start homebridge
echo "✅ Started"
echo ""

echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Check logs with:"
echo "  journalctl -u homebridge -f"
echo ""
echo "You should see:"
echo "  Loaded plugin: $PLUGIN_NAME@$VERSION"
echo "  [Hikvision NVR] Initializing HikvisionUltimate platform..."
echo ""

sleep 3
echo "Showing last 30 log lines..."
echo ""
journalctl -u homebridge -n 30 --no-pager | tail -20
