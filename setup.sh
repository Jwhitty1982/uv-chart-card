#!/usr/bin/env bash

# UV Index Chart Card - Quick Setup Script
# This script automates the setup process for development

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        UV Index Chart Card - Development Setup                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js found: $NODE_VERSION"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✓ npm found: $NPM_VERSION"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Build project
echo "🔨 Building project..."
npm run build
echo "✓ Build completed"
echo ""

# Show next steps
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     Setup Complete! 🎉                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📂 Output location: dist/uv-index-chart-card.js"
echo ""
echo "Next steps:"
echo ""
echo "1️⃣  For HACS installation:"
echo "    - Push to GitHub repository"
echo "    - Add custom repository in HACS"
echo "    - Install from HACS"
echo ""
echo "2️⃣  For manual installation:"
echo "    - Copy dist/uv-index-chart-card.js to Home Assistant"
echo "    - Add module_url to configuration.yaml"
echo "    - Restart Home Assistant"
echo ""
echo "3️⃣  Add to dashboard:"
echo "    type: custom:uv-index-chart-card"
echo "    entity: sensor.openweathermap_uv_index"
echo ""
echo "📚 Documentation:"
echo "   - README.md - Overview and features"
echo "   - DEVELOPMENT.md - Detailed development guide"
echo "   - EXAMPLES.md - Configuration examples"
echo ""
echo "🚀 Development:"
echo "   npm run dev   - Watch mode"
echo "   npm run build - Production build"
echo ""
