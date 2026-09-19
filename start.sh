#!/usr/bin/env bash

echo "======================================================"
echo "   PerkPulse - Credit Intelligence & Perks Maximizer"
echo "======================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH!"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing required dependencies..."
    npm install
fi

echo "[INFO] Starting PerkPulse server on http://localhost:3000..."

# Open browser based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3000 &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:3000 &
fi

npm start
