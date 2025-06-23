#!/bin/bash

# Dependency Installation Script
echo "📦 Installing Dependencies..."

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

# Install Python dependencies
echo "📦 Installing Python dependencies..."
"$VENV_DIR/bin/pip" install -r backend/requirements.txt

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "📦 Node modules already exist, skipping..."
fi

# Check for .env file
echo "🔐 Checking for environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f "env.example" ]; then
        echo "📝 Creating .env file from template..."
        cp env.example .env
        echo "⚠️  Please edit .env file and add your API keys:"
        echo "   - OPENAI_API_KEY for OpenAI GPT models"
        echo "   - TOGETHER_API_KEY for Together AI models"
        echo "   You only need one of these keys for AI features to work."
    else
        echo "⚠️  No .env file found. Please create one with your API keys:"
        echo "   OPENAI_API_KEY=your_openai_api_key_here"
        echo "   TOGETHER_API_KEY=your_together_api_key_here"
    fi
else
    echo "✅ .env file found"
fi

echo "✅ All dependencies installed successfully!"
echo "🚀 You can now run ./start-demo.sh to start the application." 