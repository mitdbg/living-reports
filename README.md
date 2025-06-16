# 📋 Collaborative Document Workspace

A modern collaborative document creation and management platform with AI-powered features, real-time collaboration, and an integrated development environment for data processing.

## 🌟 Features

## 🛠️ Technology Stack

- **Frontend**: Electron application with HTML/CSS/JavaScript
- **Backend**: Python Flask server with REST API
- **AI Integration**: OpenAI GPT models or Together AI
- **File Processing**: pandas, PyPDF2, openpyxl, BeautifulSoup

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **Python 3.7+**
- **pip** (Python package manager)
- **npm** (Node.js package manager)

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd googledoc_demo
```

### 2. Set Up Environment Variables (Optional but Recommended)
For AI features, set up your API key:
```bash
# For OpenAI
export OPENAI_API_KEY="your-openai-api-key"

# OR for Together AI
export TOGETHER_API_KEY="your-together-api-key"
```

### 3. Launch the Application
The easiest way to start the application is using the provided script:
```bash
./start-demo.sh
```

This script will:
- Check and install Python dependencies
- Check and install Node.js dependencies
- Start the Python backend server
- Launch the Electron application
- Handle cleanup when you close the app


## 📁 Project Structure

```
googledoc_demo/
├── backend/                 # Python Flask backend
│   ├── python_backend.py   # Main Flask application
│   ├── chat_manager.py     # AI chat functionality
│   ├── template.py         # Template processing
│   ├── diff_view.py        # Document diff visualization
│   └── database/           # Data persistence
├── css/                    # Stylesheets
├── js/                     # Frontend JavaScript
├── data/                   # Data files and uploads
├── tests/                  # Test files
├── index.html              # Main application UI
├── login.html              # User authentication
├── main.js                 # Electron main process
├── package.json            # Node.js dependencies
├── requirements.txt        # Python dependencies
└── start-demo.sh          # Quick start script
```

## 🔧 Configuration

### API Keys
- Set `OPENAI_API_KEY` for OpenAI GPT models
- Set `TOGETHER_API_KEY` for Together AI models
- Without API keys, the app runs in basic mode without AI features

### Database
- Documents are stored in `backend/database/documents.json`
- Data lake items in `backend/database/data_lake.json`
- Variables in `backend/database/vars.json`
- All data persists between sessions


# NOTES
- The system uses GPT-3.5-turbo by default
- The system uses `https://6bd2-89-213-179-161.ngrok-free.app/execute_code` endpoint to execute code, you also can set your own local server



