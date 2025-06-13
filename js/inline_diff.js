export { addInlineDiffEventListeners, findConflictingDiffs, removeConflictingInlineDiffs, createInlineDiff };

/**
 * Create inline diff in any content element with configurable options
 * @param {Object} options - Configuration options
 * @param {string} options.selectedText - The original selected text
 * @param {Object} options.parsedSuggestion - Parsed AI suggestion object
 * @param {string} options.commentId - Comment ID for the diff
 * @param {Element} options.targetElement - Target DOM element to modify
 * @param {Function} options.escapeHtml - HTML escape function (optional, for source mode)
 * @returns {boolean} - Success status
 */
function createInlineDiff(options) {
  const { selectedText, parsedSuggestion, commentId, targetElement, escapeHtml } = options;
  
  if (!targetElement) {
    console.warn('Target element not found');
    return false;
  }
  
  let content = targetElement.innerHTML;
  const originalText = parsedSuggestion.original_text || selectedText;
  const newText = parsedSuggestion.suggested_change || parsedSuggestion.new_text || '';
  const changeType = parsedSuggestion.change_type;
  
  console.log('Creating inline diff:', { originalText, newText, changeType });
  
  // Handle HTML escaping if provided (for source mode)
  const safeOriginalText = escapeHtml ? escapeHtml(originalText) : originalText;
  const safeNewText = escapeHtml ? escapeHtml(newText) : newText;
  
  if (changeType === 'replace' && content.includes(safeOriginalText)) {
    // Replace: show both original (strikethrough) and new (highlighted)
    const inlineDiffHtml = `
      <span class="inline-diff-container" data-comment-id="${commentId}">
        <span class="inline-diff-delete" data-comment-id="${commentId}" title="Original text - click to accept/reject">${safeOriginalText}</span>
        <span class="inline-diff-add" data-comment-id="${commentId}" title="AI suggestion - click to accept/reject">${safeNewText}</span>
      </span>
    `;
    
    content = content.replace(safeOriginalText, inlineDiffHtml);
    targetElement.innerHTML = content;
    
  } else if (changeType === 'add') {
    // Add: show new content as highlighted addition
    const additionHtml = `
      <span class="inline-diff-add" data-comment-id="${commentId}" title="AI suggestion - click to accept/reject">${safeNewText}</span>
    `;
    
    // Try to add near the selected text, or append at end
    const safeSelectedText = escapeHtml ? escapeHtml(selectedText) : selectedText;
    if (content.includes(safeSelectedText)) {
      content = content.replace(safeSelectedText, safeSelectedText + ' ' + additionHtml);
    } else {
      content += '\n' + additionHtml;
    }
    targetElement.innerHTML = content;
    
  } else if (changeType === 'remove' && content.includes(safeOriginalText)) {
    // Remove: show original text with strikethrough
    const removalHtml = `
      <span class="inline-diff-delete" data-comment-id="${commentId}" title="Text to remove - click to accept/reject">${safeOriginalText}</span>
    `;
    
    content = content.replace(safeOriginalText, removalHtml);
    targetElement.innerHTML = content;
    
  } else {
    console.warn('Could not apply diff - fallback to simple addition');
    // Fallback: show as contextual addition
    const fallbackHtml = `
      <div class="inline-diff-addition" data-comment-id="${commentId}">
        <span class="inline-diff-add" data-comment-id="${commentId}" title="AI suggestion - click to accept/reject">${safeNewText}</span>
      </div>
    `;
    
    targetElement.innerHTML += fallbackHtml;
  }
  
  // Add click handlers for accept/reject
  addInlineDiffEventListeners(commentId);
  
  console.log('Created inline diff in content');
  return true;
}


/**
 * Find conflicting inline diffs that target the same text
 * @param {string} targetText - The text that the new diff wants to target
 * @param {string} htmlContent - Current HTML content with existing diffs
 * @returns {Array} Array of comment IDs that have conflicting diffs
 */
