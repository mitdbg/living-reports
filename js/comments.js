// Comments and Text Selection Module
import { state, elements, windowId, incrementCommentCounter } from './state.js';
import { escapeHtml, escapeRegExp, calculateSafePosition, getTextContentWithLineBreaks } from './utils.js';
import { createFloatingAnnotation, showAnnotationForText, refreshAnnotationElements, clearActiveAnnotationHighlight } from './annotations.js';
import { addMessageToUI, addWaitingIndicator, removeWaitingIndicator } from './chat.js';
import { getCurrentUser } from './auth.js';

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
    sourceEditorMouseUpHandler: null,
    sourceEditorKeyUpHandler: null,
    sourceEditorInputHandler: null,
    sourceEditorScrollHandler: null,
    addCommentHandler: null,
    cancelCommentHandler: null,
    askLLMHandler: null,
    currentAddCommentBtn: null, // Track which button currently has the listener
    currentCancelCommentBtn: null, // Track which button currently has the listener
    currentAskLLMBtn: null // Track which button currently has the listener
  };
}

const commentsData = window[COMMENTS_KEY];

// Text comment management functions
export function createTextComment(selectedText, commentContent) {
  const commentId = `text-comment-${incrementCommentCounter()}`;
  
  // Get current user information
  const currentUser = getCurrentUser();
  
  // Get the stored selection range from the floating comment element (for live highlighting)
  let selectionRange = null;
  
  if (elements.floatingComment && elements.floatingComment.storedSelectionRange) {
    selectionRange = elements.floatingComment.storedSelectionRange;
    console.log('Using stored selection range for highlighting');
  } else {
    console.warn('No stored selection range found, using text matching');
  }
  
  // Create simplified comment data object
  const commentData = {
    // Core comment data
    id: commentId,
    selectedText: selectedText,
    commentMessage: commentContent,
    mode: state.currentMode,
    author: currentUser ? currentUser.id : 'anonymous',
    authorName: currentUser ? currentUser.name : 'Anonymous',
    authorEmoji: currentUser ? currentUser.emoji : '👤',
    authorColor: currentUser ? currentUser.color : '#666666',
    createdAt: new Date().toISOString(),
    
    // State flags
    isResolved: false,
    isActive: true,
    
    // UI state (annotation window)
    ui: {
      position: null, // Will be set when annotation is created
      element: null,  // Will be set when annotation is created
      isVisible: false,
      isDragging: false
    }
  };
  
  // Store in unified comments structure
  state.comments[commentId] = commentData;
  
  // Apply highlighting to the selected text
  highlightSelectedText(selectedText, commentId, selectionRange);
  
  // Create floating annotation window for the comment
  createFloatingAnnotation(selectedText, commentContent, commentData);
  
  // Clear the stored range since we've used it
  if (elements.floatingComment) {
    elements.floatingComment.storedSelectionRange = null;
  }
  
  // Show feedback message
  addMessageToUI('system', `Comment added: "${commentContent}" for text "${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}"`);
  
  // Trigger auto-save for comment changes
  if (window.documentManager) {
    window.documentManager.onCommentChange();
  }
}

function highlightSelectedText(selectedText, commentId, selectionRange) {
  console.log('Highlighting text - Current mode from state:', state.currentMode);
  
  // Use the simplified highlighting function
  return createTextHighlight({
    selectedText: selectedText,
    commentId: commentId,
    selectionRange: selectionRange
  });
}

