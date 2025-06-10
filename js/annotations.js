// Floating Annotations Module
import { state, elements, incrementCommentCounter } from './state.js';
import { escapeHtml } from './utils.js';
import { getCurrentUser } from './auth.js';
import { clearAllComments, clearCurrentModeComments } from './comments.js';

/**
 * Simple helper function to remove highlight wrapper while preserving content
 */
export function removeHighlightWrapper(highlight) {
  console.log(`[removeHighlightWrapper] Removing highlight:`, highlight);
  
  // Get the parent element before manipulation
  const parent = highlight.parentElement;
  if (!parent) {
    console.error(`[removeHighlightWrapper] No parent element found for highlight`);
    return;
  }
  
  // For complex HTML content, we need to move child nodes properly
  const childNodes = Array.from(highlight.childNodes);
  
  // Insert all child nodes before the highlight element
  childNodes.forEach(child => {
    parent.insertBefore(child, highlight);
  });
  
  // Remove the empty highlight element
  parent.removeChild(highlight);
  
  console.log(`[removeHighlightWrapper] Highlight removed successfully`);
}

export function createFloatingAnnotation(selectedText, commentContent, commentData = null) {
  const annotationId = commentData ? commentData.id : `annotation-${incrementCommentCounter()}`;
  
  // Extract comment number from ID for display
  let commentNumber = state.commentIdCounter;
  if (commentData && commentData.id) {
    // Extract number from IDs like "text-comment-3" or "annotation-5"
    const match = commentData.id.match(/(\d+)$/);
    if (match) {
      commentNumber = match[1];
    }
  }
  
  // Get user information from commentData or current user
  let authorInfo = '';
  if (commentData && commentData.authorName) {
    const authorEmoji = commentData.authorEmoji || '👤';
    const authorName = commentData.authorName;
    const authorColor = commentData.authorColor || '#666666';
    authorInfo = `<div class="annotation-author" style="color: ${authorColor};">
      <span class="author-emoji">${authorEmoji}</span>
      <span class="author-name">${authorName}</span>
    </div>`;
  } else {
    // Fallback to current user if no commentData provided
    const currentUser = getCurrentUser();
    if (currentUser) {
      authorInfo = `<div class="annotation-author" style="color: ${currentUser.color};">
        <span class="author-emoji">${currentUser.emoji}</span>
        <span class="author-name">${currentUser.name}</span>
      </div>`;
    }
  }
  
  // Create annotation element
  const annotation = document.createElement('div');
  annotation.className = 'floating-annotation';
  annotation.id = annotationId;
  annotation.innerHTML = `
    <div class="annotation-header">
      <div class="annotation-title">
        <span>Comment #${commentNumber}</span>
        ${authorInfo}
      </div>
      <div class="annotation-actions">
        <button class="annotation-resolve" onclick="resolveFloatingAnnotation('${annotationId}')" title="Mark as resolved">
          ✓
        </button>
        <button class="annotation-delete" onclick="deleteFloatingAnnotation('${annotationId}')" title="Delete comment permanently">
          🗑️
        </button>
        <button class="annotation-close" onclick="closeFloatingAnnotation('${annotationId}')" title="Close window">×</button>
      </div>
    </div>
    <div class="annotation-content">${escapeHtml(commentContent)}</div>
  `;
  
  // Calculate smart positioning on the right side, stacked vertically
  const annotationWidth = 280;
  const annotationHeight = 150;
  const rightMargin = 20;
  const topMargin = 100;
  const verticalSpacing = 20;
  
  // Count existing visible annotations for this mode to determine stacking position
  const existingAnnotations = Object.values(state.comments).filter(comment => 
    comment.mode === state.currentMode && !comment.isResolved && comment.ui && comment.ui.element && 
    comment.ui.element.style.display !== 'none'
  );
  
  const stackIndex = existingAnnotations.length;
  
  const left = window.innerWidth - annotationWidth - rightMargin;
  const top = topMargin + (stackIndex * (annotationHeight + verticalSpacing));
  
  // Ensure it doesn't go off screen vertically
  const maxTop = window.innerHeight - annotationHeight - 20;
  const finalTop = Math.min(top, maxTop);
  
  // Set positioning styles - use fixed positioning for reliability
  annotation.style.position = 'fixed';
  annotation.style.top = `${finalTop}px`;
  annotation.style.left = `${left}px`;
  annotation.style.width = `${annotationWidth}px`;
  annotation.style.display = 'block';
  annotation.style.zIndex = '15000';
  
  // Add to body for reliable positioning
  document.body.appendChild(annotation);
  
  // Update the unified comment structure with UI state
  if (commentData && state.comments[commentData.id]) {
    // Update existing comment with UI state
    state.comments[commentData.id].ui = {
      position: { top: finalTop, left },
      element: annotation,
      isVisible: true,
      isDragging: false
    };
  } else {
    // Create new annotation data if not using existing comment
    const newAnnotationData = {
      id: annotationId,
      selectedText: selectedText,
      commentMessage: commentContent,
      position: { top: finalTop, left },
      mode: state.currentMode,
      isResolved: false,
      // Add user information
      author: commentData ? commentData.author : (getCurrentUser()?.id || 'anonymous'),
      authorName: commentData ? commentData.authorName : (getCurrentUser()?.name || 'Anonymous'),
      authorEmoji: commentData ? commentData.authorEmoji : (getCurrentUser()?.emoji || '👤'),
      authorColor: commentData ? commentData.authorColor : (getCurrentUser()?.color || '#666666'),
      // UI state
      ui: {
        position: { top: finalTop, left },
        element: annotation,
        isVisible: true,
        isDragging: false
      }
    };
    
    state.comments[annotationId] = newAnnotationData;
  }
  
  // Make annotation draggable
  makeAnnotationDraggable(annotation, commentData);
  
  // Trigger auto-save for comment changes
  if (window.documentManager) {
    window.documentManager.onCommentChange();
  }
}

