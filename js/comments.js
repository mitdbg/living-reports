// Comments and Text Selection Module
import { state, elements, windowId, incrementCommentCounter } from './state.js';
import { escapeHtml, escapeRegExp, calculateSafePosition } from './utils.js';
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
    editorMouseUpHandler: null,
    editorKeyUpHandler: null,
    editorInputHandler: null,
    editorScrollHandler: null,
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
  
  // Get the stored selection range from the floating comment element
  let selectionRange = null;
  let detailedRangeInfo = null;
  
  if (elements.floatingComment && elements.floatingComment.storedSelectionRange) {
    selectionRange = elements.floatingComment.storedSelectionRange;
    console.log('Using stored selection range for highlighting');
    
    // Create detailed range information for reliable restoration
    detailedRangeInfo = createDetailedRangeInfo(selectionRange);
    console.log('Created detailed range info:', detailedRangeInfo);
  } else {
    console.warn('No stored selection range found, highlighting may be inaccurate');
  }
  
  // Create unified comment data object
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
    selectionRange: selectionRange,
    
    // Enhanced range information for precise restoration
    detailedRangeInfo: detailedRangeInfo,
    
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
  
  // Apply highlighting to the selected text using the stored range
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

/**
 * Create detailed range information for reliable comment restoration
 */
function createDetailedRangeInfo(range) {
  if (!range) return null;
  
  try {
    // Get the target container (code editor or preview content)
    const codeEditor = elements.codeEditor;
    const previewContent = elements.previewContent;
    
    let containerType = null;
    let containerElement = null;
    
    if (codeEditor && codeEditor.contains(range.commonAncestorContainer)) {
      containerType = 'code';
      containerElement = codeEditor;
    } else if (previewContent && previewContent.contains(range.commonAncestorContainer)) {
      containerType = 'preview';
      containerElement = previewContent;
    }
    
    if (!containerElement) {
      console.warn('Could not determine container for range');
      return null;
    }
    
    // Create path to start and end containers
    const startPath = getNodePath(range.startContainer, containerElement);
    const endPath = getNodePath(range.endContainer, containerElement);
    
    // Get text content around the selection for validation
    const beforeText = getTextBeforeRange(range, 50);
    const afterText = getTextAfterRange(range, 50);
    
    return {
      containerType: containerType,
      startPath: startPath,
      endPath: endPath,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      selectedText: range.toString(),
      beforeText: beforeText,
      afterText: afterText,
      // For additional validation
      containerHTML: containerElement.innerHTML.substring(0, 200) + '...'
    };
    
  } catch (error) {
    console.error('Error creating detailed range info:', error);
    return null;
  }
}

/**
 * Get path to a node within a container for reliable restoration
 */
function getNodePath(node, container) {
  const path = [];
  let currentNode = node;
  
  while (currentNode && currentNode !== container) {
    const parent = currentNode.parentNode;
    if (!parent) break;
    
    const index = Array.from(parent.childNodes).indexOf(currentNode);
    path.unshift({
      tagName: currentNode.nodeType === Node.TEXT_NODE ? '#text' : currentNode.tagName,
      index: index,
      nodeType: currentNode.nodeType
    });
    
    currentNode = parent;
  }
  
  return path;
}

/**
 * Get text content before the range for context validation
 */
function getTextBeforeRange(range, maxLength = 50) {
  try {
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(range.commonAncestorContainer);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    
    const beforeText = beforeRange.toString();
    return beforeText.length > maxLength ? 
      '...' + beforeText.substring(beforeText.length - maxLength) : 
      beforeText;
  } catch (error) {
    return '';
  }
}

/**
 * Get text content after the range for context validation
 */
function getTextAfterRange(range, maxLength = 50) {
  try {
    const afterRange = document.createRange();
    afterRange.selectNodeContents(range.commonAncestorContainer);
    afterRange.setStart(range.endContainer, range.endOffset);
    
    const afterText = afterRange.toString();
    return afterText.length > maxLength ? 
      afterText.substring(0, maxLength) + '...' : 
      afterText;
  } catch (error) {
    return '';
  }
}

