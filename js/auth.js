// Authentication and User Management Module
import { state, updateState } from './state.js';
import { createDocumentElement, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';

// Demo users configuration
export const DEMO_USERS = {
  alice: { 
    id: 'alice', 
    name: 'Alice', 
    emoji: '👩‍💻', 
    color: '#4285f4', 
    role: 'Report Consumer' 
  },
  bob: { 
    id: 'bob', 
    name: 'Bob', 
    emoji: '👨‍💼', 
    color: '#34a853', 
    role: 'Report Writer' 
  },
  charlie: { 
    id: 'charlie', 
    name: 'Charlie', 
    emoji: '🧑‍🎨', 
    color: '#fbbc04', 
    role: 'Data Engineer' 
  }
};

// Current user state
let currentUser = null;
let isAuthenticated = false;

/**
 * Initialize user from URL parameters or localStorage
 */
export function initializeUser() {
  console.log('Initializing user authentication...');
  
  // Check URL parameters first (for multi-window launch)
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  
  if (userParam && DEMO_USERS[userParam]) {
    currentUser = DEMO_USERS[userParam];
    isAuthenticated = true;
    console.log(`User loaded from URL: ${currentUser.name}`);
    
    // Store in localStorage for persistence
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Update global state
    updateState({ 
      currentUser: currentUser,
      sessionId: `${currentUser.id}_${Date.now()}`
    });
    
    // Initialize UI with user info
    initializeUserUI();
    
    // Initialize DocumentManager for this user
    setTimeout(() => {
      if (window.documentManager) {
        window.documentManager.initializeForUser();
      }
    }, 100); // Small delay to ensure DocumentManager is loaded
    
    return true;
  }
  
  // Check localStorage for existing session
  const storedUser = localStorage.getItem('currentUser');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      isAuthenticated = true;
      console.log(`User loaded from storage: ${currentUser.name}`);
      
      // Update global state
      updateState({ 
        currentUser: currentUser,
        sessionId: `${currentUser.id}_${Date.now()}`
      });
      
      // Initialize UI with user info
      initializeUserUI();
      
      // Initialize DocumentManager for this user
      setTimeout(() => {
        if (window.documentManager) {
          window.documentManager.initializeForUser();
        }
      }, 100); // Small delay to ensure DocumentManager is loaded
      
      return true;
    } catch (error) {
      console.error('Error parsing stored user:', error);
      localStorage.removeItem('currentUser');
    }
  }
  
  console.log('No user found, authentication required');
  return false;
}

/**
 * Set current user (called from login process)
 */
export function setCurrentUser(userData) {
  currentUser = userData;
  isAuthenticated = true;
  
  // Store in localStorage
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  
  // Update global state
  updateState({ 
    currentUser: currentUser,
    sessionId: `${currentUser.id}_${Date.now()}`
  });
  
  console.log(`User authenticated: ${currentUser.name}`);
  
  // Initialize UI
  initializeUserUI();
  
  // Initialize DocumentManager for this user
  setTimeout(() => {
    if (window.documentManager) {
      window.documentManager.initializeForUser();
    }
  }, 100); // Small delay to ensure DocumentManager is loaded
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Check if user is authenticated
 */
export function isUserAuthenticated() {
  return isAuthenticated && currentUser !== null;
}

/**
 * Logout current user
 */
export function logout() {
  // Clear DocumentManager data first
  if (window.documentManager) {
    window.documentManager.clearUserData();
  }
  
  currentUser = null;
  isAuthenticated = false;
  
  // Clear localStorage
  localStorage.removeItem('currentUser');
  
  // Clear global state
  updateState({ 
    currentUser: null,
    sessionId: null
  });
  
  console.log('User logged out');
  
  // Redirect to login or refresh
  window.location.reload();
}

/**
 * Initialize user interface elements
 */
function initializeUserUI() {
  if (!currentUser) return;
  
  // Create or update user header
  createUserHeader();
  
  // Set user-specific styling
  setUserStyling();
  
  // Initialize collaboration features
  initializeCollaborationUI();
}

/**
 * Create user header in the main interface
 */
function createUserHeader() {
  // Remove existing header if any
  const existingHeader = document.querySelector('.collaboration-header');
  if (existingHeader) {
    existingHeader.remove();
  }
  
  // Create global auth header (not document-specific)
  const header = document.createElement('div');
  header.id = 'collaboration-header';
  header.className = 'collaboration-header';
  header.innerHTML = `
    <div class="user-info">
      <span class="user-emoji">${currentUser.emoji}</span>
      <span class="user-name">${currentUser.name}</span>
      <span class="user-role">(${currentUser.role})</span>
      <button id="user-menu-btn" class="user-menu-btn">⚙️</button>
    </div>
    <div id="connection-status" class="connection-status">
      <span class="status-indicator"></span>
      <span id="status-text" class="status-text">Connected</span>
    </div>
  `;
  
  document.body.prepend(header);
  
  // Set up user menu click handler
  const userMenuBtn = document.getElementById('user-menu-btn');
  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', showUserMenu);
  }
}

