// Main Application Module

import { initDOMElements } from './state.js';
import { initializeUser, isUserAuthenticated, getCurrentUser } from './auth.js';
import { addSampleTools } from './sample-tools.js';

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

    console.log('Application initialized successfully');
    
  } catch (error) {
    console.error('💥 Error during initialization:', error);
    // Show error message to user
    showErrorMessage('Failed to initialize application. Please refresh the page.');
  }
}

// Initialize TRULY GLOBAL modules (no DOM interactions with document elements)
async function initializeCoreModules() {
  try {
    console.log('Initializing truly global modules...');
    
    // TRULY GLOBAL: Only modules that don't touch document-specific DOM elements
    // (All DOM-related modules moved to document-manager.js due to docID prefixing)
    
    // Add sample tools for demonstration (only if no tools exist)
    await addSampleTools(); // ✅ Only adds to global tool registry, no DOM
    
    console.log('Global modules initialized successfully');
    console.log('📋 ALL DOM-related modules will be initialized per document in document-manager');
    console.log('🆔 Reason: All document elements now have docID prefixes (e.g., docID-share-btn)');
  } catch (error) {
    console.error('Error initializing global modules:', error);
    throw error;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Show user activity in the feed
function showUserActivity(user, activity) {
  // Activity feed has been removed - just log the activity
  console.log(` ${user.name}: ${activity}`);
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

// Export for debugging
window.collaborationDebug = {
  getCurrentUser,
  isUserAuthenticated,
  showUserActivity
}; 