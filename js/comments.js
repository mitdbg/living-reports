// Comments and Text Selection Module
import { state, getElements, elements, windowId, incrementCommentCounter } from './state.js';
import { escapeHtml, escapeRegExp, calculateSafePosition, getTextContentWithLineBreaks } from './utils.js';
import { createFloatingAnnotation, showAnnotationForText, refreshAnnotationElements, clearActiveAnnotationHighlight, removeHighlightWrapper } from './annotations.js';
import { addMessageToUI, addWaitingIndicator, removeWaitingIndicator } from './chat.js';
import { getCurrentUser } from './auth.js';
import { 
  createDocumentElement, 
  createDocumentElementId, 
  getDocumentElement, 
  registerElement 
} from './element-id-manager.js';

/**
 * Parse structured LLM response for AI suggestions
 * @param {string} suggestion - Raw AI suggestion text
 * @param {string} fullContent - Full content context  
 * @param {Object} context - Additional context (legacy parameter)
 * @returns {Object|null} - Parsed suggestion with new_text, explanation, confidence
 */
function parseStructuredLLMResponse(suggestion, fullContent, context = {}) {
  try {
    console.log('Parsing structured LLM response:', { suggestion, fullContent, context });
    
    // Check if suggestion is already a parsed object
    if (typeof suggestion === 'object' && suggestion !== null) {
      console.log('Suggestion is already parsed object:', suggestion);
      
      // Validate required fields
      if (suggestion && suggestion.new_text) {
        return {
          new_text: suggestion.new_text,
          explanation: suggestion.explanation || 'AI suggestion',
          confidence: suggestion.confidence || 0.8
        };
      } else {
        console.warn('Parsed object missing required fields:', suggestion);
        return null;
      }
    }
    
    // If not an object, treat as string and try to parse as JSON
    if (typeof suggestion === 'string' && suggestion.trim().startsWith('{') && suggestion.trim().endsWith('}')) {
      const parsed = JSON.parse(suggestion);
      
      // Validate required fields
      if (parsed.new_text && parsed.explanation) {
        return {
          new_text: parsed.new_text,
          explanation: parsed.explanation || 'AI suggestion',
          confidence: parsed.confidence || 0.8
        };
      }
    }
    
    // If not JSON, try to extract structured content from text (only if it's a string)
    if (typeof suggestion !== 'string') {
      console.warn('Suggestion is not a string and not a valid object:', suggestion);
      return null;
    }
    
    const lines = suggestion.split('\n').map(line => line.trim()).filter(line => line);
    
    // Look for common patterns in AI responses
    let newText = '';
    let explanation = '';
    let confidence = 0.8;
    
    // Pattern 1: Look for "Replace with:" or "Change to:" patterns
    const replaceMatch = suggestion.match(/(?:replace with|change to|new text):\s*["']?([^"'\n]+)["']?/i);
    if (replaceMatch) {
      newText = replaceMatch[1];
    }
    
    // Pattern 2: Look for explanation patterns
    const explanationMatch = suggestion.match(/(?:explanation|reason|because):\s*([^\n]+)/i);
    if (explanationMatch) {
      explanation = explanationMatch[1];
    }
    
    // Pattern 3: Look for confidence patterns
    const confidenceMatch = suggestion.match(/(?:confidence|certainty):\s*(\d+(?:\.\d+)?)/i);
    if (confidenceMatch) {
      confidence = parseFloat(confidenceMatch[1]);
      if (confidence > 1) confidence = confidence / 100; // Convert percentage to decimal
    }
    
    // If no structured patterns found, use the whole suggestion as new text
    if (!newText) {
      // Try to find the main suggestion content
      const codeBlockMatch = suggestion.match(/```[\s\S]*?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        newText = codeBlockMatch[1].trim();
      } else if (lines.length > 0) {
        // Use the longest line as the main suggestion
        newText = lines.reduce((longest, current) => 
          current.length > longest.length ? current : longest, ''
        );
      } else {
        newText = suggestion.trim();
      }
    }
    
    if (!explanation) {
      explanation = 'AI-generated improvement suggestion';
    }
    
    // Validate we have meaningful content
    if (!newText || newText.length < 1) {
      console.warn('parseStructuredLLMResponse: No meaningful content found in suggestion');
      return null;
    }
    
    return {
      new_text: newText,
      explanation: explanation,
      confidence: Math.max(0.1, Math.min(1.0, confidence)) // Clamp between 0.1 and 1.0
    };
    
  } catch (error) {
    console.error('Error parsing LLM response:', error);
    
    // Fallback: use the raw suggestion
    if (suggestion && suggestion.trim().length > 0) {
      return {
        new_text: suggestion.trim(),
        explanation: 'AI suggestion (fallback parsing)',
        confidence: 0.7
      };
    }
    
    return null;
  }
}

// Create window-specific storage for initialization flags and handlers
const COMMENTS_KEY = `comments_${windowId}`;
if (!window[COMMENTS_KEY]) {
  window[COMMENTS_KEY] = {
    textSelectionInitialized: false,
    commentButtonsInitialized: false,
    previewMouseUpHandler: null,
    templateEditorMouseUpHandler: null,
    templateEditorKeyUpHandler: null,
    templateEditorInputHandler: null,
    templateEditorScrollHandler: null,
    addCommentHandler: null,
    cancelCommentHandler: null,
    askLLMHandler: null,
    currentAddCommentBtn: null, // Track which button currently has the listener
    currentCancelCommentBtn: null, // Track which button currently has the listener
    currentAskLLMBtn: null // Track which button currently has the listener
  };
}

const commentsData = window[COMMENTS_KEY];

function deleteSingleComment(commentId, comment) {
  console.log(`Deleting comment: ${commentId}`);
  
  const highlights = document.querySelectorAll(`.text-comment-highlight[data-comment-id="${commentId}"]`);
  highlights.forEach(highlight => {
    removeHighlightWrapper(highlight);
  });
  
  if (comment.ui && comment.ui.element) {
    console.log(`Removing floating annotation for comment: ${commentId}`);
    comment.ui.element.remove();
  }
  
  delete state.comments[commentId];
}

export function clearAllComments() {
  console.log('Clearing all comments (unified function)');
  
  // Get all comments to delete
  const commentsToRemove = Object.entries(state.comments);
  console.log(`Found ${commentsToRemove.length} comments to delete`);
  
  // Delete each comment using shared logic
  commentsToRemove.forEach(([commentId, comment], index) => {
    console.log(`Deleting comment ${index + 1}/${commentsToRemove.length}`);
    deleteSingleComment(commentId, comment);
  });
  
  // Reset comment counter
  state.commentIdCounter = 0;
  
  // Trigger auto-save for comment changes
  if (window.documentManager && commentsToRemove.length > 0) {
    window.documentManager.onContentChange();
  }
  
  console.log('All comments cleared successfully');
}

// Clear only comments for the current mode (unified function)
export function clearCurrentModeComments() {
  console.log('Clearing comments for current mode:', state.currentMode);
  console.log('Available comments:', Object.keys(state.comments));
  
  // Find comments for current mode
  const commentsToRemove = Object.entries(state.comments).filter(([id, comment]) => 
    comment.mode === state.currentMode
  );
  
  console.log('Comments to remove:', commentsToRemove.map(([id, comment]) => ({ id, mode: comment.mode })));
  
  // Delete each comment using shared logic
  commentsToRemove.forEach(([commentId, comment], index) => {
    console.log(`Deleting comment ${index + 1}/${commentsToRemove.length}`);
    deleteSingleComment(commentId, comment);
  });
  
  // Trigger auto-save for comment changes
  if (window.documentManager && commentsToRemove.length > 0) {
    window.documentManager.onContentChange();
  }
  
  console.log(`Removed ${commentsToRemove.length} comments from current mode`);
  return commentsToRemove.length;
}

// Keep old function name for backward compatibility
export function clearCurrentModeTextComments() {
  return clearCurrentModeComments();
}


// Text comment management functions
export function createTextComment(selectedText, commentContent) {
  const commentId = `text-comment-${incrementCommentCounter()}`;
  const currentUser = getCurrentUser();
  const commentData = {
    id: commentId,
    selectedText: selectedText,
    commentMessage: commentContent,
    mode: state.currentMode,
    author: currentUser ? currentUser.id : 'anonymous',
    authorName: currentUser ? currentUser.name : 'Anonymous',
    authorEmoji: currentUser ? currentUser.emoji : '👤',
    authorColor: currentUser ? currentUser.color : '#666666',
    createdAt: new Date().toISOString(),
    messages: [],
    isResolved: false,
    isActive: true,
    ui: {
      position: null,
      element: null,
      isVisible: false,
      isDragging: false
    }
  };
  
  state.comments[commentId] = commentData;

  createTextHighlight({
    selectedText: selectedText,
    commentId: commentId,
  });
  
  // Instead of creating floating annotation, add to sidebar
  try {
    import('./sidebar-comments.js').then(({ sidebarComments }) => {
      sidebarComments.addComment(commentData);
    });
  } catch (error) {
    console.warn('Could not add comment to sidebar:', error);
    // Fallback to floating annotation if sidebar is not available
    import('./annotations.js').then(({ createFloatingAnnotation }) => {
      createFloatingAnnotation(selectedText, commentContent, commentData);
    });
  }
  
  addMessageToUI('system', `Comment added: "${commentContent}" for text "${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}"`);

  if (window.documentManager) {
    window.documentManager.onContentChange();
  }
}


/**
 * Unified highlighting function for all HTML-based elements (preview, template editor, source editor)
 */
function highlightInHtmlElement(targetElement, selectedText, commentId) {
  let content = targetElement.innerHTML;

  // For HTML content (with tags), do direct replacement
  if (/<[^>]*>/.test(selectedText)) {
    console.log('Using direct HTML replacement for:', selectedText.substring(0, 100));
    
    if (content.includes(selectedText)) {
      const highlightElement = createDocumentElement('div', `text-comment-highlight-${commentId}`, 'comments', getCurrentDocumentId());
      highlightElement.setAttribute('data-comment-id', commentId);
      highlightElement.setAttribute('title', 'Click to view comment');
      highlightElement.className = 'text-comment-highlight';
      
      const replacement = `<div data-comment-id="${commentId}" title="Click to view comment" class="text-comment-highlight">${selectedText}</div>`;
      content = content.replace(selectedText, replacement);
      console.log('Direct HTML replacement successful');
    } else {
      console.warn('HTML selectedText not found in content');
      return false;
    }
  } else {
    // For plain text selectedText, use simple escaping
    console.log('Using escaped text replacement');
    const escapedText = escapeHtml(selectedText);
    
    if (content.includes(escapedText)) {
      const replacement = `<div data-comment-id="${commentId}" title="Click to view comment" class="text-comment-highlight">${escapedText}</div>`;
      content = content.replace(escapedText, replacement);
      console.log('Escaped text replacement successful');
    } else {
      console.warn('Escaped text not found in content');
      return false;
    }
  }
  
  targetElement.innerHTML = content;
  
  // Add event listener to the newly created highlight
  const newHighlight = targetElement.querySelector(`.text-comment-highlight[data-comment-id="${commentId}"]`);
  if (newHighlight && !newHighlight.hasAttribute('data-listener-attached')) {
    newHighlight.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAnnotationForText(selectedText);
    });
    newHighlight.setAttribute('data-listener-attached', 'true');
  }
  
  return true;
}

// Function to re-attach event listeners to all highlighted text elements
function reattachHighlightEventListeners() {
  const highlights = document.querySelectorAll('.text-comment-highlight');
  highlights.forEach(element => {
    // Remove existing listeners to avoid duplicates
    const existingListener = element.getAttribute('data-listener-attached');
    if (existingListener) {
      return; // Skip if listener already attached
    }
    
    // Add click listener
    element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const selectedText = element.textContent;
      showAnnotationForText(selectedText);
    });
    
    // Mark as having listener attached
    element.setAttribute('data-listener-attached', 'true');
    
    // Check if this highlight should be visible in current mode
    const selectedText = element.textContent;
    const comment = Object.values(state.comments).find(c => c.selectedText === selectedText);
    
    if (comment && comment.mode !== state.currentMode) {
      element.style.display = 'none';
    } else {
      element.style.display = 'inline';
    }
  });
}

// Export the function so it can be called from other modules when preview content is updated
export function refreshHighlightEventListeners(skipAnnotationRefresh = false) {
  reattachHighlightEventListeners();
  reattachtemplateEditorHighlightEventListeners();
  
  // Only refresh annotation elements if not skipping (to prevent flicker when showing annotations)
  if (!skipAnnotationRefresh) {
    refreshAnnotationElements();
  }
}

// Function to re-attach event listeners to code editor highlighted text elements
function reattachtemplateEditorHighlightEventListeners() {
  const templateEditor = getElements.templateEditor;
  if (!templateEditor) return;
  
  // Find all highlighted text elements in code editor
  const highlightElements = templateEditor.querySelectorAll('.text-comment-highlight');
  
  highlightElements.forEach(element => {
    // Check if this highlight should be visible in current mode
    const selectedText = element.textContent;
    const comment = Object.values(state.comments).find(c => c.selectedText === selectedText);
    
    if (comment && comment.mode !== state.currentMode) {
      // Hide highlights that don't match current mode
      element.style.display = 'none';
      return;
    } else {
      // Show highlights that match current mode
      element.style.display = 'inline';
    }
    
    // Only add event listener if it doesn't already have one
    if (!element.hasAttribute('data-listener-attached')) {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Show the full annotation window
        showAnnotationForText(selectedText);
      });
      element.setAttribute('data-listener-attached', 'true');
    }
  });
}

export function closeTextCommentPopup() {
  const popup = getDocumentElement('text-comment-popup') || document.querySelector('.text-comment-popup');
  if (popup) {
    popup.remove();
  }
}

export function getTextCommentsMap() {
  return Object.fromEntries(
    Object.entries(state.comments).map(([id, comment]) => [
      id, 
      {
        selectedText: comment.selectedText,
        commentMessage: comment.commentMessage,
        mode: comment.mode,
        author: comment.author,
        authorName: comment.authorName,
        authorEmoji: comment.authorEmoji,
        authorColor: comment.authorColor,
        createdAt: comment.createdAt
      }
    ])
  );
}

function calculateCommentPosition(selectionRect, preferredSide = 'right') {
  const commentWidth = 320;
  const commentHeight = 150;
  const gap = 30;
  const margin = 20; // Margin from viewport edges
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  let finalLeft, finalTop;
  
  // Try preferred side first (right or left)
  if (preferredSide === 'right') {
    finalLeft = selectionRect.right + gap;
  } else {
    finalLeft = selectionRect.left - commentWidth - gap;
  }
  
  // Start with selection top
  finalTop = selectionRect.top;
  
  // Check if it goes off the right edge
  if (finalLeft + commentWidth > viewportWidth - margin) {
    // Switch to left side
    finalLeft = selectionRect.left - commentWidth - gap;
  }
  
  // Check if it goes off the left edge
  if (finalLeft < margin) {
    // Switch to right side
    finalLeft = selectionRect.right + gap;
    
    // If still off screen, clamp to margin and position vertically
    if (finalLeft + commentWidth > viewportWidth - margin) {
      finalLeft = margin;
      // Position below selection to avoid overlap
      finalTop = selectionRect.bottom + gap;
      
      // If below doesn't fit, position above
      if (finalTop + commentHeight > viewportHeight - margin) {
        finalTop = selectionRect.top - commentHeight - gap;
      }
    }
  }
  
  // Ensure it doesn't go off the bottom
  if (finalTop + commentHeight > viewportHeight - margin) {
    finalTop = viewportHeight - commentHeight - margin;
  }
  
  // Ensure it doesn't go off the top
  if (finalTop < margin) {
    finalTop = margin;
  }
  
  return { left: finalLeft, top: finalTop };
}

export function initTextSelection() {  
  // Get elements using clean getElements
  const previewContent = getElements.previewContent;
  const templateEditor = getElements.templateEditor;
  const floatingComment = getElements.floatingComment;
  
  if (!previewContent || !templateEditor || !floatingComment) {
    console.error(`[${windowId}] Text selection elements not found!`, {
      previewContent: !!previewContent,
      templateEditor: !!templateEditor,
      floatingComment: !!floatingComment
    });
    return;
  }
  
  // Remove existing event listeners if they exist
  if (commentsData.textSelectionInitialized) {
    if (commentsData.previewMouseUpHandler) {
      previewContent.removeEventListener('mouseup', commentsData.previewMouseUpHandler);
    }
    if (commentsData.templateEditorMouseUpHandler) {
      templateEditor.removeEventListener('mouseup', commentsData.templateEditorMouseUpHandler);
    }
    if (commentsData.templateEditorKeyUpHandler) {
      templateEditor.removeEventListener('keyup', commentsData.templateEditorKeyUpHandler);
    }
    if (commentsData.templateEditorInputHandler) {
      templateEditor.removeEventListener('input', commentsData.templateEditorInputHandler);
    }
    if (commentsData.templateEditorScrollHandler) {
      templateEditor.removeEventListener('scroll', commentsData.templateEditorScrollHandler);
    }
  }
  
  // Create new event handlers
  commentsData.previewMouseUpHandler = handleTextSelection;
  commentsData.templateEditorMouseUpHandler = handleTextSelection;
  commentsData.templateEditorKeyUpHandler = handleTextSelection;
  commentsData.templateEditorInputHandler = updateCodeHighlights;
  commentsData.templateEditorScrollHandler = updateCodeHighlights;
  
  // For preview content (regular HTML)
  previewContent.addEventListener('mouseup', commentsData.previewMouseUpHandler);
  
  // For template editor (contenteditable div) - uses same selection handling as preview
  templateEditor.addEventListener('mouseup', commentsData.templateEditorMouseUpHandler);
  templateEditor.addEventListener('keyup', commentsData.templateEditorKeyUpHandler);
  
  // Update code highlights when editor content changes or scrolls
  templateEditor.addEventListener('input', commentsData.templateEditorInputHandler);
  templateEditor.addEventListener('scroll', commentsData.templateEditorScrollHandler);

  // Global click handler to hide floating comment when clicking elsewhere
  document.addEventListener('click', function(e) {
    // Only hide comment window if clicking completely outside the comment system
    if (!e.target.closest('.floating-comment') && 
        !e.target.closest('.text-comment-highlight') &&
        !window.getSelection().toString().trim()) {
      floatingComment.style.display = 'none';
    }
    
    // Clear active annotation highlighting when clicking elsewhere (but not on annotation windows or highlighted text)
    if (!e.target.closest('.floating-annotation') && 
        !e.target.closest('.text-comment-highlight')) {
      clearActiveAnnotationHighlight();
    }
  });
  
  // Hide on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      floatingComment.style.display = 'none';
      clearActiveAnnotationHighlight();
      window.getSelection().removeAllRanges();
    }
  });
  
  console.log(`[${windowId}] Text selection initialized`);
  
  // Mark as initialized
  commentsData.textSelectionInitialized = true;
  window[COMMENTS_KEY] = commentsData;
}

function handleTextSelection(event) {
  const selection = window.getSelection();
  
  // Get clean elements
  const floatingComment = getElements.floatingComment;
  const commentText = getElements.commentText;
  const templateEditor = getElements.templateEditor;
  const previewContent = getElements.previewContent;
  
  if (selection.rangeCount === 0) {
    if (floatingComment) {
      floatingComment.style.display = 'none';
      floatingComment.storedSelectionRange = null;
    }
    return;
  }
  
  const range = selection.getRangeAt(0);
  let selectedText = '';
  
  // Check if the selection is within contenteditable elements (template or source editor)

  if ((templateEditor && templateEditor.contains(range.commonAncestorContainer))) {
    // For contenteditable elements, use the utility function to preserve line breaks
    try {
      // Create a temporary container with the selected content
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(range.cloneContents());
      selectedText = getTextContentWithLineBreaks(tempDiv);
    } catch (error) {
      console.warn('Error extracting text with line breaks, falling back to toString:', error);
      selectedText = selection.toString();
    }
  } else {
    // For preview content, save HTML directly to match preview_content format
    if (previewContent && previewContent.contains(range.commonAncestorContainer)) {
      try {
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(range.cloneContents());
        selectedText = tempDiv.innerHTML; // Save as HTML
        console.log('Preview mode: saving HTML content as selectedText:', selectedText);
      } catch (error) {
        console.warn('Error extracting HTML content, falling back to toString:', error);
        selectedText = selection.toString();
      }
    } else {
      // For other areas, use the standard method
      selectedText = selection.toString();
    }
  }
  
  if (selectedText.length > 0) {
    // Check if the selected text is already highlighted
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      
      // Check if the selection is within an existing highlight
      let element = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;
      while (element && element !== document.body) {
        if (element.classList && element.classList.contains('text-comment-highlight')) {
          console.log('Text is already highlighted, ignoring selection');
          if (floatingComment) {
            floatingComment.style.display = 'none';
            floatingComment.storedSelectionRange = null;
          }
          return;
        }
        element = element.parentElement;
      }
    }
    
    const cleanedText = selectedText;
    
    if (!cleanedText) {
      console.warn('Invalid text selection, ignoring');
      if (floatingComment) {
        floatingComment.style.display = 'none';
        floatingComment.storedSelectionRange = null;
      }
      return;
    }
    
    const rect = range.getBoundingClientRect();
    
    if (rect.width > 0 && rect.height > 0 && floatingComment) {
      // Store the selection range immediately for later use
      const storedRange = range.cloneRange();
      
      console.log('Processing text selection:', cleanedText.substring(0, 50) + (cleanedText.length > 50 ? '...' : ''));
      console.log('Original selected text length:', selectedText.length, 'Cleaned length:', cleanedText.length);
      
      // Use the extracted positioning function
      const { left, top } = calculateCommentPosition(rect, 'right');
      
      floatingComment.style.display = 'block';
      floatingComment.style.top = `${top}px`;
      floatingComment.style.left = `${left}px`;
      floatingComment.dataset.selectedText = cleanedText; // Use cleaned text
      // Store the range in the floating comment element for later retrieval
      floatingComment.storedSelectionRange = storedRange;
      if (commentText) commentText.value = '';
    } else {
      if (floatingComment) {
        floatingComment.style.display = 'none';
        floatingComment.storedSelectionRange = null;
      }
    }
  } else {
    if (floatingComment) {
      floatingComment.style.display = 'none';
      floatingComment.storedSelectionRange = null;
    }
  }
}

export function updateCodeHighlights() {
  reattachtemplateEditorHighlightEventListeners();
}

export function initCommentButtons() {
  // Get elements using clean getElements
  const addCommentBtn = getElements.addCommentBtn;
  const cancelCommentBtn = getElements.cancelCommentBtn;
  const floatingComment = getElements.floatingComment;
  
  if (!addCommentBtn) {
    console.error(`[${windowId}] Add comment button not found!`);
    return;
  }
  if (!cancelCommentBtn) {
    console.error(`[${windowId}] Cancel comment button not found!`);
    return;
  }
  if (!floatingComment) {
    console.error(`[${windowId}] Floating comment element not found!`);
    return;
  }
  
  // Remove existing event listeners from previous buttons if they exist
  if (commentsData.addCommentHandler && commentsData.currentAddCommentBtn) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous add comment button`);
    commentsData.currentAddCommentBtn.removeEventListener('click', commentsData.addCommentHandler);
  }
  if (commentsData.cancelCommentHandler && commentsData.currentCancelCommentBtn) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous cancel comment button`);
    commentsData.currentCancelCommentBtn.removeEventListener('click', commentsData.cancelCommentHandler);
  }
  
  commentsData.askLLMHandler = async () => {
    console.log(`[${windowId}] Ask AI clicked - Mode: ${state.currentMode}`);
    const selectedText = floatingComment.dataset.selectedText;
    const commentText = getElements.commentText;
    const commentContent = commentText ? commentText.value : '';

    if (!selectedText) {
      addMessageToUI('system', 'Please select some text first.');
      return;
    }

    let userRequest = commentContent || 'Please provide suggestions for this content.';
    
    let waitingIndicatorAdded = false;

    try {
      addMessageToUI('user', `🤖 Ask AI: "${userRequest}"\n📄 Context: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"`);

      addWaitingIndicator();
      waitingIndicatorAdded = true;

       await handleAskAI(selectedText, userRequest);

      floatingComment.style.display = 'none';

    } catch (error) {
      console.error('Error sending to AI:', error);
      addMessageToUI('system', 'Error: Failed to send message to AI. Please try again.');
    } finally {
      if (waitingIndicatorAdded) {
        try {
          removeWaitingIndicator();
        } catch (indicatorError) {
          console.warn('Error removing waiting indicator:', indicatorError);
        }
      }
    }
  };
  
  const askLLMBtn = floatingComment.querySelector('.ask-llm');
  if (askLLMBtn) {
    if (commentsData.currentAskLLMBtn) {
      console.log(`[${windowId}] 🧹 Removing event listener from previous ask AI button`);
      commentsData.currentAskLLMBtn.removeEventListener('click', commentsData.askLLMHandler);
    }
    
    askLLMBtn.addEventListener('click', commentsData.askLLMHandler);
    commentsData.currentAskLLMBtn = askLLMBtn;
  }
  
  commentsData.addCommentHandler = async () => {
    console.log(`[${windowId}] Add comment clicked - Mode: ${state.currentMode}`);
    const selectedText = floatingComment.dataset.selectedText;
    const commentText = getElements.commentText;
    const commentContent = commentText ? commentText.value : '';
    
    if (!selectedText) {
      addMessageToUI('system', 'Please select some text first.');
      return;
    }

    try {
        if (state.currentMode === 'template') {
         await handleAddComment(selectedText, commentContent);
       } else if (state.currentMode === 'preview') {
         await handleAddComment(selectedText, commentContent);
       } else if (state.currentMode === 'source') {
         await handleAddComment(selectedText, commentContent);
       } else {
         await handleAddComment(selectedText, commentContent);
       }
    } catch (error) {
      console.error('Error processing comment:', error);
      addMessageToUI('system', 'Error: Failed to process comment. Please try again.');
    }

    floatingComment.style.display = 'none';
  };

  commentsData.cancelCommentHandler = () => {
    console.log(`[${windowId}] Cancel comment clicked`);
    floatingComment.style.display = 'none';
  };
  
  addCommentBtn.addEventListener('click', commentsData.addCommentHandler);
  cancelCommentBtn.addEventListener('click', commentsData.cancelCommentHandler);
  
  // Track which buttons currently have the listeners
  commentsData.currentAddCommentBtn = addCommentBtn;
  commentsData.currentCancelCommentBtn = cancelCommentBtn;
  
  console.log(`[${windowId}] Comment buttons initialized`);
  
  // Mark as initialized
  commentsData.commentButtonsInitialized = true;
  window[COMMENTS_KEY] = commentsData;
}