function highlightSelectedText(selectedText, commentId, selectionRange) {
  console.log('Highlighting text - Current mode from state:', state.currentMode);
  
  // Use the unified highlighting function
  return createTextHighlight({
    selectedText: selectedText,
    commentId: commentId,
    selectionRange: selectionRange
  });
}

function highlightInPreview(selectedText, commentId, selectionRange) {
  const previewElement = elements.previewContent;
  if (!previewElement) {
    console.warn('Preview element not found for highlighting');
    return;
  }
  
  // Use the stored selection range if available
  if (!selectionRange) {
    console.warn('No selection range provided for highlighting');
    highlightInPreviewFallback(selectedText, commentId, selectionRange);
    return;
  }
  
  console.log('Attempting range-based highlighting in preview:', {
    selectedText,
    rangeStartContainer: selectionRange.startContainer.nodeName,
    rangeStartOffset: selectionRange.startOffset,
    rangeEndContainer: selectionRange.endContainer.nodeName,
    rangeEndOffset: selectionRange.endOffset,
    rangeText: selectionRange.toString()
  });
  
  // Check if the selection range is within the preview element
  if (!previewElement.contains(selectionRange.commonAncestorContainer)) {
    console.warn('Selection range is not within preview element, falling back');
    highlightInPreviewFallback(selectedText, commentId, selectionRange);
    return;
  }
  
  try {
    // Create a span element for highlighting
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
    
    console.log('Successfully highlighted text in preview using stored range selection:', selectedText);
    
    // No need to re-attach event listeners since we added it immediately
    
  } catch (error) {
    console.error('❌ Error highlighting text in preview using range:', error);
    console.log('Falling back to text replacement method');
    
    // Fallback to the old method if range highlighting fails
    highlightInPreviewFallback(selectedText, commentId, selectionRange);
  }
}

// Fallback method using text replacement (for cases where range highlighting fails)
function highlightInPreviewFallback(selectedText, commentId, selectionRange) {
  const previewElement = elements.previewContent;
  let content = previewElement.innerHTML;
  
  // Create a span with yellow background for the selected text
  const highlightSpan = `<span class="text-comment-highlight" data-comment-id="${commentId}" title="Click to view comment">${escapeHtml(selectedText)}</span>`;
  
  // Try multiple approaches to find and replace the text
  const escapedText = escapeHtml(selectedText);
  
  // First try: exact match with escaped HTML
  if (content.includes(escapedText)) {
    content = content.replace(escapedText, highlightSpan);
    console.log('Highlighted text using exact match fallback:', selectedText);
  } else {
    // Second try: use regex with case-insensitive flag but only replace first occurrence
    const regex = new RegExp(escapeRegExp(escapedText), 'i');
    if (regex.test(content)) {
      content = content.replace(regex, highlightSpan);
      console.log('Highlighted text using regex match fallback:', selectedText);
    } else {
      // Third try: look for the text without HTML escaping (in case it's plain text)
      const plainTextRegex = new RegExp(escapeRegExp(selectedText), 'i');
      if (plainTextRegex.test(content)) {
        content = content.replace(plainTextRegex, highlightSpan);
        console.log('Highlighted text using plain text match fallback:', selectedText);
      } else {
        console.warn('Could not find text to highlight in preview:', selectedText);
        return;
      }
    }
  }
  
  previewElement.innerHTML = content;
  
  // Add event listener to the newly created highlight immediately
  const newHighlight = previewElement.querySelector(`[data-comment-id="${commentId}"]`);
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
  reattachCodeEditorHighlightEventListeners();
  
  // Only refresh annotation elements if not skipping (to prevent flicker when showing annotations)
  if (!skipAnnotationRefresh) {
    refreshAnnotationElements();
  }
}

