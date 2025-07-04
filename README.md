# 📋 Collaborative Document Workspace

A modern collaborative document creation and management platform with AI-powered features, real-time collaboration, and an integrated development environment for data processing.

## 🌟 Features

## 🛠️ Technology Stack

- **Frontend**: Electron application with HTML/CSS/JavaScript
- **Backend**: Python Flask server with REST API
- **AI Integration**: OpenAI GPT models or Together AI
- **File Processing**: pandas, PyMuPDF, openpyxl, BeautifulSoup

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **Python 3.7+**
- **pip** (Python package manager)
- **npm** (Node.js package manager)

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/MITDBG/googledoc_demo.git
cd googledoc_demo
```

### 2. Install Dependencies and Set Up Environment
```bash
./install-deps.sh
```

This script will:
- Create a Python virtual environment
- Install Python dependencies
- Install Node.js dependencies
- Create a `.env` file from template (if it doesn't exist)

### 3. Configure API Keys (Optional but Recommended)
Edit the `.env` file created by the install script:
```bash
# For OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# OR for Together AI
TOGETHER_API_KEY=your_together_api_key_here
```

### 4. Launch the Application
```bash
./start-demo.sh
```

This script will:
- Start the Python backend server
- Launch the Electron application
- Handle cleanup when you close the app


## 📁 Project Structure

```
googledoc_demo/
├── backend/                # Python Flask backend
│   ├── python_backend.py   # Main Flask application
│   ├── chat_manager.py     # AI chat functionality
│   ├── template.py         # Template processing
│   ├── diff_view.py        # Document diff visualization
│   └── database/           # Data persistence
│   └── requirements.txt    # Python dependencies
├── css/                    # Stylesheets
├── js/                     # Frontend JavaScript
├── data/                   # Data files and uploads
├── tests/                  # Test files
├── index.html              # Main application UI
├── login.html              # User authentication
├── main.js                 # Electron main process
├── package.json            # Node.js dependencies
└── start-demo.sh          # Quick start script
```

## 🔧 Configuration

### API Keys
- The `.env` file is automatically created from `env.example` template during installation
- Set `OPENAI_API_KEY` for OpenAI GPT models
- Set `TOGETHER_API_KEY` for Together AI models
- Without API keys, the app runs in basic mode without AI features

### Database
- Documents are stored in `backend/database/documents.json`
- Data sources items in `backend/database/data_sources.json`
- Variables in `backend/database/vars.json`
- All data persists between sessions


# NOTES
- The system uses GPT-4.1-mini by default
- The system uses `https://6bd2-89-213-179-161.ngrok-free.app/execute_code` endpoint to execute code, you also can set your own local server
