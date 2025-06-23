#!/bin/bash

# Collaboration Demo Startup Script
echo "🚀 Starting Collaboration Demo..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "📍 Working directory: $(pwd)"

# Set venv directory name
VENV_DIR="venv"

# Create venv if it doesn't exist
echo "🐍 Checking for Python virtual environment..."
if [ ! -d "$VENV_DIR" ]; then
    echo "🐍 Creating Python virtual environment in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Check if Python dependencies are installed
echo "📦 Checking Python dependencies..."
if ! "$VENV_DIR/bin/python" -c "import websockets" 2>/dev/null; then
    echo "Installing Python dependencies..."
    "$VENV_DIR/bin/pip" install -r requirements.txt
fi

# Check if Node dependencies are installed
echo "📦 Checking Node.js dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

# Function to cleanup background processes
cleanup() {
    echo "🧹 Cleaning up..."
    
    # WebSocket server cleanup disabled - not using WebSocket anymore
    # if [ ! -z "$WEBSOCKET_PID" ]; then
    #     echo "🔌 Stopping WebSocket server (PID: $WEBSOCKET_PID)..."
    #     kill $WEBSOCKET_PID 2>/dev/null
    # fi
    
    # Kill Python backend
    if [ ! -z "$BACKEND_PID" ]; then
        echo "🐍 Stopping Python backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null
    fi
    
    # Aggressively find and kill any remaining python_backend.py processes
    echo "🔍 Checking for any remaining python_backend.py processes..."
    REMAINING_BACKENDS=$(pgrep -f "python_backend.py")
    if [ ! -z "$REMAINING_BACKENDS" ]; then
        echo "🗑️ Found remaining python_backend.py processes: $REMAINING_BACKENDS"
        echo "🗑️ Killing remaining python_backend.py processes..."
        pkill -f "python_backend.py"
        sleep 1
        
        # Force kill if still running
        STILL_RUNNING=$(pgrep -f "python_backend.py")
        if [ ! -z "$STILL_RUNNING" ]; then
            echo "⚡ Force killing stubborn python_backend.py processes..."
            pkill -9 -f "python_backend.py"
        fi
    else
        echo "✅ No remaining python_backend.py processes found"
    fi
    
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Kill any existing backend processes before starting
echo "🔍 Checking for existing backend processes..."
EXISTING_BACKENDS=$(pgrep -f "python_backend.py")
if [ ! -z "$EXISTING_BACKENDS" ]; then
    echo "🗑️ Found existing python_backend.py processes: $EXISTING_BACKENDS"
    echo "🗑️ Killing existing python_backend.py processes..."
    pkill -f "python_backend.py"
    sleep 1
fi

echo "✅ Ready to start fresh backend processes"

# WebSocket server disabled - using HTTP polling for collaboration
# echo "🔌 Starting WebSocket server..."
# python3 backend/websocket_server.py &
# WEBSOCKET_PID=$!
# sleep 2

# Start Python backend (optional, for AI features)
echo "🐍 Starting Python backend..."
cd backend && ../$VENV_DIR/bin/python python_backend.py &
BACKEND_PID=$!
cd "$SCRIPT_DIR"
sleep 2

# Start Electron app
echo "⚡ Starting Electron app..."
npm start

# Cleanup when Electron app closes
cleanup 
