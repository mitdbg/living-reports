# Collaborative Workspace - Electron UI

A real-time collaborative document workspace built with Electron, featuring multi-user editing, chat, and template processing.

## 🚀 Phase 1 Features (Current)

### ✅ Implemented
- **Multi-User Authentication**: Choose from predefined demo users (Alice, Bob, Charlie)
- **Multi-Window Support**: Launch multiple Electron windows for different users
- **User Presence**: See who's online with real-time status indicators
- **HTTP Polling Communication**: Real-time collaboration via 1-second polling
- **User Interface**: Personalized UI with user-specific colors and themes
- **Comment Synchronization**: Real-time comment sharing between users
- **Demo Mode**: Quick launch with 2 windows for instant collaboration testing

### 🎯 Demo Users
- **Alice** 👩‍💻 - Frontend Developer (Blue theme)
- **Bob** 👨‍💼 - Product Manager (Green theme)  
- **Charlie** 🧑‍🎨 - UX Designer (Yellow theme)

## 🛠️ Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Python 3.7+
- npm or yarn

### Option 1: Easy Start (Recommended)
```bash
cd electron-ui
./start-demo.sh
```

This script will:
1. Install Python dependencies
2. Install Node.js dependencies
3. Start the WebSocket server
4. Start the Python backend (optional)
5. Launch the Electron app

### Option 2: Manual Start

1. **Install Dependencies**
```bash
cd electron-ui
npm install
pip3 install -r requirements.txt
```

2. **Start Python Backend (Optional, for AI features)**
```bash
cd backend && python3 python_backend.py
```

4. **Start Electron App**
```bash
npm start
```

## 🎭 Demo Modes

### Quick Demo Mode
- Click "Launch Demo (2 Windows)" in the login screen
- Automatically opens Alice and Bob windows
- Perfect for testing collaboration features

### Manual Mode
- Select a specific user from the login screen
- Launch additional windows with different users
- Use command line: `npm start -- --user=alice`

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   User A        │    │   User B        │
│   Electron      │    │   Electron      │
│   Window        │    │   Window        │
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      └──────┬─────────┬─────┘
             │         │
    ┌────────▼─────────▼────────┐
    │   WebSocket Server        │
    │   (Port 5001)             │
    │   - User Management       │
    │   - Real-time Events      │
    └───────────────────────────┘
```

## 🔧 Development

### File Structure
```
electron-ui/
├── main.js                 # Electron main process
├── login.html              # User selection screen
├── index.html              # Main workspace
├── js/
│   ├── auth.js             # User authentication
│   ├── app.js              # Main application logic
│   └── ...
├── backend/
│   └── python_backend.py   # AI/Template backend
└── styles.css              # UI styling
```