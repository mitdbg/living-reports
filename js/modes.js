// Mode Management Module
import { state, getElements, updateState, windowId } from './state.js';
import { refreshHighlightEventListeners } from './comments.js';
import { getCurrentUser } from './auth.js';

// Create window-specific storage for initialization flags and handlers
const MODES_KEY = `modes_${windowId}`;
if (!window[MODES_KEY]) {
  window[MODES_KEY] = {
    modesInitialized: false,
    eventDelegationSetup: false
  };
}

const modesData = window[MODES_KEY];

// Check if current user can switch modes
export function canUserSwitchModes() {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  
  // Alice (Report Consumer) cannot switch modes, only view preview
  if (currentUser.role === 'Report Consumer') {
    return false;
  }
  
  return true;
}

// Setup event delegation for mode buttons (like Clear Comments button)
function setupModeButtonEventDelegation() {
  if (modesData.eventDelegationSetup) {
    return;
  }
  
  // Add global event delegation for mode buttons
  document.addEventListener('click', (e) => {
    // Check if user can switch modes
    if (!canUserSwitchModes()) {
      return;
    }
    
    // Handle mode button clicks
    if (e.target.classList.contains('source-mode-btn')) {
      switchToSource();
    } else if (e.target.classList.contains('template-mode-btn')) {
      switchToTemplate();
    } else if (e.target.classList.contains('preview-mode-btn')) {
      switchToPreview();
    }
  });
  
  modesData.eventDelegationSetup = true;
  window[MODES_KEY] = modesData;
}

// Update active button states using document-specific elements
function updateModeButtonStates(activeMode) {
  const sourceModeBtn = getElements.sourceModeBtn;
  const templateModeBtn = getElements.templateModeBtn;
  const previewModeBtn = getElements.previewModeBtn;
  
  if (!templateModeBtn || !previewModeBtn) {
    console.log(`[${windowId}] Mode buttons not found for current document`);
    return;
  }
  
  // Remove active class from all buttons
  if (sourceModeBtn) sourceModeBtn.classList.remove('active');
  templateModeBtn.classList.remove('active');
  previewModeBtn.classList.remove('active');
  
  // Add active class to current mode button
  switch (activeMode) {
    // case 'source':
    //   sourceModeBtn.classList.add('active');
    //   break;
    case 'template':
      templateModeBtn.classList.add('active');
      break;
    case 'preview':
      previewModeBtn.classList.add('active');
      break;
  }
}

export function switchToSource() {
  console.log(`[${windowId}] Switching to source mode`);
  
  updateState({ currentMode: 'source' });
  
  // Use document-specific elements from state.js
  const sourcePanel = getElements.sourcePanel;
  const templatePanel = getElements.templatePanel;
  const previewPanel = getElements.previewPanel;
  const diffView = getElements.diffView;
  const contentTitle = getElements.contentTitle;
  
  // Also handle operators panel
  const operatorsPanel = getElements.operatorsPanel || document.querySelector('.operators-panel.active');
  
  if (sourcePanel) {
    sourcePanel.classList.add('active');
    sourcePanel.style.display = 'block';
  }
  
  if (templatePanel) {
    templatePanel.classList.remove('active');
    templatePanel.style.display = 'none';
  }
  
  if (previewPanel) {
    previewPanel.classList.remove('active');
    previewPanel.style.display = 'none';
  }
  
  // Hide operators panel if it's active
  if (operatorsPanel) {
    operatorsPanel.classList.remove('active');
    operatorsPanel.style.display = 'none';
  }
  
  if (diffView) {
    diffView.classList.remove('active');
  }
  
  updateModeButtonStates('source');
  
  // Refresh all highlights when switching to source mode
  setTimeout(() => refreshHighlightEventListeners(), 100);
}

