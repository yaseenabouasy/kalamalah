#!/usr/bin/env bash
# Vendor Download Script
# Run this to fetch all external dependencies locally

set -e

VENDOR_DIR="vendor"

echo "Creating vendor directories..."
mkdir -p "$VENDOR_DIR/aeroui/components/elastic-slider"
mkdir -p "$VENDOR_DIR/aeroui/components/player-button"
mkdir -p "$VENDOR_DIR/aeroui/components/skip-label"
mkdir -p "$VENDOR_DIR/fonts"

echo "Downloading AeroUI components..."

# Elastic Slider
echo "  → elastic-slider"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/components/elastic-slider/elastic-slider.js" \
  -o "$VENDOR_DIR/aeroui/components/elastic-slider/elastic-slider.js"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/components/elastic-slider/elastic-slider.css" \
  -o "$VENDOR_DIR/aeroui/components/elastic-slider/elastic-slider.css" 2>/dev/null || true

# Player Button
echo "  → player-button"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.js" \
  -o "$VENDOR_DIR/aeroui/components/player-button/player-button.js"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/components/player-button/player-button.css" \
  -o "$VENDOR_DIR/aeroui/components/player-button/player-button.css" 2>/dev/null || true

# Skip Label
echo "  → skip-label"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.js" \
  -o "$VENDOR_DIR/aeroui/components/skip-label/skip-label.js"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/components/skip-label/skip-label.css" \
  -o "$VENDOR_DIR/aeroui/components/skip-label/skip-label.css" 2>/dev/null || true

# AeroUI Main CSS
echo "  → aeroui.css"
curl -sL "https://nurislamaibekuly.github.io/aeroui/src/aeroui.css" \
  -o "$VENDOR_DIR/aeroui/aeroui.css"

# Google Fonts - Tajawal (subset for Arabic + Latin)
echo "Downloading Tajawal font subset..."
mkdir -p "$VENDOR_DIR/fonts/tajawal"
# Note: For production, use fonttools to subset. For now, download full WOFF2 files.
# These are large (~200KB each). Consider using fontsource or subsetting.
# curl -sL "https://fonts.gstatic.com/s/tajawal/v20/IurY6Y5j_oScZZow4voxCZZM.woff2" -o "$VENDOR_DIR/fonts/tajawal/Tajawal-Regular.woff2"
# curl -sL "https://fonts.gstatic.com/s/tajawal/v20/IurY6Y5j_oScZZow4voxCZZM.woff2" -o "$VENDOR_DIR/fonts/tajawal/Tajawal-Medium.woff2"
# curl -sL "https://fonts.gstatic.com/s/tajawal/v20/IurY6Y5j_oScZZow4voxCZZM.woff2" -o "$VENDOR_DIR/fonts/tajawal/Tajawal-Bold.woff2"
# curl -sL "https://fonts.gstatic.com/s/tajawal/v20/IurY6Y5j_oScZZow4voxCZZM.woff2" -o "$VENDOR_DIR/fonts/tajawal/Tajawal-ExtraBold.woff2"

echo "Done! Files saved to $VENDOR_DIR/"
echo ""
echo "Next steps:"
echo "1. Update layout.ts to use local vendor paths"
echo "2. Update CSP to remove external origins"
echo "3. Run: bun run build:client"