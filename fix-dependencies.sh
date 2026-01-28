#!/bin/bash

# Fix Missing Dependencies

echo "=========================================="
echo "Installing Plugin Dependencies"
echo "=========================================="
echo ""

PLUGIN_DIR="/var/lib/homebridge/node_modules/homebridge-hikvision-ultimate"

# Check if plugin exists
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "❌ Plugin not found at $PLUGIN_DIR"
    exit 1
fi

echo "Found plugin at: $PLUGIN_DIR"
echo ""

# Go to plugin directory
cd "$PLUGIN_DIR"

# Install dependencies
echo "Installing dependencies..."
echo ""
sudo npm install --production --loglevel=error

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dependencies installed successfully"
    echo ""
    
    # Verify xml2js is installed
    if [ -d "node_modules/xml2js" ]; then
        echo "✅ xml2js installed"
    else
        echo "⚠️  xml2js not found, installing manually..."
        sudo npm install xml2js --save
    fi
    
    # Verify other dependencies
    echo ""
    echo "Checking all dependencies..."
    for dep in "xml2js" "ffmpeg-for-homebridge" "pick-port"; do
        if [ -d "node_modules/$dep" ]; then
            echo "✅ $dep"
        else
            echo "❌ $dep - installing..."
            sudo npm install $dep --save
        fi
    done
    
    echo ""
    echo "=========================================="
    echo "Dependencies Ready!"
    echo "=========================================="
    echo ""
    echo "Restarting Homebridge..."
    sudo systemctl restart homebridge
    echo ""
    echo "Watch logs:"
    echo "  journalctl -u homebridge -f"
    echo ""
    
    sleep 3
    echo "Showing last 20 log lines..."
    journalctl -u homebridge -n 20 --no-pager
else
    echo ""
    echo "❌ Failed to install dependencies"
    echo ""
    echo "Try manual installation:"
    echo "  cd $PLUGIN_DIR"
    echo "  sudo npm install xml2js ffmpeg-for-homebridge pick-port --save"
fi
