// Main Application Module
import { clearCurrentModeComments } from './comments.js';
import { addMessageToUI } from './chat.js';
import { initDOMElements, state, windowId } from './state.js';
import { initializeUser, isUserAuthenticated, getCurrentUser } from './auth.js';
// Import all core functionality modules
import { initModes } from './modes.js';
import { initTemplateExecution } from './template-execution.js';
import { initSourceExecution } from './source-execution.js';
import { initChat, initAskLLMButton } from './chat.js';
import { initTextSelection, initCommentButtons } from './comments.js';
import { initFileOperations } from './file-operations.js';
import { initSharing } from './sharing.js';
import { initContentMapping } from './content-mapping.js';
import { initVerification } from './verification.js';
import { initDataLake } from './data-lake.js';
import { initTools } from './tools.js';
import { addSampleTools } from './sample-tools.js';
import { initOperators } from './code-instances.js';
import './variables.js'; // Import variables module to initialize it

let documentManager;

// Global error handling
window.addEventListener('error', (e) => {
  console.error('💥 Global JavaScript Error:', e.error);
  console.error('💥 Error message:', e.message);
  console.error('💥 Error source:', e.filename, 'line', e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('💥 Unhandled Promise Rejection:', e.reason);
});

// Main application initialization
async function initApp() {
  try {
    console.log('Initializing Collaborative Workspace...');
    
    // Initialize DOM elements first
    initDOMElements();
    
    // Initialize user authentication
    const userAuthenticated = initializeUser();
    
    if (!userAuthenticated) {
      console.log('User not authenticated, redirecting to login...');
      // If no user is authenticated, redirect to login
      window.location.href = 'login.html';
      return;
    }
    
    console.log('User authenticated:', getCurrentUser()?.name);
    
    // Initialize core functionality modules for main interface
    // This will be overridden when documents are created/switched
    await initializeCoreModules();
    
    // Initialize Document Manager - it will handle document-specific initialization
    // Use the global instance created in document-manager.js
    await import('./document-manager.js');
    documentManager = window.documentManager;
    
    // Start auto-refresh for shared documents
    documentManager.startAutoRefresh();
    
    // Initialize main page functionality
    initMainPageFunctionality();
    
    // Initialize collaboration features
    initCollaborationFeatures();
    
    console.log('Application initialized successfully');
    
  } catch (error) {
    console.error('💥 Error during initialization:', error);
    // Show error message to user
    showErrorMessage('Failed to initialize application. Please refresh the page.');
  }
}

// Initialize all core functionality modules
async function initializeCoreModules() {
  try {
    console.log('Initializing core functionality modules...');
    
    // Initialize all the core modules that handle UI interactions
    initModes(); // Now called at proper time in document-manager.js after tab is visible
    initTemplateExecution();
    initSourceExecution();
    initChat();
    initTextSelection();
    initCommentButtons();
    initAskLLMButton();
    initFileOperations();
    initSharing();
    initContentMapping();
    initVerification();
    initDataLake(); // Initialize Data Lake functionality
    initTools(); // Initialize Tools functionality
    initOperators(); // Initialize Operators functionality
    
    // Add sample tools for demonstration (only if no tools exist)
    addSampleTools();
    
    // Initialize comment translation module
    try {
      await import('./comment-translation.js');
      console.log('✅ Comment translation module loaded');
    } catch (error) {
      console.warn('⚠️ Comment translation module not available:', error);
    }
    
    console.log('Core modules initialized successfully');
  } catch (error) {
    console.error('Error initializing core modules:', error);
    throw error;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Initialize main page functionality
function initMainPageFunctionality() {
  try {
    // Initialize clear comments functionality for when documents are active
    const clearCommentsHandler = () => {
      const activeDoc = documentManager?.getActiveDocument();
      if (activeDoc) {
        // Clear comments for current mode only (unified function handles both highlights and annotations)
        const totalCleared = clearCurrentModeComments();
        
        const modeText = state.currentMode === 'template' ? 'template editor' : 'preview';
        
        addMessageToUI('system', `Cleared ${totalCleared} comment(s) from ${modeText} mode.`);
      }
    };
    
    // Add global clear comments functionality
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('clear-comments-btn')) {
        clearCommentsHandler();
      }
    });
  } catch (error) {
    console.error('💥 Error in initMainPageFunctionality:', error);
  }
}

