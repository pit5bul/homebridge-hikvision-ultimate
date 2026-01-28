#!/bin/bash

# Homebridge Hikvision Ultimate - Installation Script
# This script properly installs the plugin for Homebridge with strict-plugin-resolution

set -e

echo "=========================================="
echo "Installing homebridge-hikvision-ultimate"
echo "=========================================="

# Define paths
HOMEBRIDGE_DIR="/var/lib/homebridge"
PLUGIN_DIR="${HOMEBRIDGE_DIR}/node_modules/homebridge-hikvision-ultimate"
SOURCE_DIR="${HOMEBRIDGE_DIR}/homebridge-hikvision-ultimate"

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory not found at $SOURCE_DIR"
    echo "Please extract homebridge-hikvision-ultimate.zip to $HOMEBRIDGE_DIR first"
    exit 1
fi

# Navigate to Homebridge directory
cd "$HOMEBRIDGE_DIR"

echo ""
echo "Step 1: Removing old installation (if exists)..."
if [ -d "$PLUGIN_DIR" ]; then
    rm -rf "$PLUGIN_DIR"
    echo "✓ Removed old installation"
else
    echo "✓ No previous installation found"
fi

echo ""
echo "Step 2: Installing plugin to node_modules..."
# Copy plugin to node_modules (this works with --strict-plugin-resolution)
cp -r "$SOURCE_DIR" "$PLUGIN_DIR"
echo "✓ Plugin copied to $PLUGIN_DIR"

echo ""
echo "Step 3: Installing dependencies..."
cd "$PLUGIN_DIR"
npm install --production 2>&1 | grep -v "npm warn"
echo "✓ Dependencies installed"

echo ""
echo "Step 4: Verifying installation..."

# Check that dist folder exists
if [ ! -d "$PLUGIN_DIR/dist" ]; then
    echo "ERROR: dist folder not found. Building plugin..."
    npm run build
fi

# Check that main file exists
if [ ! -f "$PLUGIN_DIR/dist/index.js" ]; then
    echo "ERROR: Main entry point not found at $PLUGIN_DIR/dist/index.js"
    exit 1
fi

echo "✓ Plugin structure verified"

echo ""
echo "Step 5: Checking package.json..."
PLUGIN_NAME=$(cat "$PLUGIN_DIR/package.json" | grep '"name"' | cut -d'"' -f4)
echo "✓ Plugin name: $PLUGIN_NAME"

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Plugin installed at: $PLUGIN_DIR"
echo ""
echo "Next steps:"
echo "1. Configure the plugin in Homebridge config.json"
echo "2. Restart Homebridge"
echo "3. Check logs for 'Loaded plugin: homebridge-hikvision-ultimate'"
echo ""
echo "To restart Homebridge:"
echo "  - Via UI: Click 'Restart' in Homebridge UI"
echo "  - Via command: sudo systemctl restart homebridge"
echo ""