function highlightInCodeEditor(selectedText, commentId, selectionRange) {
  const editor = elements.codeEditor;
  if (!editor) return;
  
  // Use the stored selection range if available
  if (!selectionRange) {
    console.warn('No selection range provided for code editor highlighting');
    highlightInCodeEditorFallback(selectedText, commentId, selectionRange);
    return;
  }
  
  console.log('Attempting range-based highlighting in code editor:', {
    selectedText,
    rangeStartContainer: selectionRange.startContainer.nodeName,
    rangeStartOffset: selectionRange.startOffset,
    rangeEndContainer: selectionRange.endContainer.nodeName,
    rangeEndOffset: selectionRange.endOffset,
    rangeText: selectionRange.toString()
  });
  
  // Check if the selection range is within the code editor
  if (!editor.contains(selectionRange.commonAncestorContainer)) {
    console.warn('Selection range is not within code editor, falling back');
    highlightInCodeEditorFallback(selectedText, commentId, selectionRange);
    return;
  }
  
  try {
    // Create a span element for highlighting
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
    
    console.log('Successfully highlighted text in code editor using stored range selection:', selectedText);
    
    // No need to re-attach event listeners since we added it immediately
    
  } catch (error) {
    console.error('❌ Error highlighting text in code editor using range:', error);
    console.log('Falling back to text replacement method');
    
    // Fallback to the old method if range highlighting fails
    highlightInCodeEditorFallback(selectedText, commentId, selectionRange);
  }
}

// Fallback method using text replacement (for cases where range highlighting fails)
function highlightInCodeEditorFallback(selectedText, commentId, selectionRange) {
  const editor = elements.codeEditor;
  let content = editor.innerHTML;
  
  // Create a span with yellow background for the selected text
  const highlightSpan = `<span class="text-comment-highlight" data-comment-id="${commentId}" title="Click to view comment">${escapeHtml(selectedText)}</span>`;
  
  // Try multiple approaches to find and replace the text
  const escapedText = escapeHtml(selectedText);
  
  // First try: exact match with escaped HTML
  if (content.includes(escapedText)) {
    content = content.replace(escapedText, highlightSpan);
    console.log('Highlighted text in code editor using exact match fallback:', selectedText);
  } else {
    // Second try: use regex with case-insensitive flag
    const regex = new RegExp(escapeRegExp(escapedText), 'i');
    if (regex.test(content)) {
      content = content.replace(regex, highlightSpan);
      console.log('Highlighted text in code editor using regex match fallback:', selectedText);
    } else {
      // Third try: look for the text without HTML escaping (in case it's plain text)
      const plainTextRegex = new RegExp(escapeRegExp(selectedText), 'i');
      if (plainTextRegex.test(content)) {
        content = content.replace(plainTextRegex, highlightSpan);
        console.log('Highlighted text in code editor using plain text match fallback:', selectedText);
      } else {
        console.warn('Could not find text to highlight in code editor:', selectedText);
        return;
      }
    }
  }
  
  editor.innerHTML = content;
  
  // Add event listener to the newly created highlight immediately
  const newHighlight = editor.querySelector(`[data-comment-id="${commentId}"]`);
  if (newHighlight && !newHighlight.hasAttribute('data-listener-attached')) {
    newHighlight.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAnnotationForText(selectedText);
    });
    newHighlight.setAttribute('data-listener-attached', 'true');
  }
}