// Initialize collaboration features
function initCollaborationFeatures() {
  try {
    console.log('Initializing collaboration features...');
    
    // Add collaboration event listeners
    setupCollaborationEventListeners();
    
    // Setup window communication (for multi-window demo)
    setupWindowCommunication();
    
  } catch (error) {
    console.error('💥 Error initializing collaboration features:', error);
  }
}

// Setup collaboration event listeners
function setupCollaborationEventListeners() {
  // Listen for collaboration events from other windows
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    
    ipcRenderer.on('collaboration-event', (event, data) => {
      console.log('Received collaboration event:', data);
      handleCollaborationEvent(data);
    });
  }
  
  // Listen for document changes to broadcast to other users
  document.addEventListener('input', (e) => {
    if (e.target.classList.contains('template-editor')) {
      // Debounce document changes
      clearTimeout(window.documentChangeTimeout);
      window.documentChangeTimeout = setTimeout(() => {
        broadcastDocumentChange({
          type: 'text-change',
          content: e.target.value,
          timestamp: Date.now()
        });
      }, 500);
    }
  });
}

// Handle collaboration events from other windows/users
function handleCollaborationEvent(data) {
  const currentUser = getCurrentUser();
  
  switch (data.type) {
    case 'user-activity':
      showUserActivity(data.user, data.activity);
      break;
    case 'document-change':
      if (data.userId !== currentUser?.id) {
        showDocumentChangeIndicator(data);
      }
      break;
    case 'chat-message':
      if (data.userId !== currentUser?.id) {
        addMessageToUI('user', `${data.user.name}: ${data.message}`);
      }
      break;
    default:
      console.log('Unknown collaboration event:', data.type);
  }
}

// Broadcast document change to other windows
function broadcastDocumentChange(changeData) {
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    const currentUser = getCurrentUser();
    
    ipcRenderer.send('broadcast-to-windows', {
      type: 'document-change',
      userId: currentUser?.id,
      user: currentUser,
      ...changeData
    });
  }
}

// Show user activity in the feed
function showUserActivity(user, activity) {
  // Activity feed has been removed - just log the activity
  console.log(` ${user.name}: ${activity}`);
}

// Show document change indicator
function showDocumentChangeIndicator(data) {
  // Create a temporary indicator
  const indicator = document.createElement('div');
  indicator.className = 'document-change-indicator';
  indicator.innerHTML = `
    <span class="user-emoji">${data.user.emoji}</span>
    <span class="change-text">${data.user.name} is editing...</span>
  `;
  
  // Add to document
  document.body.appendChild(indicator);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }, 3000);
}

// Setup window communication for multi-window demo
function setupWindowCommunication() {
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    
    // Get window information
    ipcRenderer.send('get-window-info');
    
    ipcRenderer.on('window-info', (event, info) => {
      console.log('Window info:', info);
      updateWindowInfo(info);
    });
  }
}

// Update window information display
function updateWindowInfo(info) {
  // Add window info to the collaboration header if needed
  const statusText = document.getElementById('status-text');
  if (statusText && info.totalWindows > 1) {
    statusText.textContent = `Connected (${info.totalWindows} windows)`;
  }
}

// Format time for activity feed
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) { // Less than 1 minute
    return 'just now';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
}

// Show error message to user
function showErrorMessage(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.innerHTML = `
    <div class="error-content">
      <span class="error-icon">❌</span>
      <span class="error-text">${message}</span>
      <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  document.body.appendChild(errorDiv);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 10000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  console.log('Cleaning up before page unload...');
  
  // Broadcast user leaving
  const currentUser = getCurrentUser();
  if (currentUser && window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('broadcast-to-windows', {
      type: 'user-activity',
      userId: currentUser.id,
      user: currentUser,
      activity: 'left the workspace'
    });
  }
});

// Export for debugging
window.collaborationDebug = {
  getCurrentUser,
  isUserAuthenticated,
  broadcastDocumentChange,
  showUserActivity
}; 