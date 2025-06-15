// State Management Module

// Get window-specific identifier
function getWindowId() {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('user');
  return userId || 'default';
}

// Create window-specific storage keys
const windowId = getWindowId();
const ELEMENTS_KEY = `elements_${windowId}`;
const STATE_KEY = `state_${windowId}`;

// Global DOM element references - will be initialized after DOM loads
// Make this window-specific by storing in window object
if (!window[ELEMENTS_KEY]) {
  window[ELEMENTS_KEY] = {};
}
export let elements = window[ELEMENTS_KEY];

// Function to initialize DOM elements after DOM is loaded
export function initDOMElements() {
  console.log(`Initializing DOM elements for window: ${windowId}`);
  
  // Initialize all DOM element references
  elements.sourceModeBtn = document.querySelector('.source-mode-btn');
  elements.templateModeBtn = document.querySelector('.template-mode-btn');
  elements.previewModeBtn = document.querySelector('.preview-mode-btn');
  elements.executeSourceBtn = document.querySelector('.execute-source-btn');
  elements.executeTemplateBtn = document.querySelector('.execute-template-btn');
  elements.executionStatus = document.querySelector('.execution-status');
  elements.sourceExecutionStatus = document.querySelector('.source-execution-status');
  elements.templateExecutionStatus = document.querySelector('.template-execution-status');
  elements.sendButton = document.querySelector('.send-button');
  elements.clearChatBtn = document.querySelector('.clear-chat-btn');
  elements.messageInput = document.querySelector('.message-input');
  elements.chatMessages = document.querySelector('.chat-messages');
  elements.previewContent = document.querySelector('.preview-content');
  elements.sourceEditor = document.querySelector('.source-editor');
  elements.templateEditor = document.querySelector('.template-editor');
  elements.openFileBtn = document.querySelector('.open-file-btn');
  elements.clearContextBtn = document.querySelector('.clear-context-btn');
  elements.shareBtn = document.querySelector('.share-btn');
  elements.floatingComment = document.querySelector('.floating-comment');
  elements.commentText = document.querySelector('.comment-text');
  elements.askLLMBtn = document.querySelector('.ask-llm');
  elements.addCommentBtn = document.querySelector('.add-comment');
  elements.cancelCommentBtn = document.querySelector('.cancel-comment');
  elements.previewPanel = document.querySelector('.preview-panel');
  elements.sourcePanel = document.querySelector('.source-panel');
  elements.templatePanel = document.querySelector('.template-panel');
  elements.diffView = document.querySelector('.diff-view');
  elements.variablesDisplay = document.querySelector('.variables-display');
  elements.variablesList = document.querySelector('.variables-list');
  elements.acceptSuggestionBtn = document.querySelector('.accept-suggestion');
  elements.rejectSuggestionBtn = document.querySelector('.reject-suggestion');
  elements.diffCurrentContent = document.querySelector('.diff-current-content');
  elements.diffSuggestedContent = document.querySelector('.diff-suggested-content');
  elements.clearCommentsBtn = document.querySelector('.clear-comments-btn');
  elements.contextFilesSection = document.querySelector('.context-files-section');
  elements.contextFilesList = document.querySelector('.context-files-list');
  elements.contentTitle = document.querySelector('#content-title');
  
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