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

# Check if we're already in a virtual environment
if [ -n "$VIRTUAL_ENV" ]; then
    echo "✅ Using active virtual environment: $VIRTUAL_ENV"
    PYTHON_CMD="python"
else
    # Fall back to local venv if not already in one
    VENV_DIR="venv"
    
    # Check if local venv exists
    if [ ! -d "$VENV_DIR" ]; then
        echo "❌ No active virtual environment found and local venv directory not found!"
        echo "📦 Please either:"
        echo "   1. Activate your virtual environment before running this script, or"
        echo "   2. Run ./install-deps.sh to create a local virtual environment."
        exit 1
    fi
    
    echo "🔄 Activating local virtual environment..."
    source "$VENV_DIR/bin/activate"
    PYTHON_CMD="../$VENV_DIR/bin/python"
fi

# Function to cleanup background processes
cleanup() {
    echo "🧹 Cleaning up..."
    
    # Kill Python backend
    if [ ! -z "$BACKEND_PID" ]; then
        echo "🐍 Stopping Python backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null
    fi
    
    # Cleanup MCP servers
    echo "🔧 Cleaning up MCP servers..."
    
    # Kill processes using port 8000 (OAuth callback server)
    OAUTH_PROCESSES=$(lsof -t -i :8000 2>/dev/null)
    if [ ! -z "$OAUTH_PROCESSES" ]; then
        echo "🗑️ Killing OAuth callback server processes on port 8000: $OAUTH_PROCESSES"
        kill $OAUTH_PROCESSES 2>/dev/null
        sleep 1
    fi
    
    # Kill Google Workspace MCP server processes
    GOOGLE_MCP_PROCESSES=$(pgrep -f "google_workspace_mcp" 2>/dev/null)
    if [ ! -z "$GOOGLE_MCP_PROCESSES" ]; then
        echo "🗑️ Killing Google Workspace MCP processes: $GOOGLE_MCP_PROCESSES"
        kill $GOOGLE_MCP_PROCESSES 2>/dev/null
        sleep 1
    fi
    
    # Kill other MCP server processes (npx MCP servers)
    NPX_MCP_PROCESSES=$(pgrep -f "mcp-server" 2>/dev/null)
    if [ ! -z "$NPX_MCP_PROCESSES" ]; then
        echo "🗑️ Killing NPX MCP server processes: $NPX_MCP_PROCESSES"
        kill $NPX_MCP_PROCESSES 2>/dev/null
        sleep 1
    fi
    
    # Kill puppeteer MCP server processes
    PUPPETEER_PROCESSES=$(pgrep -f "server-puppeteer" 2>/dev/null)
    if [ ! -z "$PUPPETEER_PROCESSES" ]; then
        echo "🗑️ Killing Puppeteer MCP processes: $PUPPETEER_PROCESSES"
        kill $PUPPETEER_PROCESSES 2>/dev/null
        sleep 1
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

# Kill any existing backend and MCP processes before starting
echo "🔍 Checking for existing backend and MCP processes..."

# Kill existing backend processes
EXISTING_BACKENDS=$(pgrep -f "python_backend.py")
if [ ! -z "$EXISTING_BACKENDS" ]; then
    echo "🗑️ Found existing python_backend.py processes: $EXISTING_BACKENDS"
    echo "🗑️ Killing existing python_backend.py processes..."
    pkill -f "python_backend.py"
    sleep 1
fi

# Kill existing MCP server processes
echo "🔧 Cleaning up existing MCP servers..."

# Kill processes using port 8000 (OAuth callback server)
OAUTH_PROCESSES=$(lsof -t -i :8000 2>/dev/null)
if [ ! -z "$OAUTH_PROCESSES" ]; then
    echo "🗑️ Killing existing OAuth callback server processes on port 8000: $OAUTH_PROCESSES"
    kill $OAUTH_PROCESSES 2>/dev/null
    sleep 1
fi

# Kill Google Workspace MCP server processes
GOOGLE_MCP_PROCESSES=$(pgrep -f "google_workspace_mcp" 2>/dev/null)
if [ ! -z "$GOOGLE_MCP_PROCESSES" ]; then
    echo "🗑️ Killing existing Google Workspace MCP processes: $GOOGLE_MCP_PROCESSES"
    kill $GOOGLE_MCP_PROCESSES 2>/dev/null
    sleep 1
fi

# Kill other MCP server processes (npx MCP servers)
NPX_MCP_PROCESSES=$(pgrep -f "mcp-server" 2>/dev/null)
if [ ! -z "$NPX_MCP_PROCESSES" ]; then
    echo "🗑️ Killing existing NPX MCP server processes: $NPX_MCP_PROCESSES"
    kill $NPX_MCP_PROCESSES 2>/dev/null
    sleep 1
fi

# Kill puppeteer MCP server processes
PUPPETEER_PROCESSES=$(pgrep -f "server-puppeteer" 2>/dev/null)
if [ ! -z "$PUPPETEER_PROCESSES" ]; then
    echo "🗑️ Killing existing Puppeteer MCP processes: $PUPPETEER_PROCESSES"
    kill $PUPPETEER_PROCESSES 2>/dev/null
    sleep 1
fi

echo "✅ Ready to start fresh backend and MCP processes"

# Start Python backend
echo "🐍 Starting Python backend..."
cd backend && $PYTHON_CMD python_backend.py &
BACKEND_PID=$!
cd "$SCRIPT_DIR"
sleep 2

# Start Electron app
echo "⚡ Starting Electron app..."
npm start

# Cleanup when Electron app closes
cleanup 
