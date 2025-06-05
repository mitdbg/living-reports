// Mode Management Module
import { state, elements, updateState, windowId } from './state.js';
import { updateAnnotationsVisibility } from './annotations.js';
import { refreshHighlightEventListeners, updateCodeHighlights } from './comments.js';
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

// Helper function to get the active document container
function getActiveDocumentContainer() {
  // Find the active document tab content (not the template)
  const activeContent = document.querySelector('.tab-content.active:not(.document-tab-template)');
  if (activeContent) {
    return activeContent;
  }
  
  // Fallback: find any visible tab content that's not the template
  const visibleContent = document.querySelector('.tab-content[style*="flex"]:not(.document-tab-template), .tab-content:not([style*="none"]):not(.document-tab-template)');
  if (visibleContent) {
    return visibleContent;
  }
  
  return null;
}

// Update active button states
function updateModeButtonStates(activeMode) {
  // Find the active document container first
  const container = getActiveDocumentContainer();
  if (!container) {
    return;
  }
  
  // Find buttons within the active document container
  const sourceModeBtn = container.querySelector('.source-mode-btn');
  const templateModeBtn = container.querySelector('.template-mode-btn');
  const previewModeBtn = container.querySelector('.preview-mode-btn');
  
  if (!sourceModeBtn || !templateModeBtn || !previewModeBtn) {
    return;
  }
  
  // Remove active class from all buttons
  sourceModeBtn.classList.remove('active');
  templateModeBtn.classList.remove('active');
  previewModeBtn.classList.remove('active');
  
  // Add active class to current mode button
  switch (activeMode) {
    case 'source':
      sourceModeBtn.classList.add('active');
      break;
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
  
  // Find the active document container first
  const container = getActiveDocumentContainer();
  if (!container) {
    return;
  }
  
  // Find panels within the active document container
  const sourcePanel = container.querySelector('.source-panel');
  const templatePanel = container.querySelector('.template-panel');
  const previewPanel = container.querySelector('.preview-panel');
  const diffView = container.querySelector('.diff-view');
  const contentTitle = container.querySelector('#content-title, .content-title');
  
  if (sourcePanel) {
    sourcePanel.classList.add('active');
  }
  
  if (templatePanel) {
    templatePanel.classList.remove('active');
  }
  
  if (previewPanel) {
    previewPanel.classList.remove('active');
  }
  
  if (diffView) {
    diffView.classList.remove('active');
  }
  
  if (contentTitle) {
    contentTitle.textContent = 'Source Code Editor';
  }
  
  updateModeButtonStates('source');
  updateAnnotationsVisibility();
  
  // Update code highlights when switching to source mode
  setTimeout(() => updateCodeHighlights(), 100);
}

export function switchToTemplate() {
  console.log(`[${windowId}] Switching to template mode`);
  
  // Check if user can switch to template mode
  if (!canUserSwitchModes()) {
    console.log(`[${windowId}] User ${getCurrentUser()?.name} (${getCurrentUser()?.role}) cannot switch to template mode`);
    return;
  }
  
  updateState({ currentMode: 'template' });
  
  // Find the active document container first
  const container = getActiveDocumentContainer();
  if (!container) {
    return;
  }
  
  // Find panels within the active document container
  const sourcePanel = container.querySelector('.source-panel');
  const templatePanel = container.querySelector('.template-panel');
  const previewPanel = container.querySelector('.preview-panel');
  const diffView = container.querySelector('.diff-view');
  const contentTitle = container.querySelector('#content-title, .content-title');
  
  if (sourcePanel) {
    sourcePanel.classList.remove('active');
  }
  
  if (templatePanel) {
    templatePanel.classList.add('active');
  }
  
  if (previewPanel) {
    previewPanel.classList.remove('active');
  }
  
  if (diffView) {
    diffView.classList.remove('active');
  }
  
  if (contentTitle) {
    contentTitle.textContent = 'Template Editor';
  }
  
  updateModeButtonStates('template');
  updateAnnotationsVisibility();
  
  // Update code highlights when switching to template mode
  setTimeout(() => updateCodeHighlights(), 100);
}

export function switchToPreview() {
  console.log(`[${windowId}] Switching to preview mode`);
  
  updateState({ currentMode: 'preview' });
  
  // Find the active document container first
  const container = getActiveDocumentContainer();
  if (!container) {
    return;
  }
  
  // Find panels within the active document container
  const sourcePanel = container.querySelector('.source-panel');
  const templatePanel = container.querySelector('.template-panel');
  const previewPanel = container.querySelector('.preview-panel');
  const diffView = container.querySelector('.diff-view');
  const contentTitle = container.querySelector('#content-title, .content-title');
  
  if (sourcePanel) {
    sourcePanel.classList.remove('active');
  }
  
  if (templatePanel) {
    templatePanel.classList.remove('active');
  }
  
  if (previewPanel) {
    previewPanel.classList.add('active');
  }
  
  if (diffView) {
    diffView.classList.remove('active');
  }
  
  if (contentTitle) {
    contentTitle.textContent = 'Report Preview';
  }
  
  updateModeButtonStates('preview');
  updateAnnotationsVisibility();
  
  // Re-attach event listeners to highlighted text when switching to preview
  refreshHighlightEventListeners();
}

export function switchToDiff() {
  // Check if user can switch to diff mode
  if (!canUserSwitchModes()) {
    console.log(`[${windowId}] User ${getCurrentUser()?.name} (${getCurrentUser()?.role}) cannot switch to diff mode`);
    return;
  }
  
  updateState({ currentMode: 'diff' });
  elements.sourcePanel.classList.remove('active');
  elements.templatePanel.classList.remove('active');
  elements.previewPanel.classList.remove('active');
  elements.diffView.classList.add('active');
  
  elements.contentTitle.textContent = 'Template Comparison';
  // Don't update button states for diff mode - keep the previous active button
  updateAnnotationsVisibility();
}

export function exitDiffMode() {
  // When exiting diff mode, return to preview
  switchToPreview();
}

// Force preview mode for consumers
function enforceConsumerMode() {
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    // Consumer should always be in preview mode, but only if elements are initialized
    if (elements.previewPanel && state.currentMode !== 'preview') {
      switchToPreview();
    }
    
    // Hide mode buttons for consumers
    const modeButtons = document.querySelector('.mode-buttons');
    if (modeButtons) {
      modeButtons.style.display = 'none';
    }
    
    // Hide source and template panels for consumers
    if (elements.sourcePanel) {
      elements.sourcePanel.style.display = 'none';
    }
    
    if (elements.templatePanel) {
      elements.templatePanel.style.display = 'none';
    }
    
    // Hide execute buttons for consumers (they can't execute code or templates)
    if (elements.executeSourceBtn) {
      elements.executeSourceBtn.style.display = 'none';
    }
    
    if (elements.executeTemplateBtn) {
      elements.executeTemplateBtn.style.display = 'none';
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
    // Check if buttons exist
    if (!elements.sourceModeBtn || !elements.templateModeBtn || !elements.previewModeBtn) {
      console.log(`[${windowId}] Mode buttons not found, they might be in different document tabs`);
      return;
    }
    
    // Check if buttons are actually visible and have dimensions
    const buttonRect = elements.sourceModeBtn.getBoundingClientRect();
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
  
  // Re-enforce consumer mode restrictions after reset
  setTimeout(() => {
    enforceConsumerMode();
  }, 50);
}