// Create special annotation for AI suggestions with accept/reject buttons
export function createAISuggestionAnnotation(commentData) {
  const annotationId = commentData.id;
  
  // Extract comment number from ID for display
  let commentNumber = state.commentIdCounter;
  const match = commentData.id.match(/(\d+)$/);
  if (match) {
    commentNumber = match[1];
  }
  
  // Build change details HTML
  let changeDetailsHtml = '';
  if (commentData.lineDiffs && commentData.lineDiffs.length > 0) {
    changeDetailsHtml = '<div class="ai-suggestion-changes">';
    commentData.lineDiffs.forEach((diff, index) => {
      let changeIcon = '';
      let changeClass = '';
      let changeDescription = '';
      
      if (diff.changeType === 'added') {
        changeIcon = '+';
        changeClass = 'change-added';
        changeDescription = `Line ${diff.lineIndex + 1}: Add "${escapeHtml(diff.suggestedLine.trim())}"`;
      } else if (diff.changeType === 'removed') {
        changeIcon = '-';
        changeClass = 'change-removed';
        changeDescription = `Line ${diff.lineIndex + 1}: Remove "${escapeHtml(diff.originalLine.trim())}"`;
      } else if (diff.changeType === 'modified') {
        changeIcon = '±';
        changeClass = 'change-modified';
        changeDescription = `Line ${diff.lineIndex + 1}: Change "${escapeHtml(diff.originalLine.trim())}" to "${escapeHtml(diff.suggestedLine.trim())}"`;
      }
      
      changeDetailsHtml += `
        <div class="change-item ${changeClass}">
          <span class="change-icon">${changeIcon}</span>
          <span class="change-description">${changeDescription}</span>
        </div>
      `;
    });
    changeDetailsHtml += '</div>';
  }
  
  // Build user info for display
  let userInfoHtml = '';
  if (commentData.requestedBy) {
    userInfoHtml = `
      <div class="annotation-requester">
        <span class="requester-label">Requested by:</span>
        <span class="requester-emoji">${commentData.requestedBy.emoji}</span>
        <span class="requester-name">${commentData.requestedBy.name}</span>
      </div>
    `;
  }
  
  // Create annotation element with special AI styling
  const annotation = document.createElement('div');
  annotation.className = 'floating-annotation ai-suggestion-annotation';
  annotation.id = annotationId;
  annotation.innerHTML = `
    <div class="annotation-header ai-suggestion-header">
      <div class="annotation-title">
        <span>AI Suggestion #${commentNumber}</span>
        <div class="annotation-author" style="color: ${commentData.authorColor};">
          <span class="author-emoji">${commentData.authorEmoji}</span>
          <span class="author-name">${commentData.authorName}</span>
        </div>
        ${userInfoHtml}
      </div>
      <div class="annotation-actions">
        <button class="annotation-close" onclick="closeFloatingAnnotation('${annotationId}')" title="Close window">×</button>
      </div>
    </div>
    <div class="annotation-content">
      <div class="ai-suggestion-summary">${escapeHtml(commentData.commentMessage)}</div>
      ${changeDetailsHtml}
      <div class="ai-suggestion-actions">
        <button class="ai-accept-btn" onclick="window.acceptAISuggestion('${annotationId}')" title="Accept all changes">
          ✅ Accept All
        </button>
        <button class="ai-reject-btn" onclick="window.rejectAISuggestion('${annotationId}')" title="Reject all changes">
          ❌ Reject All
        </button>
      </div>
    </div>
  `;
  
  // Calculate positioning - AI suggestions appear on the left side
  const annotationWidth = 350; // Wider for AI suggestions
  const leftMargin = 20;
  const topMargin = 100;
  
  const left = leftMargin;
  const top = topMargin;
  
  // Set positioning styles
  annotation.style.position = 'fixed';
  annotation.style.top = `${top}px`;
  annotation.style.left = `${left}px`;
  annotation.style.width = `${annotationWidth}px`;
  annotation.style.display = 'block';
  annotation.style.zIndex = '15000';
  
  // Add to body
  document.body.appendChild(annotation);
  
  // Update comment UI state
  commentData.ui = {
    position: { top, left },
    element: annotation,
    isVisible: true,
    isDragging: false
  };
  
  // Make annotation draggable
  makeAnnotationDraggable(annotation, commentData);
  
  // Import and set up the accept/reject functions
  import('./template-execution.js').then(module => {
    window.acceptAISuggestion = module.acceptAISuggestion;
    window.rejectAISuggestion = module.rejectAISuggestion;
  });
}