/**
 * Unified AI suggestion handler for all modes (template, preview, source)
 */
async function handleAskAI(selectedText, userRequest, mode = null) {
  // Determine mode if not provided
  const actualMode = mode || state.currentMode;
  console.log(`Handling ${actualMode} + AskAI scenario`);
  
  // Get content and element based on mode using clean getElements
  let content = '';
  let targetElement = null;
  
  switch (actualMode) {
    case 'template':
      targetElement = getElements.templateEditor;
      content = targetElement ? targetElement.innerHTML : '';
      break;
    case 'preview':
    default:
      targetElement = getElements.previewContent;
      content = targetElement ? targetElement.innerHTML : '';
      break;
  }
  
  // Send request to AI suggestion endpoint
  try {
    const response = await fetch('http://127.0.0.1:5000/api/ai-suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        full_content: content,
        selected_text: selectedText,
        user_request: userRequest,
        mode: actualMode,
        session_id: state.sessionId
      })
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if we got a valid suggestion
    if (data.success && data.suggestion) {
      // Parse the suggestion using existing logic
      const parsedSuggestion = parseStructuredLLMResponse(
        data.suggestion, 
        content, 
        { isVariable: false, varName: null, currentValue: null, instance: null }
      );
      
      if (parsedSuggestion) {
        await createAISuggestionFromParsed(selectedText, userRequest, parsedSuggestion, actualMode);
        addMessageToUI('system', `✅ AI suggestion created for ${actualMode} content`);
      } else {
        addMessageToUI('system', '🤖 AI provided feedback but no specific content changes suggested');
      }
    } else {
      addMessageToUI('system', '🤖 AI provided feedback but no specific content changes suggested');
    }
    
  } catch (error) {
    console.error(`Error getting ${actualMode} AI suggestion:`, error);
  }
  
  // SAFEGUARD: Re-enable text selection handling after AI processing
  window.aiProcessingInProgress = false;
}

