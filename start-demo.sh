#!/bin/bash

# Collaboration Demo Startup Script
echo "🚀 Starting Collaboration Demo..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "📍 Working directory: $(pwd)"

# Check for .env file
echo "🔐 Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "📝 Please create a .env file with your API keys:"
    echo "   OPENAI_API_KEY=your_openai_api_key_here"
    echo "   TOGETHER_API_KEY=your_together_api_key_here"
    echo "   Or run ./install-deps.sh to create one from template."
    exit 1
fi

# Set venv directory name
VENV_DIR="venv"

# Check if venv exists
if [ ! -d "$VENV_DIR" ]; then
    echo "❌ Virtual environment not found!"
    echo "📦 Please run ./install-deps.sh first to install dependencies."
    exit 1
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Function to cleanup background processes
cleanup() {
    echo "🧹 Cleaning up..."
    
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

# Start Python backend
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