export function removeFloatingAnnotation(annotationId) {
  // Find and remove from unified comments structure
  if (state.comments[annotationId]) {
    const comment = state.comments[annotationId];
    
    // Remove from DOM
    if (comment.ui && comment.ui.element) {
      comment.ui.element.remove();
    }
    
    // Remove from state
    delete state.comments[annotationId];
    
    // Trigger auto-save for comment changes
    if (window.documentManager) {
      window.documentManager.onCommentChange();
    }
  }
  
  // Fallback: Remove from DOM by ID if element still exists
  const element = document.getElementById(annotationId);
  if (element) {
    element.remove();
  }
}

// Delete comment completely (removes annotation + yellow highlighting)
export function deleteFloatingAnnotation(annotationId) {
  // Find the annotation data to get the selected text
  const comment = state.comments[annotationId];
  
  console.log(`[deleteFloatingAnnotation] Deleting annotation: ${annotationId}`);
  console.log(`[deleteFloatingAnnotation] Comment data:`, comment);
  
  if (comment) {
    // Remove text highlighting for this comment
    const highlights = document.querySelectorAll(`.text-comment-highlight[data-comment-id="${annotationId}"]`);
    console.log(`[deleteFloatingAnnotation] Found ${highlights.length} highlights for comment ${annotationId}`);
    console.log(`[deleteFloatingAnnotation] Highlights:`, highlights);
    
    // If no highlights found, try to debug why
    if (highlights.length === 0) {
      console.log(`[deleteFloatingAnnotation] No highlights found! Debugging...`);
      const allHighlights = document.querySelectorAll('.text-comment-highlight');
      console.log(`[deleteFloatingAnnotation] Total highlights on page: ${allHighlights.length}`);
      allHighlights.forEach((h, i) => {
        console.log(`  Highlight ${i + 1}: data-comment-id="${h.getAttribute('data-comment-id')}", innerHTML="${h.innerHTML.substring(0, 50)}..."`);
      });
    }
    
    highlights.forEach((highlight, index) => {
      console.log(`[deleteFloatingAnnotation] Removing highlight ${index + 1}:`, highlight);
      removeHighlightWrapper(highlight);
    });
  } else {
    console.warn(`[deleteFloatingAnnotation] No comment data found for ${annotationId}`);
  }
  
  // Remove the annotation itself
  removeFloatingAnnotation(annotationId);
  
  // Trigger auto-save for comment changes
  if (window.documentManager) {
    window.documentManager.onCommentChange();
  }
}