async function handleAddComment(selectedText, commentContent) {  
  const finalComment = commentContent;
  createTextComment(selectedText, finalComment);
  addMessageToUI('system', `📝 Comment added: "${finalComment}"`);
}

/**
 * Unified function to create AI suggestion with inline diff for any mode
 */
async function createAISuggestionFromParsed(selectedText, userRequest, parsedSuggestion, mode) {
  try {
    const { incrementCommentCounter } = await import('./state.js');
    const currentUser = getCurrentUser();
    const commentId = `${mode}-ai-suggestion-${incrementCommentCounter()}`;
    
    // Create comment data for AI suggestion
    const commentData = {
      id: commentId,
      selectedText: selectedText,
      commentMessage: `🤖 AI ${mode.charAt(0).toUpperCase() + mode.slice(1)} Suggestion\n📝 Request: "${userRequest}"\n🎯 Change: ${parsedSuggestion.explanation}`,
      mode: mode,
      author: 'ai-assistant',
      authorName: `AI Assistant → ${currentUser?.name || 'User'}`,
      authorEmoji: '🤖',
      authorColor: '#007bff',
      createdAt: new Date().toISOString(),
      isResolved: false,
      isActive: true,
      isAISuggestion: true,
      [`is${mode.charAt(0).toUpperCase() + mode.slice(1)}Suggestion`]: true,
      originalRequest: userRequest,
      aiSuggestion: parsedSuggestion,
      ui: { position: null, element: null, isVisible: true, isDragging: false }
    };
    
    // Store in comments state
    state.comments[commentId] = commentData;
    
    // Create inline diff using the unified function
    await createInlineDiffFromParsed(parsedSuggestion, commentId, mode);
    
    // Create floating annotation for the suggestion (only for source mode in original code)
    if (mode === 'source') {
      const { createAISuggestionAnnotation } = await import('./annotations.js');
      createAISuggestionAnnotation(commentData);
    }
    
    // Trigger auto-save
    if (window.documentManager) {
      window.documentManager.onContentChange();
    }

  } catch (error) {
    console.error(`Error creating ${mode} AI suggestion from parsed data:`, error);
    addMessageToUI('system', `❌ Failed to create ${mode} suggestion: ${error.message}`);
  }
}

