// Get window-specific identifier
function getWindowId() {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('user');
  return userId || 'default';
}

// Import element ID manager for document-specific access
import { getDocumentElement } from './element-id-manager.js';

// Create window-specific storage keys
const windowId = getWindowId();
const ELEMENTS_KEY = `elements_${windowId}`;
const STATE_KEY = `state_${windowId}`;

// Document-aware element access functions
export const getElements = {
  // Mode buttons
  get sourceModeBtn() { return getDocumentElement('source-mode-btn'); },
  get templateModeBtn() { return getDocumentElement('template-mode-btn'); },
  get previewModeBtn() { return getDocumentElement('preview-mode-btn'); },
  
  // Execute buttons
  get executeSourceBtn() { return getDocumentElement('execute-source-btn'); },
  get executeTemplateBtn() { return getDocumentElement('execute-template-btn'); },
  
  // Status elements
  get executionStatus() { return getDocumentElement('execution-status'); },
  get sourceExecutionStatus() { return getDocumentElement('source-execution-status'); },
  get templateExecutionStatus() { return getDocumentElement('template-execution-status'); },
  
  // Chat elements
  get sendButton() { return getDocumentElement('send-button'); },
  get clearChatBtn() { return getDocumentElement('clear-chat-btn'); },
  get messageInput() { return getDocumentElement('message-input'); },
  get chatMessages() { return getDocumentElement('chat-messages'); },
  
  // Content editors
  get previewContent() { return getDocumentElement('preview-content'); },
  get sourceEditor() { return getDocumentElement('source-editor'); },
  get templateEditor() { return getDocumentElement('template-editor'); },
  
  // Action buttons
  get openFileBtn() { return getDocumentElement('open-file-btn'); },
  get clearContextBtn() { return getDocumentElement('clear-context-btn'); },
  get shareBtn() { return getDocumentElement('share-btn'); },
  
  // Comment elements
  get floatingComment() { return getDocumentElement('floating-comment'); },
  get commentText() { return getDocumentElement('comment-text'); },
  get askLLMBtn() { return getDocumentElement('ask-llm-btn'); },
  get addCommentBtn() { return getDocumentElement('add-comment-btn'); },
  get cancelCommentBtn() { return getDocumentElement('cancel-comment-btn'); },
  
  // Panel elements
  get previewPanel() { return getDocumentElement('preview-panel'); },
  get sourcePanel() { return getDocumentElement('source-panel'); },
  get templatePanel() { return getDocumentElement('template-panel'); },
  
  // Diff view elements
  get diffView() { return getDocumentElement('diff-view'); },
  get acceptSuggestionBtn() { return getDocumentElement('accept-suggestion-btn'); },
  get rejectSuggestionBtn() { return getDocumentElement('reject-suggestion-btn'); },
  get diffCurrentContent() { return getDocumentElement('diff-current-content'); },
  get diffSuggestedContent() { return getDocumentElement('diff-suggested-content'); },
  
  // Variables elements
  get variablesDisplay() { return getDocumentElement('variables-display'); },
  get variablesList() { return getDocumentElement('variables-list'); },
  
  // Context files elements
  get contextFilesSection() { return getDocumentElement('context-files-section'); },
  get contextFilesList() { return getDocumentElement('context-files-list'); },
  
  // Title element
  get contentTitle() { return getDocumentElement('content-title'); }
};