// Function to re-attach event listeners to code editor highlighted text elements
function reattachCodeEditorHighlightEventListeners() {
  const codeEditor = elements.codeEditor;
  if (!codeEditor) return;
  
  // Find all highlighted text elements in code editor
  const highlightElements = codeEditor.querySelectorAll('.text-comment-highlight');
  
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

function showTextComment(commentId) {
  const comment = state.comments[commentId];
  if (!comment) return;
  
  // Find the annotation for this comment and make it visible
  showAnnotationForText(comment.selectedText);
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
  if (!elements.previewContent || !elements.codeEditor || !elements.floatingComment) {
    console.error(`[${windowId}] Text selection elements not found!`, {
      previewContent: !!elements.previewContent,
      codeEditor: !!elements.codeEditor,
      floatingComment: !!elements.floatingComment
    });
    return;
  }
  
  // Remove existing event listeners if they exist
  if (commentsData.textSelectionInitialized) {
    if (commentsData.previewMouseUpHandler) {
      elements.previewContent.removeEventListener('mouseup', commentsData.previewMouseUpHandler);
    }
    if (commentsData.editorMouseUpHandler) {
      elements.codeEditor.removeEventListener('mouseup', commentsData.editorMouseUpHandler);
    }
    if (commentsData.editorKeyUpHandler) {
      elements.codeEditor.removeEventListener('keyup', commentsData.editorKeyUpHandler);
    }
    if (commentsData.editorInputHandler) {
      elements.codeEditor.removeEventListener('input', commentsData.editorInputHandler);
    }
    if (commentsData.editorScrollHandler) {
      elements.codeEditor.removeEventListener('scroll', commentsData.editorScrollHandler);
    }
  }
  
  // Create new event handlers
  commentsData.previewMouseUpHandler = handleTextSelection;
  commentsData.editorMouseUpHandler = handleTextSelection;
  commentsData.editorKeyUpHandler = handleTextSelection;
  commentsData.editorInputHandler = updateCodeHighlights;
  commentsData.editorScrollHandler = updateCodeHighlights;
  
  // For preview content (regular HTML)
  elements.previewContent.addEventListener('mouseup', commentsData.previewMouseUpHandler);
  
  // For code editor (contenteditable div) - uses same selection handling as preview
  elements.codeEditor.addEventListener('mouseup', commentsData.editorMouseUpHandler);
  elements.codeEditor.addEventListener('keyup', commentsData.editorKeyUpHandler);
  
  // Update code highlights when editor content changes or scrolls
  elements.codeEditor.addEventListener('input', commentsData.editorInputHandler);
  elements.codeEditor.addEventListener('scroll', commentsData.editorScrollHandler);
  
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

function handleTextSelection() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  if (selectedText.length > 0) {
    // Validate and clean the selected text before processing
    const cleanedText = validateAndCleanSelectedText(selectedText);
    
    if (!cleanedText) {
      console.warn('Invalid text selection, ignoring');
      elements.floatingComment.style.display = 'none';
      elements.floatingComment.storedSelectionRange = null;
      return;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (rect.width > 0 && rect.height > 0) {
      // Store the selection range immediately for later use
      const storedRange = range.cloneRange();
      
      console.log('Processing text selection:', cleanedText.substring(0, 30) + (cleanedText.length > 30 ? '...' : ''));
      
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
 * Validate and clean selected text to prevent corruption
 */
function validateAndCleanSelectedText(selectedText) {
  if (!selectedText || typeof selectedText !== 'string') {
    return null;
  }

  // Remove excessive whitespace and normalize
  let cleaned = selectedText.trim().replace(/\s+/g, ' ');

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

// Update code editor highlights when content changes
export function updateCodeHighlights() {
  // For contenteditable div, we can use the same approach as preview mode
  // Re-attach event listeners to highlighted text elements
  reattachCodeEditorHighlightEventListeners();
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
  commentsData.editorMouseUpHandler = null;
  commentsData.editorKeyUpHandler = null;
  commentsData.editorInputHandler = null;
  commentsData.editorScrollHandler = null;
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
 * Unified highlighting function that can handle both live selections and restored ranges
 * This replaces the need for separate highlighting logic in document-manager.js
 * 
 * @param {Object} options - Configuration object
 * @param {string} options.selectedText - The text to highlight
 * @param {string} options.commentId - The comment ID to associate with the highlight
 * @param {Range} [options.selectionRange] - Live DOM Range (for new comments)
 * @param {Object} [options.detailedRangeInfo] - Saved range info (for restored comments)
 * @param {string} [options.mode] - Mode override ('code' or 'preview')
 * @param {Element} [options.targetElement] - Target element override
 * @returns {boolean} - Success status
 */
export function createTextHighlight(options) {
  const { selectedText, commentId, selectionRange, detailedRangeInfo, mode, targetElement } = options;
  
  if (!selectedText || !commentId) {
    console.error('createTextHighlight: selectedText and commentId are required');
    return false;
  }

  // Determine mode and target element
  let actualMode = mode || state.currentMode;
  let target = targetElement;
  
  // Auto-detect mode from selectionRange if available
  if (selectionRange && !mode && !targetElement) {
    const codeEditor = elements.codeEditor;
    const previewContent = elements.previewContent;
    
    if (codeEditor && codeEditor.contains(selectionRange.commonAncestorContainer)) {
      actualMode = 'code';
      target = codeEditor;
    } else if (previewContent && previewContent.contains(selectionRange.commonAncestorContainer)) {
      actualMode = 'preview';
      target = previewContent;
    }
  }
  
  // Set target element based on mode if not provided
  if (!target) {
    if (actualMode === 'code') {
      target = elements.codeEditor;
    } else if (actualMode === 'preview') {
      target = elements.previewContent;
    }
  }
  
  if (!target) {
    console.error('createTextHighlight: Could not determine target element');
    return false;
  }

  // Strategy 1: Use live selection range (for new comments)
  if (selectionRange) {
    return createHighlightFromLiveRange(target, selectionRange, selectedText, commentId);
  }
  
  // Strategy 2: Restore from saved range info (for document loading)
  if (detailedRangeInfo) {
    return createHighlightFromSavedRange(target, detailedRangeInfo, selectedText, commentId);
  }
  
  // Strategy 3: Fallback to text matching
  return createHighlightFromTextSearch(target, selectedText, commentId);
}

/**
 * Create highlight from a live DOM Range
 */
function createHighlightFromLiveRange(targetElement, selectionRange, selectedText, commentId) {
  if (!targetElement.contains(selectionRange.commonAncestorContainer)) {
    console.warn('Selection range is not within target element, falling back to text search');
    return createHighlightFromTextSearch(targetElement, selectedText, commentId);
  }
  
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
    console.error('Error highlighting text using live range:', error);
    return createHighlightFromTextSearch(targetElement, selectedText, commentId);
  }
}

/**
 * Create highlight from saved range information (for document restoration)
 */
function createHighlightFromSavedRange(targetElement, rangeInfo, selectedText, commentId) {
  if (!rangeInfo) {
    return false;
  }
  
  try {
    // Validate container type matches
    const expectedContainer = rangeInfo.containerType;
    const actualContainer = targetElement.classList.contains('code-editor') ? 'code' : 'preview';
    
    if (expectedContainer !== actualContainer) {
      return false;
    }

    // Try to reconstruct the range using saved paths
    const range = reconstructRangeFromSavedInfo(targetElement, rangeInfo);
    
    if (!range) {
      // Fallback to character position restoration
      return createHighlightFromCharacterPositions(targetElement, rangeInfo, selectedText, commentId);
    }

    // Validate the range text matches
    const rangeText = range.toString().trim();
    const expectedText = rangeInfo.selectedText.trim();
    
    if (rangeText !== expectedText) {
      // Try with some flexibility for whitespace changes
      const normalizedRange = rangeText.replace(/\s+/g, ' ');
      const normalizedExpected = expectedText.replace(/\s+/g, ' ');
      
      if (normalizedRange !== normalizedExpected) {
        return createHighlightFromTextSearch(targetElement, selectedText, commentId);
      }
    }

    // Create highlight from the reconstructed range
    return createHighlightFromRange(range, commentId);

  } catch (error) {
    console.error('Error restoring highlight from saved range:', error);
    return createHighlightFromTextSearch(targetElement, selectedText, commentId);
  }
}

/**
 * Create highlight span from a DOM Range
 */
function createHighlightFromRange(range, commentId) {
  try {
    // Create highlight span
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'text-comment-highlight';
    highlightSpan.setAttribute('data-comment-id', commentId);
    highlightSpan.setAttribute('title', 'Click to view comment');

    // Extract and wrap the content
    const rangeContent = range.extractContents();
    highlightSpan.appendChild(rangeContent);
    
    // Insert the highlight span at the range position
    range.insertNode(highlightSpan);
    
    return true;
  } catch (error) {
    console.error('Error creating highlight from range:', error);
    return false;
  }
}

/**
 * Reconstruct a DOM Range from saved path/offset information
 */
function reconstructRangeFromSavedInfo(targetElement, rangeInfo) {
  try {
    const startNode = findNodeByPath(targetElement, rangeInfo.startPath);
    const endNode = findNodeByPath(targetElement, rangeInfo.endPath);

    if (!startNode || !endNode) {
      return null;
    }

    // Validate range offsets are still valid
    const startNodeLength = startNode.textContent?.length || 0;
    const endNodeLength = endNode.textContent?.length || 0;
    
    if (rangeInfo.startOffset > startNodeLength || rangeInfo.endOffset > endNodeLength) {
      return null;
    }

    // Create the range
    const range = document.createRange();
    range.setStart(startNode, rangeInfo.startOffset);
    range.setEnd(endNode, rangeInfo.endOffset);

    return range;
  } catch (error) {
    console.error('Error reconstructing range:', error);
    return null;
  }
}

/**
 * Find a node using saved path information
 */
function findNodeByPath(container, path) {
  try {
    let currentNode = container;
    
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      
      if (!currentNode.childNodes || step.index >= currentNode.childNodes.length) {
        return null;
      }
      
      currentNode = currentNode.childNodes[step.index];
      
      // Validate node type matches
      if (currentNode.nodeType !== step.nodeType) {
        // Try to find a nearby node with the correct type
        const siblingIndex = findNearbyNodeWithType(currentNode.parentNode, step.index, step.nodeType);
        if (siblingIndex !== -1) {
          currentNode = currentNode.parentNode.childNodes[siblingIndex];
        } else {
          return null;
        }
      }
    }
    
    return currentNode;
  } catch (error) {
    return null;
  }
}

/**
 * Find a nearby node with the specified type
 */
function findNearbyNodeWithType(parent, startIndex, nodeType) {
  // Check a few nodes before and after the original index
  for (let offset = 0; offset <= 2; offset++) {
    // Check after
    const afterIndex = startIndex + offset;
    if (afterIndex < parent.childNodes.length && parent.childNodes[afterIndex].nodeType === nodeType) {
      return afterIndex;
    }
    
    // Check before (skip offset 0 since we already checked that)
    if (offset > 0) {
      const beforeIndex = startIndex - offset;
      if (beforeIndex >= 0 && parent.childNodes[beforeIndex].nodeType === nodeType) {
        return beforeIndex;
      }
    }
  }
  
  return -1;
}

/**
 * Create highlight using character positions (fallback method)
 */
function createHighlightFromCharacterPositions(targetElement, rangeInfo, selectedText, commentId) {
  try {
    const fullText = targetElement.textContent || '';
    const startOffset = rangeInfo.startOffset;
    const endOffset = rangeInfo.endOffset;
    
    // Validate positions are within bounds
    if (startOffset >= fullText.length || endOffset > fullText.length || startOffset >= endOffset) {
      return false;
    }
    
    // Create a simple text range using the first text node
    const firstTextNode = findFirstTextNode(targetElement);
    if (!firstTextNode) {
      return false;
    }
    
    // For simple cases where there's only one text node, positions map directly
    if (firstTextNode.textContent.length === fullText.length) {
      const range = document.createRange();
      range.setStart(firstTextNode, startOffset);
      range.setEnd(firstTextNode, endOffset);
      
      return createHighlightFromRange(range, commentId);
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Find the first text node in an element
 */
function findFirstTextNode(element) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  return walker.nextNode();
}

/**
 * Fallback: Create highlight using text search and replacement
 */
function createHighlightFromTextSearch(targetElement, selectedText, commentId) {
  const isCodeEditor = targetElement.classList.contains('code-editor');
  
  if (isCodeEditor) {
    return highlightInCodeEditorFallback(selectedText, commentId, null);
  } else {
    return highlightInPreviewFallback(selectedText, commentId, null);
  }
} 