// Fallback method using text replacement (for cases where range highlighting fails)
function highlightInPreviewFallback(selectedText, commentId, selectionRange) {
  const previewElement = elements.previewContent;
  let content = previewElement.innerHTML;

  // For HTML selectedText (preview mode), do direct replacement
  if (/<[^>]*>/.test(selectedText)) {
    console.log('Preview mode: Using direct HTML replacement for:', selectedText.substring(0, 100));
    
    if (content.includes(selectedText)) {
      const replacement = `<span data-comment-id="${commentId}" title="Click to view comment" class="text-comment-highlight">${selectedText}</span>`;
      content = content.replace(selectedText, replacement);
      console.log('Direct HTML replacement successful');
    } else {
      console.warn('HTML selectedText not found in content');
      return;
    }
  } else {
    // For plain text selectedText, use simple escaping
    console.log('Preview mode: Using escaped text replacement');
    const escapedText = escapeHtml(selectedText);
    
    if (content.includes(escapedText)) {
      const replacement = `<span data-comment-id="${commentId}" title="Click to view comment" class="text-comment-highlight">${escapedText}</span>`;
      content = content.replace(escapedText, replacement);
      console.log('Escaped text replacement successful');
    } else {
      console.warn('Escaped text not found in content');
      return;
    }
  }
  
  previewElement.innerHTML = content;
  
  // Add event listener to the newly created highlight
  const newHighlight = previewElement.querySelector(`.text-comment-highlight[data-comment-id="${commentId}"]`);
  if (newHighlight && !newHighlight.hasAttribute('data-listener-attached')) {
    newHighlight.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAnnotationForText(selectedText);
    });
    newHighlight.setAttribute('data-listener-attached', 'true');
  }
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
  reattachSourceEditorHighlightEventListeners();
  
  // Only refresh annotation elements if not skipping (to prevent flicker when showing annotations)
  if (!skipAnnotationRefresh) {
    refreshAnnotationElements();
  }
}

