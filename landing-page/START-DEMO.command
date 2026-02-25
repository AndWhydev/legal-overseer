#!/bin/bash
# BitBit Demo Launcher
# Double-click to start the demo for CheekyGlo meeting

cd /tmp/bitbit-demo
export PATH="/opt/homebrew/bin:$PATH"

echo "🚀 Starting BitBit Demo..."
echo ""

# Check for API key
if [ ! -f .env.local ]; then
    echo "⚠️  Missing .env.local - creating template..."
    echo "ANTHROPIC_API_KEY=your-key-here" > .env.local
    echo "   Please edit .env.local and add your Anthropic API key"
    echo ""
fi

# Install deps if needed
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✅ Starting server..."
echo ""
echo "Open in browser: http://localhost:3000/demo"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