// Close annotation window (just hide, keep the comment)
export function closeFloatingAnnotation(annotationId) {
  const element = document.getElementById(annotationId);
  if (element) {
    element.style.display = 'none';
  }
}

function makeAnnotationDraggable(element, annotationData) {
  if (!annotationData) {
    console.warn('makeAnnotationDraggable: annotationData is undefined, skipping drag setup');
    return;
  }
  
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;
  
  element.addEventListener('mousedown', (e) => {
    // Only start dragging if not clicking on action buttons
    if (e.target.classList.contains('annotation-close') || 
        e.target.classList.contains('annotation-delete') ||
        e.target.classList.contains('annotation-resolve') ||
        e.target.closest('.annotation-actions')) {
      return;
    }
    
    isDragging = true;
    
    // Get current position of the element
    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    // Store initial mouse position
    startX = e.clientX;
    startY = e.clientY;
    
    // Prevent text selection while dragging
    e.preventDefault();
    
    // Add global mouse move and up listeners
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // Add visual feedback
    element.style.cursor = 'grabbing';
    element.style.opacity = '0.8';
  });
  
  function onMouseMove(e) {
    if (!isDragging) return;
    
    // Calculate how much the mouse has moved
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Calculate new position
    const newLeft = initialLeft + deltaX;
    const newTop = initialTop + deltaY;
    
    // Keep annotation within viewport bounds
    const annotationRect = element.getBoundingClientRect();
    const maxLeft = window.innerWidth - annotationRect.width;
    const maxTop = window.innerHeight - annotationRect.height;
    
    const clampedLeft = Math.max(0, Math.min(newLeft, maxLeft));
    const clampedTop = Math.max(0, Math.min(newTop, maxTop));
    
    // Apply new position
    element.style.left = `${clampedLeft}px`;
    element.style.top = `${clampedTop}px`;
    
    // Update stored position - ensure ui.position exists
    if (annotationData.ui && annotationData.ui.position) {
      annotationData.ui.position.left = clampedLeft;
      annotationData.ui.position.top = clampedTop;
    }
  }
  
  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // Remove visual feedback
    element.style.cursor = 'default';
    element.style.opacity = '1';

  }
}

export function updateAnnotationsVisibility() {
  // Show/hide annotations based on current mode
  Object.values(state.comments).forEach(comment => {
    if (comment.ui && comment.ui.element) {
      // Only show annotations that match the current mode and are not resolved
      const shouldShow = comment.mode === state.currentMode && !comment.isResolved;
      comment.ui.element.style.display = shouldShow ? 'block' : 'none';
    }
  });
}

// Hide all annotations without deleting them (for switching to main page)
export function hideAllAnnotations() {
  Object.values(state.comments).forEach(comment => {
    if (comment.ui && comment.ui.element) {
      comment.ui.element.style.display = 'none';
    }
  });
}

