// Authentication and User Management Module
import { state, updateState } from './state.js';

// Demo users configuration
export const DEMO_USERS = {
  alice: { 
    id: 'alice', 
    name: 'Alice', 
    emoji: '👩‍💻', 
    color: '#4285f4', 
    role: 'Frontend Developer' 
  },
  bob: { 
    id: 'bob', 
    name: 'Bob', 
    emoji: '👨‍💼', 
    color: '#34a853', 
    role: 'Product Manager' 
  },
  charlie: { 
    id: 'charlie', 
    name: 'Charlie', 
    emoji: '🧑‍🎨', 
    color: '#fbbc04', 
    role: 'UX Designer' 
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
  
  // Create new header
  const header = document.createElement('div');
  header.className = 'collaboration-header';
  header.innerHTML = `
    <div class="current-user">
      <span class="user-emoji">${currentUser.emoji}</span>
      <span class="user-name">${currentUser.name}</span>
      <span class="user-role">${currentUser.role}</span>
    </div>
    <div class="online-users" id="online-users">
      <!-- Online users will be populated by collaboration module -->
    </div>
    <div class="collaboration-status">
      <span class="status-indicator" id="connection-status"></span>
      <span id="status-text">Connecting...</span>
    </div>
    <div class="user-actions">
      <button class="btn-icon" id="user-menu-btn" title="User Menu">⚙</button>
    </div>
  `;
  
  // Insert header at the top of the body
  document.body.insertBefore(header, document.body.firstChild);
  
  // Add user menu functionality
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
  const statusIndicator = document.getElementById('connection-status');
  const statusText = document.getElementById('status-text');
  
  if (statusIndicator && statusText) {
    statusIndicator.className = `status-indicator ${status}`;
    statusText.textContent = message;
  }
}

/**
 * Show user menu
 */
function showUserMenu() {
  // Create user menu if it doesn't exist
  let userMenu = document.getElementById('user-menu');
  if (!userMenu) {
    userMenu = document.createElement('div');
    userMenu.id = 'user-menu';
    userMenu.className = 'user-menu';
    userMenu.innerHTML = `
      <div class="user-menu-content">
        <div class="user-menu-header">
          <span class="user-emoji">${currentUser.emoji}</span>
          <div class="user-info">
            <div class="user-name">${currentUser.name}</div>
            <div class="user-role">${currentUser.role}</div>
          </div>
        </div>
        <div class="user-menu-actions">
          <button class="menu-item" id="switch-user-btn">
            <span class="menu-icon">↻</span>
            <span class="menu-text">Switch User</span>
          </button>
          <button class="menu-item" id="logout-btn">
            <span class="menu-icon">→</span>
            <span class="menu-text">Logout</span>
          </button>
          <hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;">
          <button class="menu-item" id="clear-storage-btn" style="color: #dc3545;">
            <span class="menu-icon">×</span>
            <span class="menu-text">Clear All Data</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(userMenu);
    
    // Add event listeners
    document.getElementById('switch-user-btn').addEventListener('click', () => {
      hideUserMenu();
      // Clear current user and reload to show login
      logout();
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
      hideUserMenu();
      logout();
    });
    
    document.getElementById('clear-storage-btn').addEventListener('click', () => {
      hideUserMenu();
      clearAllStorageData();
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!userMenu.contains(e.target) && !document.getElementById('user-menu-btn').contains(e.target)) {
        hideUserMenu();
      }
    });
  }
  
  // Toggle menu visibility
  userMenu.style.display = userMenu.style.display === 'block' ? 'none' : 'block';
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