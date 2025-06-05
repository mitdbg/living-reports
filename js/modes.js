// Mode Management Module
import { state, elements, updateState, windowId } from './state.js';
import { updateAnnotationsVisibility } from './annotations.js';
import { refreshHighlightEventListeners, updateCodeHighlights } from './comments.js';

// Create window-specific storage for initialization flags and handlers
const MODES_KEY = `modes_${windowId}`;
if (!window[MODES_KEY]) {
  window[MODES_KEY] = {
    modesInitialized: false,
    modeToggleHandler: null,
    currentButton: null, // Track which button currently has the listener
    lastToggleTime: null
  };
}

const modesData = window[MODES_KEY];

export function switchToCode() {
  updateState({ currentMode: 'code' });
  elements.codePanel.classList.add('active');
  elements.previewPanel.classList.remove('active');
  elements.diffView.classList.remove('active');
  elements.toggleModeBtn.textContent = 'Switch to Preview';
  elements.contentTitle.textContent = 'Template Editor';
  updateAnnotationsVisibility();
  
  // Update code highlights when switching to code mode
  setTimeout(() => updateCodeHighlights(), 100);
}

export function switchToPreview() {
  updateState({ currentMode: 'preview' });
  elements.codePanel.classList.remove('active');
  elements.previewPanel.classList.add('active');
  elements.diffView.classList.remove('active');
  elements.toggleModeBtn.textContent = 'Switch to Code';
  elements.contentTitle.textContent = 'Template Output';
  updateAnnotationsVisibility();
  
  // Re-attach event listeners to highlighted text when switching to preview
  refreshHighlightEventListeners();
}

export function switchToDiff() {
  updateState({ currentMode: 'diff' });
  elements.codePanel.classList.remove('active');
  elements.previewPanel.classList.remove('active');
  elements.diffView.classList.add('active');
  elements.toggleModeBtn.textContent = 'Exit Diff View';
  elements.contentTitle.textContent = 'Template Comparison';
  updateAnnotationsVisibility();
}

export function exitDiffMode() {
  // When exiting diff mode, return to preview
  switchToPreview();
}

export function initModes() {
  if (!elements.toggleModeBtn) {
    console.error(`[${windowId}] Toggle mode button not found!`);
    return;
  }
  
  // Remove existing event listener from the previous button if it exists
  if (modesData.modeToggleHandler && modesData.currentButton) {
    console.log(`[${windowId}] Removing event listener from previous button`);
    modesData.currentButton.removeEventListener('click', modesData.modeToggleHandler);
  }
  
  // Create new event handler
  modesData.modeToggleHandler = () => {
    const timestamp = new Date().toISOString();
    const buttonText = elements.toggleModeBtn.textContent;
    
    console.log(`[${windowId}] Mode toggle clicked at ${timestamp}`);
    console.log(`[${windowId}] Current state - mode: ${state.currentMode}, button text: "${buttonText}"`);
    
    // Add a small delay to prevent rapid clicking
    if (modesData.lastToggleTime && Date.now() - modesData.lastToggleTime < 300) {
      console.log(`[${windowId}] Rapid clicking detected, ignoring toggle (${Date.now() - modesData.lastToggleTime}ms since last)`);
      return;
    }
    modesData.lastToggleTime = Date.now();
    
    if (state.currentMode === 'code') {
      console.log(`[${windowId}] Switching from code to preview`);
      switchToPreview();
    } else if (state.currentMode === 'preview') {
      console.log(`[${windowId}] Switching from preview to code`);
      switchToCode();
    } else if (state.currentMode === 'diff') {
      console.log(`[${windowId}] Exiting diff mode to preview`);
      // In diff mode, toggle button should go back to simple view
      exitDiffMode();
    }
    
    console.log(`[${windowId}] Mode toggle completed, new mode: ${state.currentMode}`);
  };
  
  // Add the event listener to the current button
  elements.toggleModeBtn.addEventListener('click', modesData.modeToggleHandler);
  
  // Debug: Check if there are multiple listeners (this is a rough check)
  const listenerCount = elements.toggleModeBtn.cloneNode(true);
  console.log(`[${windowId}] Toggle button element:`, elements.toggleModeBtn);
  console.log(`[${windowId}] Button classes:`, elements.toggleModeBtn.className);
  console.log(`[${windowId}] Button parent:`, elements.toggleModeBtn.parentElement?.className);
  
  // Track which button currently has the listener
  modesData.currentButton = elements.toggleModeBtn;
  
  console.log(`[${windowId}] Modes initialized, button:`, elements.toggleModeBtn);
  
  // Mark as initialized
  modesData.modesInitialized = true;
  window[MODES_KEY] = modesData;
}

// Function to reset initialization flag (for DocumentManager)
export function resetModesInitialization() {
  // Clean up the current event listener before resetting
  if (modesData.modeToggleHandler && modesData.currentButton) {
    console.log(`[${windowId}] Cleaning up event listener during reset`);
    modesData.currentButton.removeEventListener('click', modesData.modeToggleHandler);
  }
  
  modesData.modesInitialized = false;
  modesData.modeToggleHandler = null;
  modesData.currentButton = null;
  modesData.lastToggleTime = null;
  window[MODES_KEY] = modesData;
} 