export function switchToTemplate() {
  console.log(`[${windowId}] Switching to template mode`);
  
  // Check if user can switch to template mode
  if (!canUserSwitchModes()) {
    console.log(`[${windowId}] User ${getCurrentUser()?.name} (${getCurrentUser()?.role}) cannot switch to template mode`);
    return;
  }
  
  updateState({ currentMode: 'template' });
  
  // Use document-specific elements from state.js
  const sourcePanel = getElements.sourcePanel;
  const templatePanel = getElements.templatePanel;
  const previewPanel = getElements.previewPanel;
  const diffView = getElements.diffView;
  const contentTitle = getElements.contentTitle;
  
  // Also handle operators panel
  const operatorsPanel = getElements.operatorsPanel || document.querySelector('.operators-panel.active');
  
  if (sourcePanel) {
    sourcePanel.classList.remove('active');
    sourcePanel.style.display = 'none';
  }
  
  if (templatePanel) {
    templatePanel.classList.add('active');
    templatePanel.style.display = 'block';
  }
  
  if (previewPanel) {
    previewPanel.classList.remove('active');
    previewPanel.style.display = 'none';
  }
  
  // Hide operators panel if it's active
  if (operatorsPanel) {
    operatorsPanel.classList.remove('active');
    operatorsPanel.style.display = 'none';
  }
  
  if (diffView) {
    diffView.classList.remove('active');
  }
  updateModeButtonStates('template');
  
  // Update code highlights when switching to template mode
  setTimeout(() => refreshHighlightEventListeners(), 100);
}

export function switchToPreview() {
  console.log(`[${windowId}] Switching to preview mode`);
  
  updateState({ currentMode: 'preview' });
  
  // Use document-specific elements from state.js
  const sourcePanel = getElements.sourcePanel;
  const templatePanel = getElements.templatePanel;
  const previewPanel = getElements.previewPanel;
  const diffView = getElements.diffView;
  const contentTitle = getElements.contentTitle;
  
  // Also handle operators panel
  const operatorsPanel = getElements.operatorsPanel || document.querySelector('.operators-panel.active');
  
  if (sourcePanel) {
    sourcePanel.classList.remove('active');
    sourcePanel.style.display = 'none';
  }
  
  if (templatePanel) {
    templatePanel.classList.remove('active');
    templatePanel.style.display = 'none';
  }
  
  if (previewPanel) {
    previewPanel.classList.add('active');
    previewPanel.style.display = 'block';
  }
  
  // Hide operators panel if it's active
  if (operatorsPanel) {
    operatorsPanel.classList.remove('active');
    operatorsPanel.style.display = 'none';
  }
  
  if (diffView) {
    diffView.classList.remove('active');
  }
  
  updateModeButtonStates('preview');
  
  // Auto-execute template if switching from template mode and user can switch modes
  if (canUserSwitchModes()) {
    console.log(`[${windowId}] Auto-executing template when switching to preview`);
    // Import and execute template - use dynamic import to avoid circular dependency
    import('./template-execution.js').then(module => {
      module.executeTemplate(false, true); // isLiveUpdate = true to avoid showing status messages
    }).catch(error => {
      console.error(`[${windowId}] Error auto-executing template:`, error);
    });
  }
  
  // Refresh highlights when switching to preview mode
  setTimeout(() => refreshHighlightEventListeners(), 100);
}

export function switchToDiff() {
  // Check if user can switch to diff mode
  if (!canUserSwitchModes()) {
    console.log(`[${windowId}] User ${getCurrentUser()?.name} (${getCurrentUser()?.role}) cannot switch to diff mode`);
    return;
  }
  
  updateState({ currentMode: 'diff' });
  
  // Use document-specific elements from state.js
  const sourcePanel = getElements.sourcePanel;
  const templatePanel = getElements.templatePanel;
  const previewPanel = getElements.previewPanel;
  const diffView = getElements.diffView;
  const contentTitle = getElements.contentTitle;
  
  // Also handle operators panel
  const operatorsPanel = getElements.operatorsPanel || document.querySelector('.operators-panel.active');
  
  if (sourcePanel) sourcePanel.classList.remove('active');
  if (templatePanel) templatePanel.classList.remove('active');
  if (previewPanel) previewPanel.classList.remove('active');
  
  // Hide operators panel if it's active
  if (operatorsPanel) {
    operatorsPanel.classList.remove('active');
    operatorsPanel.style.display = 'none';
  }
  
  if (diffView) diffView.classList.add('active');
  
  if (contentTitle) {
    contentTitle.textContent = 'Template Comparison';
  }
  // Don't update button states for diff mode - keep the previous active button
}