/**
 * Unified function to create inline diff for any mode
 */
async function createInlineDiffFromParsed(parsedSuggestion, commentId, mode) {
  try {
    // Get the target element based on mode using clean getElements
    let targetElement;
    switch (mode) {
      case 'template':
        targetElement = getElements.templateEditor;
        break;
      case 'preview':
      default:
        targetElement = getElements.previewContent;
        break;
    }
    
    if (!targetElement) {
      console.warn(`${mode} element not found`);
      return;
    }
    

    
    // Use the generic createInlineDiff function from the library
    const { createInlineDiff } = await import('./inline_diff.js');
    
    const success = createInlineDiff({
      parsedSuggestion,
      commentId,
      targetElement: targetElement,
      escapeHtml: escapeHtml,
      documentId: window.documentManager?.activeDocumentId || null
    });
    
    if (!success) {
      console.warn(`Failed to create inline diff in ${mode} content`);
      addMessageToUI('system', `❌ Failed to create ${mode} diff`);
    }
    
  } catch (error) {
    console.error(`Error creating ${mode} inline diff from parsed suggestion:`, error);
    addMessageToUI('system', `❌ Failed to create ${mode} diff: ${error.message}`);
  }
}








// Functions to reset initialization flags (for DocumentManager)
export function resetTextSelectionInitialization() {
  commentsData.textSelectionInitialized = false;
  commentsData.previewMouseUpHandler = null;
  commentsData.templateEditorMouseUpHandler = null;
  commentsData.templateEditorKeyUpHandler = null;
  commentsData.templateEditorInputHandler = null;
  commentsData.templateEditorScrollHandler = null;
  window[COMMENTS_KEY] = commentsData;
}