// Clear annotations for a specific document (when document is closed)
export function clearAnnotationsForDocument(documentId) {
  // Find annotations that belong to this document
  // Since annotations don't store documentId directly, we'll need to identify them by other means
  // For now, we'll clear all annotations when a document is closed
  // This could be improved by adding documentId to annotation data in the future
  console.log(` Clearing annotations for document: ${documentId}`);
  clearAllAnnotations();
}

export function clearAllAnnotations() {
  // Use the unified clear function from comments.js
  return clearAllComments();
}

// Clear only annotations for the current mode
export function clearCurrentModeAnnotations() {
  // Use the unified clear function from comments.js
  return clearCurrentModeComments();
}

// Function to refresh annotation elements and ensure they're in the DOM
export function refreshAnnotationElements() {
  Object.values(state.comments).forEach(annotationData => {
    const element = document.getElementById(annotationData.id);
    
    if (!element || !document.body.contains(element)) {
      recreateAnnotationElement(annotationData);
    } else {
      // Ensure visibility respects both resolved state and current mode
      const shouldShow = annotationData.mode === state.currentMode && !annotationData.isResolved;
      element.style.display = shouldShow ? 'block' : 'none';
      element.style.zIndex = '15000';
    }
  });
}

// Show annotation window for a specific text (when clicking highlighted text)
export function showAnnotationForText(selectedText) {
  // Find the annotation for this text that matches the current mode
  const annotation = Object.values(state.comments).find(comment => 
    comment.selectedText === selectedText && comment.mode === state.currentMode
  );
  
  if (!annotation) {
    // Try to find by partial match in case of text differences, but still filter by mode
    const partialMatch = Object.values(state.comments).find(comment => 
      comment.mode === state.currentMode && 
      (comment.selectedText.includes(selectedText) || selectedText.includes(comment.selectedText))
    );
    
    if (partialMatch) {
      // Use the partial match
      showAnnotationById(partialMatch.id);
      return;
    }
    
    return;
  }
  
  // Show the annotation window
  showAnnotationById(annotation.id);
}

// Helper function to show annotation by ID
function showAnnotationById(annotationId) {
  const element = document.getElementById(annotationId);
  
  if (element) {
    // Check if element is in the DOM
    const isInDOM = document.body.contains(element);
    
    if (!isInDOM) {
      console.error('Annotation element exists but is not in DOM!');
      return;
    }
    
    // Clear previous active annotation highlighting
    clearActiveAnnotationHighlight();
    
    // Show the element
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.opacity = '1';
    
    // Bring to front with higher z-index than dialogs
    element.style.zIndex = '15000';
    
    // Add active highlighting to this annotation
    highlightActiveAnnotation(element);
    
    // Use reliable fixed positioning
    element.style.position = 'fixed';
    
    // Only set default position if element doesn't have proper positioning
    const currentLeft = parseInt(element.style.left) || 0;
    const currentTop = parseInt(element.style.top) || 0;
    
    if (currentLeft === 0 || currentTop === 0) {
      // Calculate default position on right side
      const annotationWidth = 280;
      const rightMargin = 20;
      const topMargin = 100;
      
      const left = window.innerWidth - annotationWidth - rightMargin;
      const top = topMargin;
      
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.width = `${annotationWidth}px`;
      
      // Update stored position
      const annotation = state.comments[annotationId];
      if (annotation) {
        annotation.ui.position = { top, left };
      }
    }
    
    // Ensure it's in the body for reliable positioning
    if (!document.body.contains(element)) {
      document.body.appendChild(element);
    }
    
    // Check for and remove any hidden dialog overlays that might be blocking
    const hiddenDialogs = document.querySelectorAll('.display-choice-dialog');
    hiddenDialogs.forEach(dialog => {
      if (dialog.style.display === 'none' || !dialog.offsetParent) {
        dialog.remove();
      }
    });
  } else {
    console.error('Annotation element not found in DOM with ID:', annotationId);
    
    // Try to recreate the annotation if we have the data
    const annotation = state.comments[annotationId];
    if (annotation) {
      recreateAnnotationElement(annotation);
      // After recreating, try to show it again
      const recreatedElement = document.getElementById(annotationId);
      if (recreatedElement) {
        clearActiveAnnotationHighlight();
        highlightActiveAnnotation(recreatedElement);
      }
    }
  }
}