// Legacy elements object for modules that haven't been updated yet
export const elements = {
  get sourceModeBtn() { return getElements.sourceModeBtn; },
  get templateModeBtn() { return getElements.templateModeBtn; },
  get previewModeBtn() { return getElements.previewModeBtn; },
  get executeSourceBtn() { return getElements.executeSourceBtn; },
  get executeTemplateBtn() { return getElements.executeTemplateBtn; },
  get executionStatus() { return getElements.executionStatus; },
  get sourceExecutionStatus() { return getElements.sourceExecutionStatus; },
  get templateExecutionStatus() { return getElements.templateExecutionStatus; },
  get sendButton() { return getElements.sendButton; },
  get clearChatBtn() { return getElements.clearChatBtn; },
  get messageInput() { return getElements.messageInput; },
  get chatMessages() { return getElements.chatMessages; },
  get previewContent() { return getElements.previewContent; },
  get sourceEditor() { return getElements.sourceEditor; },
  get templateEditor() { return getElements.templateEditor; },
  get openFileBtn() { return getElements.openFileBtn; },
  get clearContextBtn() { return getElements.clearContextBtn; },
  get shareBtn() { return getElements.shareBtn; },
  get floatingComment() { return getElements.floatingComment; },
  get commentText() { return getElements.commentText; },
  get askLLMBtn() { return getElements.askLLMBtn; },
  get addCommentBtn() { return getElements.addCommentBtn; },
  get cancelCommentBtn() { return getElements.cancelCommentBtn; },
  get previewPanel() { return getElements.previewPanel; },
  get sourcePanel() { return getElements.sourcePanel; },
  get templatePanel() { return getElements.templatePanel; },
  get diffView() { return getElements.diffView; },
  get variablesDisplay() { return getElements.variablesDisplay; },
  get variablesList() { return getElements.variablesList; },
  get acceptSuggestionBtn() { return getElements.acceptSuggestionBtn; },
  get rejectSuggestionBtn() { return getElements.rejectSuggestionBtn; },
  get diffCurrentContent() { return getElements.diffCurrentContent; },
  get diffSuggestedContent() { return getElements.diffSuggestedContent; },
  get contextFilesSection() { return getElements.contextFilesSection; },
  get contextFilesList() { return getElements.contextFilesList; },
  get contentTitle() { return getElements.contentTitle; }
};

// Function to initialize DOM elements after DOM is loaded
export function initDOMElements() {
  // Store back to window object
  window[ELEMENTS_KEY] = elements;
  
  // Initialize DOM elements if not already done
  if (!elements.executeSourceBtn || !elements.templateEditor || !elements.previewContent) {
    console.log(`Initializing DOM elements for window: ${windowId}`);
  }
  
  console.log(`DOM elements initialized for window: ${windowId}`, elements);
}

// Application state - make window-specific
if (!window[STATE_KEY]) {
  window[STATE_KEY] = {
    currentMode: 'template', // 'source', 'template', 'preview', 'diff'
    sessionId: Math.random().toString(36).substring(7),
    currentTemplate: '',
    currentSourceCode: '',
    currentOutput: '',
    variables: {},
    suggestedTemplates: [],
    suggestedOutputs: [],
    currentSuggestionIndex: 0,
    activeLineChanges: [],
    isEditingTemplate: false,
    debouncedExecuteTimer: null,

    // Display modes and variable references
    currentDisplayMode: 'output_only', // 'output_only' or 'output_and_variables'
    variablesInfo: null,
    currentVarDefinitions: null,
    suggestedVarDefinitions: null,
    currentRenderingMode: 'output_only',
    
    // Comment systems
    comments: {},  // Unified comment structure: commentId -> comment object
    commentIdCounter: 0,
    
    // Context files
    loadedContextFiles: []
  };
}

export const state = window[STATE_KEY];

// State update helpers
export function updateState(updates) {
  if (window.updateState) {
    window.updateState(updates);
  } else {
    Object.assign(state, updates);
  }
  // Update the window-specific state
  window[STATE_KEY] = state;
}

export function resetSuggestionState() {
  updateState({
    suggestedTemplates: [],
    suggestedOutputs: [],
    currentSuggestionIndex: 0,
    activeLineChanges: []
  });
}

export function incrementCommentCounter() {
  state.commentIdCounter++;
  window[STATE_KEY] = state;
  return state.commentIdCounter;
}

// Export window ID for debugging
export { windowId };