function findConflictingDiffs(targetText, htmlContent) {
    const conflicts = [];
    
    // Look for existing diff elements that contain the target text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Find all existing diff elements
    const existingDiffElements = tempDiv.querySelectorAll('.inline-diff-delete, .inline-diff-add');
    
    existingDiffElements.forEach(element => {
      const commentId = element.getAttribute('data-comment-id');
      const elementText = element.textContent;
      
      // Check if this existing diff conflicts with the new target text
      if (elementText === targetText || targetText.includes(elementText) || elementText.includes(targetText)) {
        if (commentId && !conflicts.includes(commentId)) {
          conflicts.push(commentId);
        }
      }
    });
    
    return conflicts;
  }
  
  /**
   * Remove conflicting inline diffs from HTML content
   * @param {string} htmlContent - Current HTML content
   * @param {Array} conflictingCommentIds - Array of comment IDs to remove
   * @returns {string} HTML content with conflicting diffs removed
   */
  function removeConflictingInlineDiffs(htmlContent, conflictingCommentIds) {
    let cleanedContent = htmlContent;
    
    conflictingCommentIds.forEach(commentId => {
      // Create a temporary div to work with the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanedContent;
      
      // Find and remove all diff elements for this comment ID
      const diffElements = tempDiv.querySelectorAll(`[data-comment-id="${commentId}"]`);
      
      diffElements.forEach(element => {
        if (element.classList.contains('inline-diff-delete')) {
          // For delete elements, replace with the original text
          const textNode = document.createTextNode(element.textContent);
          element.parentNode.replaceChild(textNode, element);
        } else if (element.classList.contains('inline-diff-add')) {
          // For add elements, remove them completely
          element.remove();
        }
      });
      
      cleanedContent = tempDiv.innerHTML;
    });
    
    return cleanedContent;
  }
  
  // Inline diff helper functions
  /**
   * Add event listeners to inline diff elements
   * @param {string} commentId - The comment ID
   * @param {string} documentId - The document ID to scope the search (optional)
   * @param {boolean} forceReattach - Force reattachment even if attribute says listener exists (for restoration)
   */
  function addInlineDiffEventListeners(commentId, documentId = null, forceReattach = false) {
    // If documentId is provided, search within that document container
    // Otherwise, fall back to global search for backwards compatibility
    let searchScope = document;
    if (documentId) {
      const container = document.getElementById(`document-${documentId}`);
      if (container) {
        searchScope = container;
      }
    }
    
    const diffElements = searchScope.querySelectorAll(`[data-comment-id="${commentId}"]`);
    
    diffElements.forEach(element => {
      if (!element.hasAttribute('data-diff-listener-attached') || forceReattach) {
        element.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Show inline diff actions, passing the documentId for context
          showInlineDiffActions(commentId, element, documentId);
        });
        element.setAttribute('data-diff-listener-attached', 'true');
      }
    });
  }
  
  // Export the function for use in document manager
  
  /**
   * Show inline diff actions (accept/reject) near the clicked element
   * @param {string} commentId - The comment ID
   * @param {Element} element - The clicked diff element
   * @param {string} documentId - The document ID for context (optional)
   */
  function showInlineDiffActions(commentId, element, documentId = null) {
    // Remove any existing action popup
    const existingPopup = document.querySelector('.inline-diff-actions');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    // Create action popup
    const popup = document.createElement('div');
    popup.className = 'inline-diff-actions';
    // Pass documentId to the global functions
    popup.innerHTML = `
      <button class="diff-action-btn accept" onclick="acceptInlineDiff('${commentId}', '${documentId || ''}')">✅ Accept</button>
      <button class="diff-action-btn reject" onclick="rejectInlineDiff('${commentId}', '${documentId || ''}')">❌ Reject</button>
    `;
    
    // Position popup near the element
    const rect = element.getBoundingClientRect();
    popup.style.position = 'absolute';
    popup.style.top = `${rect.bottom + 5}px`;
    popup.style.left = `${rect.left}px`;
    popup.style.zIndex = '1000';
    
    document.body.appendChild(popup);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (popup.parentNode) {
        popup.remove();
      }
    }, 3000);
  }
  
  /**
   * Accept an inline diff change
   * @param {string} commentId - The comment ID
   * @param {string} documentId - The document ID (optional)
   */
  window.acceptInlineDiff = async function(commentId, documentId = null) {
    try {
      const diffData = window.currentInlineDiffs && window.currentInlineDiffs[commentId];
      
      console.log('Accepting inline diff:', commentId, documentId);
      console.log('diffData:', diffData);
      // Get the target element - try to find where the diff actually exists
      let targetElement;
      if (documentId && documentId !== '') {
        const container = document.getElementById(`document-${documentId}`);
        // Try to find the element with the actual diff first
        const templateDiff = container?.querySelector(`.template-editor [data-comment-id="${commentId}"]`);
        const previewDiff = container?.querySelector(`.preview-content [data-comment-id="${commentId}"]`);
        const sourceDiff = container?.querySelector(`.source-editor [data-comment-id="${commentId}"]`);
        
        if (templateDiff) {
          targetElement = container?.querySelector('.template-editor');
        } else if (previewDiff) {
          targetElement = container?.querySelector('.preview-content');
        } else if (sourceDiff) {
          targetElement = container?.querySelector('.source-editor');
        } else {
          targetElement = container?.querySelector('.template-editor'); // fallback
        }
      }
      
      if (!targetElement) {
        console.error('Target element not found for comment:', commentId);
        return;
      }
      
      // Debug: Check what we found
      console.log('Accept diff - Target element found:', targetElement);
      console.log('Accept diff - Target element type:', targetElement.tagName, targetElement.className);
      
      // Accept: Find root diff elements and replace with accepted text
      const diffElements = targetElement.querySelectorAll(`[data-comment-id="${commentId}"]`);
      console.log('Accept diff - Elements found:', diffElements.length);
      
      // Get the accepted text (from add elements)
      const addElements = targetElement.querySelectorAll(`.inline-diff-add[data-comment-id="${commentId}"]`);
      const acceptedText = Array.from(addElements).map(el => el.textContent).join('');
      console.log('Accept diff - Accepted text:', acceptedText);
      
      // Find root containers and replace with plain text
      const containers = targetElement.querySelectorAll(`.inline-diff-container[data-comment-id="${commentId}"], .inline-diff-addition[data-comment-id="${commentId}"]`);
      console.log('Accept diff - Containers found:', containers.length);
      console.log('Accept diff - Containers:', containers);
      
      if (containers.length > 0) {
        // Handle containerized diffs
        containers.forEach(container => {
          const textNode = document.createTextNode(acceptedText);
          container.parentNode.replaceChild(textNode, container);
        });
      } else {
        // Handle individual diff elements (no containers)
        console.log('No containers found, handling individual elements');
        
        // For individual elements, we need to:
        // 1. Remove delete elements (strikethrough text)  
        // 2. Replace add elements with their text content
        const deleteElements = targetElement.querySelectorAll(`.inline-diff-delete[data-comment-id="${commentId}"]`);
        const addElements = targetElement.querySelectorAll(`.inline-diff-add[data-comment-id="${commentId}"]`);
        
        console.log('Individual delete elements:', deleteElements.length);
        console.log('Individual add elements:', addElements.length);
        
        // Remove delete elements (we're accepting, so original text is removed)
        deleteElements.forEach(el => el.remove());
        
        // Replace add elements with plain text
        addElements.forEach(el => {
          const textNode = document.createTextNode(el.textContent);
          el.parentNode.replaceChild(textNode, el);
        });
      }
      
      // Remove any remaining individual diff elements  
      const remaining = targetElement.querySelectorAll(`[data-comment-id="${commentId}"]`);
      console.log('Remaining elements to clean up:', remaining.length);
      remaining.forEach(el => el.remove());
      
      // For preview content, verify the change was applied correctly
      if (targetElement.classList.contains('preview-content')) {
        console.log('Preview content after diff application:', targetElement.innerHTML.substring(0, 200) + '...');
      }
      
      // Clean up
      if (window.currentInlineDiffs) {
        delete window.currentInlineDiffs[commentId];
      }
      removeInlineDiffActions();
      
      // Remove the comment/annotation
      const annotation = document.getElementById(commentId);
      if (annotation) {
        annotation.remove();
      }
      
      // Extra cleanup: Remove any stray action popups
      const strayPopups = document.querySelectorAll('.inline-diff-actions');
      strayPopups.forEach(popup => popup.remove());
      
      // Import state to clean up comments
      const { state } = await import('./state.js');
      delete state.comments[commentId];
      
      // Import addMessageToUI
      const { addMessageToUI } = await import('./chat.js');
      addMessageToUI('system', '✅ Change accepted and applied.');
      
      // Debug: Log what type of element we're working with
      console.log('Accept diff - Target element classes:', targetElement.className);
      console.log('Accept diff - Is template editor:', targetElement.classList.contains('template-editor'));
      console.log('Accept diff - Is preview content:', targetElement.classList.contains('preview-content'));
      
      // Trigger auto-save and template execution ONLY if it's template content
      if (targetElement.classList.contains('template-editor')) {
        console.log('Template content changed - triggering auto-save and execution');
        if (window.documentManager) {
          window.documentManager.onContentChange();
        }
        
        // Execute template to see results
        const executeTemplate = async () => {
          try {
            const { executeTemplate: execTemplate } = await import('./template-execution.js');
            execTemplate(false, true);
          } catch (error) {
            console.warn('Could not auto-execute template:', error);
          }
        };
        executeTemplate();
      } else {
        console.log('Non-template content changed - skipping template execution');
        // For preview/source content, we still want to trigger save but not template execution
        if (window.documentManager && targetElement.classList.contains('preview-content')) {
          console.log('Preview content changed - triggering preview save only');
          // Don't call onContentChange as it might trigger template execution
          // Just save the current state
          window.documentManager.saveCurrentState?.();
        }
      }
      
    } catch (error) {
      console.error('Error accepting inline diff:', error);
      // Import addMessageToUI dynamically
      try {
        const { addMessageToUI } = await import('./chat.js');
        addMessageToUI('system', `❌ Failed to accept change: ${error.message}`);
      } catch (importError) {
        console.error('Failed to import addMessageToUI:', importError);
      }
    }
  };
  
  /**
   * Reject an inline diff change
   * @param {string} commentId - The comment ID
   * @param {string} documentId - The document ID (optional)
   */
  window.rejectInlineDiff = async function(commentId, documentId = null) {
    try {
      const diffData = window.currentInlineDiffs && window.currentInlineDiffs[commentId];
      
      // Get the target element - try to find where the diff actually exists
      let targetElement;
      if (documentId && documentId !== '') {
        const container = document.getElementById(`document-${documentId}`);
        // Try to find the element with the actual diff first
        const templateDiff = container?.querySelector(`.template-editor [data-comment-id="${commentId}"]`);
        const previewDiff = container?.querySelector(`.preview-content [data-comment-id="${commentId}"]`);
        const sourceDiff = container?.querySelector(`.source-editor [data-comment-id="${commentId}"]`);
        
        if (templateDiff) {
          targetElement = container?.querySelector('.template-editor');
        } else if (previewDiff) {
          targetElement = container?.querySelector('.preview-content');
        } else if (sourceDiff) {
          targetElement = container?.querySelector('.source-editor');
        } else {
          targetElement = container?.querySelector('.template-editor'); // fallback
        }
      }
      
      if (!targetElement) {
        console.error('Target element not found for comment:', commentId);
        return;
      }
      
      // Debug: Check what we found
      console.log('Reject diff - Target element found:', targetElement);
      console.log('Reject diff - Target element type:', targetElement.tagName, targetElement.className);
      
      // Reject: Find root diff elements and restore original text
      const diffElements = targetElement.querySelectorAll(`[data-comment-id="${commentId}"]`);
      console.log('Reject diff - Elements found:', diffElements.length);
      
      // Get the original text (from delete elements)
      const deleteElements = targetElement.querySelectorAll(`.inline-diff-delete[data-comment-id="${commentId}"]`);
      const originalText = Array.from(deleteElements).map(el => el.textContent).join('');
      console.log('Reject diff - Original text:', originalText);
      
      // Find root containers and replace with original text
      const containers = targetElement.querySelectorAll(`.inline-diff-container[data-comment-id="${commentId}"], .inline-diff-addition[data-comment-id="${commentId}"]`);
      console.log('Reject diff - Containers found:', containers.length);
      
      if (containers.length > 0) {
        // Handle containerized diffs
        containers.forEach(container => {
          const textNode = document.createTextNode(originalText);
          container.parentNode.replaceChild(textNode, container);
        });
      } else {
        // Handle individual diff elements (no containers)
        console.log('No containers found, handling individual elements');
        
        // For individual elements, we need to:
        // 1. Replace delete elements with their text content (restore original)
        // 2. Remove add elements (we're rejecting the addition)
        const deleteElements = targetElement.querySelectorAll(`.inline-diff-delete[data-comment-id="${commentId}"]`);
        const addElements = targetElement.querySelectorAll(`.inline-diff-add[data-comment-id="${commentId}"]`);
        
        console.log('Individual delete elements:', deleteElements.length);
        console.log('Individual add elements:', addElements.length);
        
        // Replace delete elements with plain text (restore original)
        deleteElements.forEach(el => {
          const textNode = document.createTextNode(el.textContent);
          el.parentNode.replaceChild(textNode, el);
        });
        
        // Remove add elements (we're rejecting, so additions are removed)
        addElements.forEach(el => el.remove());
      }
      
      // Remove any remaining individual diff elements
      const remaining = targetElement.querySelectorAll(`[data-comment-id="${commentId}"]`);
      console.log('Remaining elements to clean up:', remaining.length);
      remaining.forEach(el => el.remove());
      
      // For preview content, verify the change was applied correctly
      if (targetElement.classList.contains('preview-content')) {
        console.log('Preview content after diff rejection:', targetElement.innerHTML.substring(0, 200) + '...');
      }
      
      // Clean up
      if (window.currentInlineDiffs) {
        delete window.currentInlineDiffs[commentId];
      }
      removeInlineDiffActions();
      
      // Remove the comment/annotation
      const annotation = document.getElementById(commentId);
      if (annotation) {
        annotation.remove();
      }
      
      // Extra cleanup: Remove any stray action popups
      const strayPopups = document.querySelectorAll('.inline-diff-actions');
      strayPopups.forEach(popup => popup.remove());
      
      // Import state to clean up comments
      const { state } = await import('./state.js');
      delete state.comments[commentId];
      
      // Import addMessageToUI
      const { addMessageToUI } = await import('./chat.js');
      addMessageToUI('system', '🚫 Change rejected and removed.');
      
      // Debug: Log what type of element we're working with
      console.log('Reject diff - Target element classes:', targetElement.className);
      console.log('Reject diff - Is template editor:', targetElement.classList.contains('template-editor'));
      console.log('Reject diff - Is preview content:', targetElement.classList.contains('preview-content'));
      
    } catch (error) {
      console.error('Error rejecting inline diff:', error);
      // Import addMessageToUI dynamically
      try {
        const { addMessageToUI } = await import('./chat.js');
        addMessageToUI('system', `❌ Failed to reject change: ${error.message}`);
      } catch (importError) {
        console.error('Failed to import addMessageToUI:', importError);
      }
    }
  };
  
  /**
   * Remove inline diff action popup
   */
  function removeInlineDiffActions() {
    const popup = document.querySelector('.inline-diff-actions');
    if (popup) {
      popup.remove();
    }
  }