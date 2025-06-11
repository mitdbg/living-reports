const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Store references to all windows
let windows = new Map();
let loginWindow = null;

// Demo users configuration
const DEMO_USERS = {
  alice: { id: 'alice', name: 'Alice', emoji: '👩‍💻', color: '#4285f4', role: 'Report Consumer' },
  bob: { id: 'bob', name: 'Bob', emoji: '👨‍💼', color: '#34a853', role: 'Report Writer' },
  charlie: { id: 'charlie', name: 'Charlie', emoji: '🧑‍🎨', color: '#fbbc04', role: 'Data Engineer' }
};

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 600,
    height: 1000,
    minWidth: 500,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    resizable: true,
    center: true,
    title: 'Collaboration Demo - Select User'
  });

  loginWindow.loadFile('login.html');
  
  // Open developer tools for debugging
  // loginWindow.webContents.openDevTools();

  loginWindow.on('closed', () => {
    loginWindow = null;
    // If login window is closed and no other windows are open, quit the app
    if (windows.size === 0) {
      app.quit();
    }
  });

  return loginWindow;
}

function createWorkspaceWindow(userData, options = {}) {
  const windowId = userData ? userData.id : 'default';
  
  // Check if window for this user already exists
  if (windows.has(windowId)) {
    const existingWindow = windows.get(windowId);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.focus();
      return existingWindow;
    }
  }

  const defaultOptions = {
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: userData ? `Collaborative Workspace - ${userData.name} ${userData.emoji}` : 'Collaborative Workspace'
  };

  const windowOptions = { ...defaultOptions, ...options };
  const mainWindow = new BrowserWindow(windowOptions);

  // Load the appropriate file with or without query parameters
  if (userData) {
    // Use loadURL with file protocol and query parameters
    const filePath = path.join(__dirname, 'index.html');
    const fileUrl = `file://${filePath}?user=${userData.id}`;
    mainWindow.loadURL(fileUrl);
  } else {
    // Use loadFile for simple case without query parameters
    mainWindow.loadFile('index.html');
  }
  
  // Open developer tools automatically to see console logs
  mainWindow.webContents.openDevTools();

  // Store window reference
  windows.set(windowId, mainWindow);

  // Handle window close
  mainWindow.on('closed', () => {
    windows.delete(windowId);
    console.log(`Window closed for user: ${windowId}`);
    
    // If all windows are closed and no login window, quit the app
    if (windows.size === 0 && !loginWindow) {
      app.quit();
    }
  });

  console.log(`Created workspace window for user: ${userData ? userData.name : 'default'}`);
  return mainWindow;
}

// Check command line arguments for user parameter
function getUserFromArgs() {
  const args = process.argv;
  const userArg = args.find(arg => arg.startsWith('--user='));
  if (userArg) {
    const userId = userArg.split('=')[1];
    return DEMO_USERS[userId] || null;
  }
  return null;
}

app.whenReady().then(() => {
  console.log('Electron app ready');
  
  // Check if user was specified via command line
  const userFromArgs = getUserFromArgs();
  
  if (userFromArgs) {
    // Direct launch with specific user
    console.log(`Launching directly with user: ${userFromArgs.name}`);
    createWorkspaceWindow(userFromArgs);
  } else {
    // Show login window for user selection
    console.log('Showing login window for user selection');
    createLoginWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (windows.size === 0 && !loginWindow) {
    createLoginWindow();
  }
});

// IPC handlers for login window
ipcMain.on('user-selected', (event, userData) => {
  console.log('User selected:', userData.name);
  
  // Create workspace window for selected user
  createWorkspaceWindow(userData);
  
  // Close login window
  if (loginWindow) {
    loginWindow.close();
  }
  
  // Send confirmation back to login window
  event.reply('workspace-launched');
});

ipcMain.on('launch-demo-mode', (event) => {
  console.log('Launching demo mode with Alice and Bob');
  
  try {
    // Create window for Alice
    const aliceWindow = createWorkspaceWindow(DEMO_USERS.alice, {
      x: 100,
      y: 100
    });
    
    // Create window for Bob (offset position)
    setTimeout(() => {
      const bobWindow = createWorkspaceWindow(DEMO_USERS.bob, {
        x: 200,
        y: 150
      });
      
      // Send confirmation back to login window
      event.reply('demo-launched');
      
      // Close login window after a short delay
      setTimeout(() => {
        if (loginWindow) {
          loginWindow.close();
        }
      }, 1500);
      
    }, 500); // Small delay to stagger window creation
    
  } catch (error) {
    console.error('Error launching demo mode:', error);
    event.reply('launch-error', error.message);
  }
});

ipcMain.on('login-cancelled', (event) => {
  console.log('Login cancelled');
  app.quit();
});

// IPC handler for getting app path (for database storage)
ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

// File dialog handling for various file types including binary files
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md', 'js', 'css', 'json'] },
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'Web Files', extensions: ['html', 'htm'] }
    ]
  });
  
  if (canceled) {
    return null;
  }
  
  const filePath = filePaths[0];
  const fileName = path.basename(filePath);
  const fileExt = path.extname(fileName).toLowerCase();
  
  try {
    // Determine if file should be read as binary
    const binaryExtensions = [
      '.xlsx', '.xls', '.pdf',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg',
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.mp3', '.wav', '.ogg', '.m4a', '.flac',
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.exe', '.dmg', '.app', '.deb', '.rpm'
    ];
    const isBinary = binaryExtensions.includes(fileExt);
    
    let content;
    let mimeType = null;
    
    if (isBinary) {
      // Read binary files and encode as base64
      const buffer = fs.readFileSync(filePath);
      content = buffer.toString('base64');
      
      // Determine MIME type for images and videos
      const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska'
      };
      mimeType = mimeMap[fileExt];
    } else {
      // Read text files as UTF-8
      content = fs.readFileSync(filePath, 'utf8');
    }
    
    return {
      path: filePath,
      name: fileName,
      content: content,
      type: mimeType || `text/${fileExt.substring(1)}`, // Add MIME type
      size: fs.statSync(filePath).size, // Add file size
      isBinary: isBinary,
      fileType: fileExt
    };
  } catch (error) {
    console.error('Error reading file:', error);
    return { error: error.message };
  }
});

// Additional IPC handlers for collaboration features
ipcMain.on('get-window-info', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const windowId = Array.from(windows.entries()).find(([id, win]) => win === window)?.[0];
  
  event.reply('window-info', {
    windowId,
    totalWindows: windows.size,
    windowList: Array.from(windows.keys())
  });
});

ipcMain.on('broadcast-to-windows', (event, data) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  
  // Broadcast to all other windows
  windows.forEach((window, windowId) => {
    if (window !== senderWindow && !window.isDestroyed()) {
      window.webContents.send('collaboration-event', data);
    }
  });
});

// Handle app termination
app.on('before-quit', () => {
  console.log(' App is quitting, closing all windows');
  
  // Close all workspace windows
  windows.forEach((window, windowId) => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });
  
  // Close login window
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
});

console.log(' Electron main process initialized with multi-window support');