/**
 * Set user-specific styling (colors, themes)
 */
function setUserStyling() {
  // Set CSS custom properties for user color
  document.documentElement.style.setProperty('--user-color', currentUser.color);
  document.documentElement.style.setProperty('--user-color-light', currentUser.color + '20');
  
  // Add user-specific class to body
  document.body.classList.add(`user-${currentUser.id}`);
}

/**
 * Initialize collaboration UI elements
 */
function initializeCollaborationUI() {
  // This will be expanded when we add WebSocket functionality
  console.log('Initializing collaboration UI for', currentUser.name);
  
  // Update connection status
  updateConnectionStatus('connected', 'Connected');
}

/**
 * Update connection status indicator
 */
export function updateConnectionStatus(status, message) {
  // Use global IDs for auth-related elements
  const statusIndicator = document.getElementById('connection-status');
  const statusText = document.getElementById('status-text');
  
  if (statusIndicator) {
    statusIndicator.className = `connection-status ${status}`;
  }
  
  if (statusText) {
    statusText.textContent = message || status;
  }
}

/**
 * Show user menu
 */
function showUserMenu() {
  // Use global ID for auth menu
  let userMenu = document.getElementById('user-menu');
  
  if (!userMenu) {
    userMenu = document.createElement('div');
    userMenu.id = 'user-menu';
    userMenu.className = 'user-menu';
    userMenu.innerHTML = `
      <div class="user-menu-content">
        <div class="user-menu-header">
          <span class="user-emoji">${currentUser.emoji}</span>
          <div class="user-details">
            <div class="user-name">${currentUser.name}</div>
            <div class="user-role">${currentUser.role}</div>
          </div>
        </div>
        <div class="user-menu-actions">
          <button id="switch-user-btn" class="menu-action">
            🔄 Switch User
          </button>
          <button id="logout-btn" class="menu-action">
            🚪 Logout
          </button>
          <button id="clear-storage-btn" class="menu-action danger">
            🗑️ Clear All Data
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(userMenu);
    
    // Add event listeners for menu actions - use global IDs
    const switchUserBtn = document.getElementById('switch-user-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const clearStorageBtn = document.getElementById('clear-storage-btn');
    
    if (switchUserBtn) {
      switchUserBtn.addEventListener('click', () => {
        hideUserMenu();
        logout();
        window.location.href = 'login.html';
      });
    }
    
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        hideUserMenu();
        logout();
      });
    }
    
    if (clearStorageBtn) {
      clearStorageBtn.addEventListener('click', () => {
        if (confirm('This will clear all stored data including documents and settings. Are you sure?')) {
          clearAllStorageData();
          logout();
        }
      });
    }
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      const userMenuBtn = document.getElementById('user-menu-btn');
      if (userMenu && !userMenu.contains(e.target) && (!userMenuBtn || !userMenuBtn.contains(e.target))) {
        hideUserMenu();
      }
    });
  }
  
  userMenu.style.display = 'block';
}

/**
 * Hide user menu
 */
function hideUserMenu() {
  const userMenu = document.getElementById('user-menu');
  if (userMenu) {
    userMenu.style.display = 'none';
  }
}

/**
 * Get user color for UI elements
 */
export function getUserColor(userId) {
  return DEMO_USERS[userId]?.color || '#666';
}

/**
 * Get user display info
 */
export function getUserInfo(userId) {
  return DEMO_USERS[userId] || null;
}

/**
 * Clear all localStorage data (for debugging/testing)
 * This will remove all user documents and settings
 */
export function clearAllStorageData() {
  if (confirm('This will permanently delete ALL user documents and data. Are you sure?')) {
    // Get all localStorage keys that contain user data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('easypipe_documents_') || key === 'currentUser')) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all user-related data
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`Removed localStorage key: ${key}`);
    });
    
    console.log(`Cleared ${keysToRemove.length} localStorage entries`);
    alert(`Cleared all storage data (${keysToRemove.length} entries). Page will reload.`);
    
    // Reload the page to start fresh
    window.location.reload();
  }
}

// Add to window object for easy access in console
window.clearAllStorageData = clearAllStorageData; 