// Function to highlight the active annotation window
function highlightActiveAnnotation(element) {
  // Add the active class for CSS styling
  element.classList.add('annotation-active');
}

// Function to clear active annotation highlighting from all annotations
export function clearActiveAnnotationHighlight() {
  const allAnnotations = document.querySelectorAll('.floating-annotation');
  allAnnotations.forEach(annotation => {
    annotation.classList.remove('annotation-active');
  });
}

// Helper function to recreate annotation element if it's missing from DOM
function recreateAnnotationElement(annotationData) {
  const { id, selectedText, commentMessage } = annotationData;
  
  // Extract comment number from ID for display (more robust than simple split)
  let commentNumber = id;
  const match = id.match(/(\d+)$/);
  if (match) {
    commentNumber = match[1];
  } else {
    // Fallback for simple split if regex doesn't match
    const parts = id.split('-');
    commentNumber = parts[parts.length - 1];
  }
  
  // Get user information for the annotation
  let authorInfo = '';
  if (annotationData.authorName) {
    const authorEmoji = annotationData.authorEmoji || '👤';
    const authorName = annotationData.authorName;
    const authorColor = annotationData.authorColor || '#666666';
    authorInfo = `<div class="annotation-author" style="color: ${authorColor};">
      <span class="author-emoji">${authorEmoji}</span>
      <span class="author-name">${authorName}</span>
    </div>`;
  }
  
  // Create annotation element
  const annotation = document.createElement('div');
  annotation.className = 'floating-annotation';
  annotation.id = id;
  annotation.innerHTML = `
    <div class="annotation-header">
      <div class="annotation-title">
        <span>Comment #${commentNumber}</span>
        ${authorInfo}
      </div>
      <div class="annotation-actions">
        <button class="annotation-resolve" onclick="resolveFloatingAnnotation('${id}')" title="Mark as resolved">
          ✓
        </button>
        <button class="annotation-delete" onclick="deleteFloatingAnnotation('${id}')" title="Delete comment permanently">
          🗑️
        </button>
        <button class="annotation-close" onclick="closeFloatingAnnotation('${id}')" title="Close window">×</button>
      </div>
    </div>
    <div class="annotation-content">${escapeHtml(commentMessage)}</div>
  `;
  
  // Use stored position if available, otherwise calculate new position on right side
  let top, left;
  if (annotationData.ui && annotationData.ui.position && annotationData.ui.position.top && annotationData.ui.position.left) {
    top = annotationData.ui.position.top;
    left = annotationData.ui.position.left;
  } else {
    // Calculate default position on right side
    const annotationWidth = 280;
    const annotationHeight = 150;
    const rightMargin = 20;
    const topMargin = 100;
    
    left = window.innerWidth - annotationWidth - rightMargin;
    top = topMargin;
    
    // Update stored position
    if (!annotationData.ui) {
      annotationData.ui = {};
    }
    annotationData.ui.position = { top, left };
  }
  
  // Position the annotation using reliable fixed positioning
  annotation.style.position = 'fixed';
  annotation.style.top = `${top}px`;
  annotation.style.left = `${left}px`;
  annotation.style.width = '280px';
  annotation.style.display = 'block';
  annotation.style.zIndex = '15000';
  
  // Add to body for reliable positioning
  document.body.appendChild(annotation);
  
  // Update the annotation data
  annotationData.ui.element = annotation;
  
  // Make annotation draggable
  makeAnnotationDraggable(annotation, annotationData);
}

// Make functions globally accessible for onclick handlers
window.removeFloatingAnnotation = removeFloatingAnnotation;
window.deleteFloatingAnnotation = deleteFloatingAnnotation;
window.closeFloatingAnnotation = closeFloatingAnnotation;
window.resolveFloatingAnnotation = resolveFloatingAnnotation;
window.unresolveFloatingAnnotation = unresolveFloatingAnnotation;