export function resetCommentButtonsInitialization() {
  // Clean up existing event listeners before resetting
  if (commentsData.addCommentHandler && commentsData.currentAddCommentBtn) {
    console.log(`[${windowId}] 🧹 Cleaning up add comment event listener during reset`);
    commentsData.currentAddCommentBtn.removeEventListener('click', commentsData.addCommentHandler);
  }
  if (commentsData.cancelCommentHandler && commentsData.currentCancelCommentBtn) {
    console.log(`[${windowId}] 🧹 Cleaning up cancel comment event listener during reset`);
    commentsData.currentCancelCommentBtn.removeEventListener('click', commentsData.cancelCommentHandler);
  }
  if (commentsData.askLLMHandler && commentsData.currentAskLLMBtn) {
    console.log(`[${windowId}] 🧹 Cleaning up ask AI event listener during reset`);
    commentsData.currentAskLLMBtn.removeEventListener('click', commentsData.askLLMHandler);
  }
  
  commentsData.commentButtonsInitialized = false;
  commentsData.addCommentHandler = null;
  commentsData.cancelCommentHandler = null;
  commentsData.askLLMHandler = null;
  commentsData.currentAddCommentBtn = null;
  commentsData.currentCancelCommentBtn = null;
  commentsData.currentAskLLMBtn = null;
  window[COMMENTS_KEY] = commentsData;
}