// Function to re-attach event listeners to code editor highlighted text elements
function reattachtemplateEditorHighlightEventListeners() {
  const templateEditor = elements.templateEditor;
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

// Function to re-attach event listeners to source editor highlighted text elements
function reattachSourceEditorHighlightEventListeners() {
  const sourceEditor = elements.sourceEditor;
  if (!sourceEditor) return;
  
  // Find all highlighted text elements in source editor
  const highlightElements = sourceEditor.querySelectorAll('.text-comment-highlight');
  
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
  const popup = document.querySelector('.text-comment-popup');
  if (popup) {
    popup.remove();
  }
}

export function getTextCommentsMap() {
  // Return the current text comments map for external use
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

export function clearAllComments() {
  console.log('Clearing all comments (unified function)');
  
  // Remove all highlights from preview and code editor - use brute force approach
  const highlights = document.querySelectorAll('.text-comment-highlight');
  console.log(`Found ${highlights.length} highlights to remove`);
  
  highlights.forEach((highlight, index) => {
    console.log(`Removing highlight ${index + 1}:`, highlight.textContent.substring(0, 30));
    const commentId = highlight.getAttribute('data-comment-id');
    console.log(`Highlight has comment-id: ${commentId}`);
    highlight.replaceWith(document.createTextNode(highlight.textContent));
  });
  
  // Double-check: remove any elements with the highlight class that might remain
  const remainingHighlights = document.querySelectorAll('.text-comment-highlight');
  if (remainingHighlights.length > 0) {
    console.log(`Found ${remainingHighlights.length} remaining highlights after first pass, removing them`);
    remainingHighlights.forEach(highlight => {
      highlight.replaceWith(document.createTextNode(highlight.textContent));
    });
  }
  
  // Clear floating annotations for all comments
  const commentsToRemove = Object.values(state.comments);
  console.log(`Removing ${commentsToRemove.length} floating annotations`);
  
  commentsToRemove.forEach((comment, index) => {
    if (comment.ui && comment.ui.element) {
      console.log(`Removing floating annotation ${index + 1} for comment: ${comment.id}`);
      comment.ui.element.remove();
    }
  });
  
  // Clear the comments object
  state.comments = {};
  state.commentIdCounter = 0;
  
  // Trigger auto-save for comment changes
  if (window.documentManager && commentsToRemove.length > 0) {
    window.documentManager.onCommentChange();
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
  
  // Remove highlights and annotations for these comments
  commentsToRemove.forEach(([id, comment]) => {
    console.log(`Removing highlights for comment ID: ${id}`);
    
    // Try to find highlights with this specific comment ID
    const highlights = document.querySelectorAll(`.text-comment-highlight[data-comment-id="${id}"]`);
    console.log(`Found ${highlights.length} highlights with ID ${id}`);
    
    highlights.forEach((highlight, index) => {
      console.log(`Removing highlight ${index + 1}:`, highlight.textContent.substring(0, 30));
      highlight.replaceWith(document.createTextNode(highlight.textContent));
    });
    
    // If no highlights found by ID, try to find by text content as fallback
    if (highlights.length === 0) {
      console.log(`No highlights found by ID, trying text content fallback for: ${comment.selectedText.substring(0, 30)}`);
      const allHighlights = document.querySelectorAll('.text-comment-highlight');
      let found = false;
      
      allHighlights.forEach(highlight => {
        if (highlight.textContent === comment.selectedText) {
          console.log(`Found highlight by text content, removing:`, highlight.textContent.substring(0, 30));
          highlight.replaceWith(document.createTextNode(highlight.textContent));
          found = true;
        }
      });
      
      if (!found) {
        console.warn(`Could not find any highlights for comment: ${comment.selectedText.substring(0, 30)}`);
      }
    }
    
    // Remove floating annotation if it exists
    if (comment.ui && comment.ui.element) {
      console.log(`Removing floating annotation for comment: ${id}`);
      comment.ui.element.remove();
    }
  });
  
  // Remove from state object
  commentsToRemove.forEach(([id, comment]) => {
    delete state.comments[id];
  });
  
  // Trigger auto-save for comment changes
  if (window.documentManager && commentsToRemove.length > 0) {
    window.documentManager.onCommentChange();
  }
  
  console.log(`Removed ${commentsToRemove.length} comments from current mode`);
  return commentsToRemove.length;
}

// Keep old function name for backward compatibility
export function clearCurrentModeTextComments() {
  return clearCurrentModeComments();
}

// Extract positioning logic into a reusable function
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

// Text selection handlers
export function initTextSelection() {  
  if (!elements.previewContent || !elements.templateEditor || !elements.sourceEditor || !elements.floatingComment) {
    console.error(`[${windowId}] Text selection elements not found!`, {
      previewContent: !!elements.previewContent,
      templateEditor: !!elements.templateEditor,
      sourceEditor: !!elements.sourceEditor,
      floatingComment: !!elements.floatingComment
    });
    return;
  }
  
  // Remove existing event listeners if they exist
  if (commentsData.textSelectionInitialized) {
    if (commentsData.previewMouseUpHandler) {
      elements.previewContent.removeEventListener('mouseup', commentsData.previewMouseUpHandler);
    }
    if (commentsData.templateEditorMouseUpHandler) {
      elements.templateEditor.removeEventListener('mouseup', commentsData.templateEditorMouseUpHandler);
    }
    if (commentsData.sourceEditorMouseUpHandler) {
      elements.sourceEditor.removeEventListener('mouseup', commentsData.sourceEditorMouseUpHandler);
    }
    if (commentsData.templateEditorKeyUpHandler) {
      elements.templateEditor.removeEventListener('keyup', commentsData.templateEditorKeyUpHandler);
    }
    if (commentsData.sourceEditorKeyUpHandler) {
      elements.sourceEditor.removeEventListener('keyup', commentsData.sourceEditorKeyUpHandler);
    }
    if (commentsData.templateEditorInputHandler) {
      elements.templateEditor.removeEventListener('input', commentsData.templateEditorInputHandler);
    }
    if (commentsData.sourceEditorInputHandler) {
      elements.sourceEditor.removeEventListener('input', commentsData.sourceEditorInputHandler);
    }
    if (commentsData.templateEditorScrollHandler) {
      elements.templateEditor.removeEventListener('scroll', commentsData.templateEditorScrollHandler);
    }
    if (commentsData.sourceEditorScrollHandler) {
      elements.sourceEditor.removeEventListener('scroll', commentsData.sourceEditorScrollHandler);
    }
  }
  
  // Create new event handlers
  commentsData.previewMouseUpHandler = handleTextSelection;
  commentsData.templateEditorMouseUpHandler = handleTextSelection;
  commentsData.sourceEditorMouseUpHandler = handleTextSelection;
  commentsData.templateEditorKeyUpHandler = handleTextSelection;
  commentsData.sourceEditorKeyUpHandler = handleTextSelection;
  commentsData.templateEditorInputHandler = updateCodeHighlights;
  commentsData.sourceEditorInputHandler = updateSourceHighlights;
  commentsData.templateEditorScrollHandler = updateCodeHighlights;
  commentsData.sourceEditorScrollHandler = updateSourceHighlights;
  
  // For preview content (regular HTML)
  elements.previewContent.addEventListener('mouseup', commentsData.previewMouseUpHandler);
  
  // For template editor (contenteditable div) - uses same selection handling as preview
  elements.templateEditor.addEventListener('mouseup', commentsData.templateEditorMouseUpHandler);
  elements.templateEditor.addEventListener('keyup', commentsData.templateEditorKeyUpHandler);
  
  // For source editor (contenteditable div) - uses same selection handling as preview
  elements.sourceEditor.addEventListener('mouseup', commentsData.sourceEditorMouseUpHandler);
  elements.sourceEditor.addEventListener('keyup', commentsData.sourceEditorKeyUpHandler);
  
  // Update code highlights when editor content changes or scrolls
  elements.templateEditor.addEventListener('input', commentsData.templateEditorInputHandler);
  elements.templateEditor.addEventListener('scroll', commentsData.templateEditorScrollHandler);
  
  // Update source highlights when source editor content changes or scrolls
  elements.sourceEditor.addEventListener('input', commentsData.sourceEditorInputHandler);
  elements.sourceEditor.addEventListener('scroll', commentsData.sourceEditorScrollHandler);
  
  // Global click handler to hide floating comment when clicking elsewhere
  document.addEventListener('click', function(e) {
    // Only hide comment window if clicking completely outside the comment system
    if (!e.target.closest('.floating-comment') && 
        !e.target.closest('.text-comment-highlight') &&
        !window.getSelection().toString().trim()) {
      elements.floatingComment.style.display = 'none';
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
      elements.floatingComment.style.display = 'none';
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
  
  if (selection.rangeCount === 0) {
    elements.floatingComment.style.display = 'none';
    elements.floatingComment.storedSelectionRange = null;
    return;
  }
  
  const range = selection.getRangeAt(0);
  let selectedText = '';
  
  // Check if the selection is within contenteditable elements (template or source editor)
  const templateEditor = elements.templateEditor;
  const sourceEditor = elements.sourceEditor;
  const previewContent = elements.previewContent;
  
  if ((templateEditor && templateEditor.contains(range.commonAncestorContainer)) ||
      (sourceEditor && sourceEditor.contains(range.commonAncestorContainer))) {
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
          elements.floatingComment.style.display = 'none';
          elements.floatingComment.storedSelectionRange = null;
          return;
        }
        element = element.parentElement;
      }
    }
    
    // Validate and clean the selected text before processing
    const cleanedText = validateAndCleanSelectedText(selectedText);
    
    if (!cleanedText) {
      console.warn('Invalid text selection, ignoring');
      elements.floatingComment.style.display = 'none';
      elements.floatingComment.storedSelectionRange = null;
      return;
    }
    
    const rect = range.getBoundingClientRect();
    
    if (rect.width > 0 && rect.height > 0) {
      // Store the selection range immediately for later use
      const storedRange = range.cloneRange();
      
      console.log('Processing text selection:', cleanedText.substring(0, 50) + (cleanedText.length > 50 ? '...' : ''));
      console.log('Original selected text length:', selectedText.length, 'Cleaned length:', cleanedText.length);
      
      // Use the extracted positioning function
      const { left, top } = calculateCommentPosition(rect, 'right');
      
      elements.floatingComment.style.display = 'block';
      elements.floatingComment.style.top = `${top}px`;
      elements.floatingComment.style.left = `${left}px`;
      elements.floatingComment.dataset.selectedText = cleanedText; // Use cleaned text
      // Store the range in the floating comment element for later retrieval
      elements.floatingComment.storedSelectionRange = storedRange;
      elements.commentText.value = '';
    } else {
      elements.floatingComment.style.display = 'none';
      elements.floatingComment.storedSelectionRange = null;
    }
  } else {
    elements.floatingComment.style.display = 'none';
    elements.floatingComment.storedSelectionRange = null;
  }
}

/**
 * Validate and clean selected text to prevent corruption while preserving line breaks
 */
function validateAndCleanSelectedText(selectedText) {
  if (!selectedText || typeof selectedText !== 'string') {
    return null;
  }

  // Check if this is HTML content (contains tags)
  const isHTML = /<[^>]*>/.test(selectedText);
  
  if (isHTML) {
    // For HTML content (preview mode), don't strip tags - just basic validation
    let cleaned = selectedText.trim();
    
    // Check for minimum and maximum length
    if (cleaned.length < 1 || cleaned.length > 2000) {
      return null;
    }
    
    return cleaned;
  } else {
    // For plain text content (template/source mode), do normal cleaning
    let cleaned = selectedText;

    // Only trim leading and trailing whitespace from the entire selection
    cleaned = cleaned.replace(/^\s+/, '').replace(/\s+$/, '');

    // Preserve line breaks and normalize only excessive whitespace within lines
    cleaned = cleaned
      .split(/\r?\n/)
      .map(line => line.replace(/[ \t]{2,}/g, ' '))
      .join('\n');

    // Remove any remaining carriage returns
    cleaned = cleaned.replace(/\r/g, '');

    // Check for minimum and maximum length
    if (cleaned.length < 1) {
      return null;
    }
    
    // Remove any HTML tags if they somehow got included
    cleaned = cleaned.replace(/<[^>]*>/g, '');

    // Remove excessive punctuation repetition
    cleaned = cleaned.replace(/([.!?]){3,}/g, '$1$1$1');

    // Final validation
    if (cleaned.length < 1 || cleaned.length > 1000) {
      return null;
    }

    return cleaned;
  }
}

// Update code editor highlights when content changes
export function updateCodeHighlights() {
  // For contenteditable div, we can use the same approach as preview mode
  // Re-attach event listeners to highlighted text elements
  reattachtemplateEditorHighlightEventListeners();
}

// Update source editor highlights when content changes
export function updateSourceHighlights() {
  // For contenteditable div, we can use the same approach as preview mode
  // Re-attach event listeners to highlighted text elements
  reattachSourceEditorHighlightEventListeners();
}

// Comment button event handlers
export function initCommentButtons() {
  // Check if elements exist
  if (!elements.addCommentBtn) {
    console.error(`[${windowId}] Add comment button not found!`);
    return;
  }
  if (!elements.cancelCommentBtn) {
    console.error(`[${windowId}] Cancel comment button not found!`);
    return;
  }
  if (!elements.floatingComment) {
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
  
  // Ask AI button handler
  const askLLMBtn = elements.floatingComment.querySelector('.ask-llm');
  if (askLLMBtn) {
    // Remove existing listener from previous button if it exists
    if (commentsData.askLLMHandler && commentsData.currentAskLLMBtn) {
      console.log(`[${windowId}] 🧹 Removing event listener from previous ask AI button`);
      commentsData.currentAskLLMBtn.removeEventListener('click', commentsData.askLLMHandler);
    }
    
    // Create new event handler
    commentsData.askLLMHandler = async () => {
      console.log(`[${windowId}] 🤖 Ask AI clicked`);
      const selectedText = elements.floatingComment.dataset.selectedText;
      const commentContent = elements.commentText.value.trim();
      
      if (selectedText) {
        let message;
        if (commentContent) {
          message = `Context: "${selectedText}"\n\nRequest: ${commentContent}\n\n`;
        } else {
          message = `Context: "${selectedText}"\n\nPlease provide suggestions for this code.`;
        }
        
        let waitingIndicatorAdded = false;
        
        try {
          // Add the message to chat UI first
          addMessageToUI('user', message);

          // Add a waiting indicator
          addWaitingIndicator();
          waitingIndicatorAdded = true;

          // Send to backend with suggest_template=true for template suggestions based on selected text
          const { sendToBackend } = await import('./template-execution.js');
          await sendToBackend(message, true);

          // Hide the floating comment window after sending
          elements.floatingComment.style.display = 'none';
          
        } catch (error) {
          console.error('Error sending to AI:', error);
          addMessageToUI('system', 'Error: Failed to send message to AI. Please try again.');
        } finally {
          // Always remove waiting indicator if it was added
          if (waitingIndicatorAdded) {
            try {
              removeWaitingIndicator();
            } catch (indicatorError) {
              console.warn('Error removing waiting indicator:', indicatorError);
            }
          }
        }
      } else {
        addMessageToUI('system', 'Please select some text first.');
      }
    };
    
    askLLMBtn.addEventListener('click', commentsData.askLLMHandler);
    commentsData.currentAskLLMBtn = askLLMBtn;
  }
  
  // Create new event handlers
  commentsData.addCommentHandler = async () => {
    console.log(`[${windowId}] Add comment clicked`);
    try {
      const selectedText = elements.floatingComment.dataset.selectedText;
      const commentContent = elements.commentText.value.trim();
      
      if (commentContent && selectedText) {
        createTextComment(selectedText, commentContent);
      }
    } catch (error) {
      console.error('Error creating comment:', error);
    }
    
    // Always hide the floating comment window, regardless of success/failure
    elements.floatingComment.style.display = 'none';
  };

  commentsData.cancelCommentHandler = () => {
    console.log(`[${windowId}] Cancel comment clicked`);
    elements.floatingComment.style.display = 'none';
  };
  
  elements.addCommentBtn.addEventListener('click', commentsData.addCommentHandler);
  elements.cancelCommentBtn.addEventListener('click', commentsData.cancelCommentHandler);
  
  // Track which buttons currently have the listeners
  commentsData.currentAddCommentBtn = elements.addCommentBtn;
  commentsData.currentCancelCommentBtn = elements.cancelCommentBtn;
  
  console.log(`[${windowId}] Comment buttons initialized`);
  
  // Mark as initialized
  commentsData.commentButtonsInitialized = true;
  window[COMMENTS_KEY] = commentsData;
}

// Functions to reset initialization flags (for DocumentManager)
export function resetTextSelectionInitialization() {
  commentsData.textSelectionInitialized = false;
  commentsData.previewMouseUpHandler = null;
  commentsData.templateEditorMouseUpHandler = null;
  commentsData.sourceEditorMouseUpHandler = null;
  commentsData.templateEditorKeyUpHandler = null;
  commentsData.sourceEditorKeyUpHandler = null;
  commentsData.templateEditorInputHandler = null;
  commentsData.sourceEditorInputHandler = null;
  commentsData.templateEditorScrollHandler = null;
  commentsData.sourceEditorScrollHandler = null;
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
  const { selectedText, commentId, selectionRange, mode, targetElement } = options;
  
  if (!selectedText || !commentId) {
    console.error('createTextHighlight: selectedText and commentId are required');
    return false;
  }

  // Determine mode and target element
  let actualMode = mode || state.currentMode;
  let target = targetElement;
  
  // Auto-detect mode from selectionRange if available (for new comments)
  if (selectionRange && !mode && !targetElement) {
    const templateEditor = elements.templateEditor;
    const sourceEditor = elements.sourceEditor;
    const previewContent = elements.previewContent;
    
    if (templateEditor && templateEditor.contains(selectionRange.commonAncestorContainer)) {
      actualMode = 'template';
      target = templateEditor;
    } else if (sourceEditor && sourceEditor.contains(selectionRange.commonAncestorContainer)) {
      actualMode = 'source';
      target = sourceEditor;
    } else if (previewContent && previewContent.contains(selectionRange.commonAncestorContainer)) {
      actualMode = 'preview';
      target = previewContent;
    }
  }
  
  // Set target element based on mode if not provided
  if (!target) {
    if (actualMode === 'template') {
      target = elements.templateEditor;
    } else if (actualMode === 'source') {
      target = elements.sourceEditor;
    } else if (actualMode === 'preview') {
      target = elements.previewContent;
    }
  }
  
  if (!target) {
    console.error('createTextHighlight: Could not determine target element');
    return false;
  }

  // Try live range first for new comments
  if (selectionRange && target.contains(selectionRange.commonAncestorContainer)) {
    try {
      // Create highlight span
      const highlightSpan = document.createElement('span');
      highlightSpan.className = 'text-comment-highlight';
      highlightSpan.setAttribute('data-comment-id', commentId);
      highlightSpan.setAttribute('title', 'Click to view comment');
      highlightSpan.setAttribute('data-listener-attached', 'true');
      
      // Add click event listener immediately
      highlightSpan.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAnnotationForText(selectedText);
      });
      
      // Surround the selected range with the highlight span
      selectionRange.surroundContents(highlightSpan);
      
      console.log('Successfully highlighted text using live range:', selectedText);
      return true;
      
    } catch (error) {
      console.error('Error highlighting text using live range, falling back to text matching:', error);
    }
  }
  
  // Use text matching for all other cases (including restoration)
  return createHighlightFromTextSearch(target, selectedText, commentId);
}

/**
 * Create highlight using text search and replacement
 */
function createHighlightFromTextSearch(targetElement, selectedText, commentId) {
  const istemplateEditor = targetElement.classList.contains('template-editor');
  const isSourceEditor = targetElement.classList.contains('source-editor');
  
  if (istemplateEditor) {
    highlightInEditorFallback(elements.templateEditor, selectedText, commentId, null);
    return true;
  } else if (isSourceEditor) {
    highlightInEditorFallback(elements.sourceEditor, selectedText, commentId, null);
    return true;
  } else {
    highlightInPreviewFallback(selectedText, commentId, null);
    return true;
  }
}

// Text replacement method for highlighting in source editor
function highlightInEditorFallback(editor, selectedText, commentId, selectionRange) {
  let content = editor.innerHTML;
  
  // Create a span with yellow background for the selected text
  const replacement = `<span class="text-comment-highlight" data-comment-id="${commentId}" title="Click to view comment">${selectedText}</span>`;
  
  // For multi-line text, we need to handle HTML representation of line breaks
  // Convert the selected text to match how it might appear in HTML
  const normalizedSelectedText = selectedText.replace(/\n/g, '<br>');
  const escapedNormalizedText = escapeHtml(selectedText).replace(/\n/g, '<br>');
  
  // Try multiple approaches to find and replace the text
  const escapedText = escapeHtml(selectedText);
  
  // First try: exact match with escaped HTML and normalized line breaks
  if (content.includes(escapedNormalizedText)) {
    content = content.replace(escapedNormalizedText, replacement);
    console.log('Highlighted text in source editor using normalized HTML match:', selectedText.substring(0, 30));
  } else if (content.includes(escapedText)) {
    // Second try: exact match with escaped HTML
    content = content.replace(escapedText, replacement);
    console.log('Highlighted text in source editor using exact match fallback:', selectedText.substring(0, 30));
  } else {
    // Third try: use regex with multiline flag for multi-line selections
    const regexPattern = escapeRegExp(escapedText).replace(/\n/g, '\\s*(?:<br>|</div><div>|</p><p>)\\s*');
    const regex = new RegExp(regexPattern, 'im');
    if (regex.test(content)) {
      const match = content.match(regex);
      console.log('- match result:', match ? match[0].substring(0, 100) + '...' : 'null');
      
      if (match) {
        // Simple approach: wrap entire match in a highlight span
        const replacement = `<span class="text-comment-highlight" data-comment-id="${commentId}" title="Click to view comment">${match[0]}</span>`;
        content = content.replace(regex, replacement);
        console.log('Simple multi-line replacement successful');
      } else {
        console.warn('Multi-line pattern not found');
        return;
      }
    } else {
      // Fourth try: Simple string replacement
      const lines = selectedText.split('\n');
      if (lines.length > 1) {
        // Multi-line: match from first to last line
        const firstLine = escapeHtml(lines[0]);
        const lastLine = escapeHtml(lines[lines.length - 1]);
        
        console.log('Multi-line debug:');
        console.log('- selectedText lines:', lines);
        console.log('- firstLine escaped:', firstLine);
        console.log('- lastLine escaped:', lastLine);
        
        // Escape regex special characters in the lines
        const firstLineRegex = escapeRegExp(firstLine);
        const lastLineRegex = escapeRegExp(lastLine);
        
        const pattern = firstLineRegex + '[\\s\\S]*?' + lastLineRegex;
        console.log('- pattern:', pattern);
        
        const regex = new RegExp(pattern, 'i');
        
        const match = content.match(regex);
        console.log('- match result:', match ? match[0].substring(0, 100) + '...' : 'null');
        
        if (match) {
          content = content.replace(regex, `<span class="text-comment-highlight" data-comment-id="${commentId}" title="Click to view comment">${match[0]}</span>`);
          console.log('Multi-line replacement successful');
        } else {
          console.warn('Multi-line pattern not found');
          return;
        }
      } else {
        // Single line
        const escaped = escapeHtml(selectedText.trim());
        if (content.includes(escaped)) {
          content = content.replace(escaped, `<span class="text-comment-highlight" data-comment-id="${commentId}" title="Click to view comment">${escaped}</span>`);
          console.log('Single line replacement successful');
        } else {
          console.warn('Single line text not found');
          return;
        }
      }
    }
  }
  
  editor.innerHTML = content;
  
  // Add event listener to the newly created highlight immediately
  const newHighlight = editor.querySelector(`.text-comment-highlight[data-comment-id="${commentId}"]`);
  if (newHighlight && !newHighlight.hasAttribute('data-listener-attached')) {
    newHighlight.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAnnotationForText(selectedText);
    });
    newHighlight.setAttribute('data-listener-attached', 'true');
  }
}