// Handle window resize to reposition annotations that might go off-screen
function handleWindowResize() {
  Object.values(state.comments).forEach(annotation => {
    if (annotation.ui && annotation.ui.element && annotation.ui.element.style.display !== 'none') {
      const element = annotation.ui.element;
      const rect = element.getBoundingClientRect();
      
      // Check if annotation is off-screen and reposition if needed
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;
      
      let newLeft = annotation.ui.position.left;
      let newTop = annotation.ui.position.top;
      
      if (newLeft > maxLeft) {
        newLeft = Math.max(20, maxLeft);
      }
      if (newTop > maxTop) {
        newTop = Math.max(20, maxTop);
      }
      
      if (newLeft !== annotation.ui.position.left || newTop !== annotation.ui.position.top) {
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
        annotation.ui.position.left = newLeft;
        annotation.ui.position.top = newTop;
      }
    }
  });
}

// Add window resize listener
window.addEventListener('resize', handleWindowResize);

// Resolve comment (mark as resolved, change appearance)
export function resolveFloatingAnnotation(annotationId) {
  // Find the annotation data
  const annotation = state.comments[annotationId];
  if (!annotation) return;
  
  // Mark as resolved
  annotation.isResolved = true;
  
  // Extract comment number for display
  let commentNumber = annotationId;
  const match = annotationId.match(/(\d+)$/);
  if (match) {
    commentNumber = match[1];
  }
  
  // Update the annotation appearance
  const element = document.getElementById(annotationId);
  if (element) {
    element.classList.add('annotation-resolved');
    
    // Update the header to show resolved state
    const header = element.querySelector('.annotation-header span');
    if (header) {
      header.textContent = `Comment #${commentNumber} ✓ Resolved`;
    }
    
    // Change the resolve button to show it's resolved
    const resolveBtn = element.querySelector('.annotation-resolve');
    if (resolveBtn) {
      resolveBtn.innerHTML = '↺';
      resolveBtn.title = 'Mark as unresolved';
      resolveBtn.onclick = () => unresolveFloatingAnnotation(annotationId);
    }
  }
  
  // Also update the highlighting to show resolved state
  const highlights = document.querySelectorAll('.text-comment-highlight');
  highlights.forEach(highlight => {
    if (highlight.textContent === annotation.selectedText) {
      highlight.classList.add('text-comment-resolved');
    }
  });
  
  // Trigger auto-save for comment changes
  if (window.documentManager) {
    window.documentManager.onCommentChange();
  }
}

// Unresolve comment (mark as active again)
export function unresolveFloatingAnnotation(annotationId) {
  // Find the annotation data
  const annotation = state.comments[annotationId];
  if (!annotation) return;
  
  // Mark as unresolved
  annotation.isResolved = false;
  
  // Extract comment number for display
  let commentNumber = annotationId;
  const match = annotationId.match(/(\d+)$/);
  if (match) {
    commentNumber = match[1];
  }
  
  // Update the annotation appearance
  const element = document.getElementById(annotationId);
  if (element) {
    element.classList.remove('annotation-resolved');
    
    // Update the header to show active state
    const header = element.querySelector('.annotation-header span');
    if (header) {
      header.textContent = `Comment #${commentNumber}`;
    }
    
    // Change the resolve button back
    const resolveBtn = element.querySelector('.annotation-resolve');
    if (resolveBtn) {
      resolveBtn.innerHTML = '✓';
      resolveBtn.title = 'Mark as resolved';
      resolveBtn.onclick = () => resolveFloatingAnnotation(annotationId);
    }
  }
  
  // Remove resolved styling from highlighting
  const highlights = document.querySelectorAll('.text-comment-highlight');
  highlights.forEach(highlight => {
    if (highlight.textContent === annotation.selectedText) {
      highlight.classList.remove('text-comment-resolved');
    }
  });
  
  // Trigger auto-save for comment changes
  if (window.documentManager) {
    window.documentManager.onCommentChange();
  }
}