// Make functions globally accessible for onclick handlers
window.closeTextCommentPopup = closeTextCommentPopup;

/**
 * Simplified highlighting function that uses text matching for restoration
 * 
 * @param {Object} options - Configuration object
 * @param {string} options.selectedText - The text to highlight
 * @param {string} options.commentId - The comment ID to associate with the highlight
 * @param {Range} [options.selectionRange] - Live DOM Range (for new comments only)
 * @param {string} [options.mode] - Mode override ('template' or 'preview')
 * @param {Element} [options.targetElement] - Target element override
 * @returns {boolean} - Success status
 */
export function createTextHighlight(options) {
  const { selectedText, commentId, mode, targetElement } = options;
  
  if (!selectedText || !commentId) {
    console.error('createTextHighlight: selectedText and commentId are required');
    return false;
  }

  // Determine mode and target element using clean getElements
  let actualMode = mode || state.currentMode;
  let target = targetElement;
  
  if (!target) {
    if (actualMode === 'template') {
      target = getElements.templateEditor;
    } else if (actualMode === 'preview') {
      target = getElements.previewContent;
    }
  }
  
  if (!target) {
    console.error('createTextHighlight: Could not determine target element');
    return false;
  }
  
  return highlightInHtmlElement(target, selectedText, commentId);
}