export function exitDiffMode() {
  // When exiting diff mode, return to preview
  switchToPreview();
}

// Force preview mode for consumers
function enforceConsumerMode() {
  // Check if we have an active document before enforcing mode
  if (!window.documentManager?.activeDocumentId) {
    console.log(`[${windowId}] No active document for enforcing consumer mode`);
    return;
  }
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    // Consumer should always be in preview mode
    if (getElements.previewPanel && state.currentMode !== 'preview') {
      switchToPreview();
    }
    
    // Hide mode buttons for consumers using document-specific selectors
    const modeButtons = document.querySelector('.mode-buttons');
    if (modeButtons) {
      modeButtons.style.display = 'none';
    }
    
    // Hide source and template panels for consumers
    if (getElements.sourcePanel) {
      getElements.sourcePanel.style.display = 'none';
    }
    
    if (getElements.templatePanel) {
      getElements.templatePanel.style.display = 'none';
    }
    
    // Hide execute buttons for consumers (they can't execute code)
    if (getElements.executeSourceBtn) {
      getElements.executeSourceBtn.style.display = 'none';
    }
    
    // Hide the source and template controls sections
    const sourceControls = document.querySelector('.source-controls');
    if (sourceControls) {
      sourceControls.style.display = 'none';
    }
    
    const templateControls = document.querySelector('.template-controls');
    if (templateControls) {
      templateControls.style.display = 'none';
    }
    
    console.log(`[${windowId}] Consumer mode enforced for ${currentUser.name} - hiding source and template UI elements but allowing comments`);
  }
}

export function initModes() {
  console.log(`[${windowId}] Initializing modes...`);
  
  // Setup event delegation once
  setupModeButtonEventDelegation();
  
  // Simple fix: wait a moment for the tab to become visible
  setTimeout(() => {
    // Check if buttons exist using document-specific access
    if (!getElements.templateModeBtn || !getElements.previewModeBtn) {
      console.log(`[${windowId}] Mode buttons not found for current document`);
      return;
    }
    
    // Check if buttons are actually visible and have dimensions
    const buttonRect = getElements.templateModeBtn.getBoundingClientRect();
    if (buttonRect.width === 0 || buttonRect.height === 0) {
      console.log(`[${windowId}] Mode buttons not visible yet, but event delegation is set up`);
      return;
    }
    
    console.log(`[${windowId}] Mode buttons are visible, finalizing initialization`);
    
    // Check user role and enforce restrictions
    const currentUser = getCurrentUser();
    console.log(`[${windowId}] Initializing modes for user: ${currentUser?.name} (${currentUser?.role})`);
    
    // Enforce consumer mode restrictions
    enforceConsumerMode();
    
    // Update button states to match current mode
    updateModeButtonStates(state.currentMode);
    
    console.log(`[${windowId}] Modes initialized, current mode: ${state.currentMode}`);
    
    // Mark as initialized
    modesData.modesInitialized = true;
    window[MODES_KEY] = modesData;
  }, 100); // Small delay to allow DOM to render
}

// Function to reset initialization flag (for DocumentManager)
export function resetModesInitialization() {
  // Note: We don't reset eventDelegationSetup because it should only be set up once globally
  modesData.modesInitialized = false;
  window[MODES_KEY] = modesData;
  
  // Only re-enforce consumer mode if there's still an active document
  setTimeout(() => {
    // Check if we still have an active document before trying to enforce mode
    if (window.documentManager?.activeDocumentId) {
      enforceConsumerMode();
    }
  }, 50);
}