// Create special annotation for template suggestions with apply/reject buttons
export function createTemplateSuggestionAnnotation(commentData) {
  const annotationId = commentData.id;
  
  // Extract comment number from ID for display
  let commentNumber = state.commentIdCounter;
  const match = commentData.id.match(/(\d+)$/);
  if (match) {
    commentNumber = match[1];
  }
  
  // Build suggestion details HTML
  let suggestionDetailsHtml = '';
  if (commentData.aiSuggestion) {
    const suggestion = commentData.aiSuggestion;
    suggestionDetailsHtml = `
      <div class="template-suggestion-details">
        <div class="suggestion-change">
          <strong>Suggested Change (${suggestion.change_type}):</strong>
          <div class="suggestion-code">${escapeHtml(suggestion.suggested_change)}</div>
        </div>
        ${suggestion.target_location ? `<div class="suggestion-location"><strong>Location:</strong> ${escapeHtml(suggestion.target_location)}</div>` : ''}
        <div class="suggestion-confidence">
          <strong>Confidence:</strong> ${Math.round(suggestion.confidence * 100)}%
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${suggestion.confidence * 100}%"></div>
          </div>
        </div>
      </div>
    `;
  }
  
  // Create annotation element with special template suggestion styling
  const annotation = document.createElement('div');
  annotation.className = 'floating-annotation template-suggestion-annotation';
  annotation.id = annotationId;
  annotation.innerHTML = `
    <div class="annotation-header template-suggestion-header">
      <div class="annotation-title">
        <span>🔄 Template Suggestion #${commentNumber}</span>
        <div class="annotation-author" style="color: ${commentData.authorColor};">
          <span class="author-emoji">${commentData.authorEmoji}</span>
          <span class="author-name">${commentData.authorName}</span>
        </div>
      </div>
      <div class="annotation-actions">
        <button class="annotation-close" onclick="closeFloatingAnnotation('${annotationId}')" title="Close window">×</button>
      </div>
    </div>
    <div class="annotation-content">
      <div class="original-comment">
        <strong>💬 Original Comment:</strong>
        <div class="comment-text">${escapeHtml(commentData.originalComment)}</div>
      </div>
      ${suggestionDetailsHtml}
      <div class="template-suggestion-actions">
        <button class="template-apply-btn" onclick="window.acceptInlineDiff('${annotationId}', window.documentManager?.activeDocumentId || '')" title="Apply this suggestion to the template">
          ✅ Apply Change
        </button>
        <button class="template-reject-btn" onclick="window.rejectInlineDiff('${annotationId}', window.documentManager?.activeDocumentId || '')" title="Reject this suggestion">
          ❌ Reject
        </button>
      </div>
    </div>
  `;
  
  // Calculate positioning - Template suggestions appear on the right side
  const annotationWidth = 380; // Wider for template suggestions
  const rightMargin = 20;
  const topMargin = 120;
  
  const right = rightMargin;
  const top = topMargin;
  
  // Set initial position
  annotation.style.position = 'fixed';
  annotation.style.right = `${right}px`;
  annotation.style.top = `${top}px`;
  annotation.style.width = `${annotationWidth}px`;
  annotation.style.zIndex = '10001';
  
  // Make it draggable - pass commentData as the second parameter
  makeAnnotationDraggable(annotation, commentData);
  
  // Add to DOM
  document.body.appendChild(annotation);
  
  // Store UI state - ensure ui property exists
  if (!commentData.ui) {
    commentData.ui = {};
  }
  commentData.ui.element = annotation;
  commentData.ui.position = { top, right };
  commentData.ui.isVisible = true;
  
  // Add fade-in animation
  setTimeout(() => {
    annotation.style.opacity = '1';
    annotation.style.transform = 'scale(1)';
  }, 10);
  
  console.log(`Created template suggestion annotation: ${annotationId}`);
  
  return annotation;
} 