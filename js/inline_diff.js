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
/**
 * Extract clean text content from HTML, preserving line breaks
 */
function extractTextFromHtml(htmlContent) {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  
  // Replace <br> tags with newlines before extracting text
  tempDiv.innerHTML = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  
  // Get text content and clean up extra whitespace
  return tempDiv.textContent || tempDiv.innerText || '';
}

/**
 * Simple diff algorithm to find differences between two texts
 */
function computeDiff(oldHtml, newHtml) {
  // Extract clean text content from HTML
  const oldText = extractTextFromHtml(oldHtml);
  const newText = extractTextFromHtml(newHtml);
  
  console.log('Computing diff on clean text:', { 
    oldText: oldText.substring(0, 100) + '...', 
    newText: newText.substring(0, 100) + '...' 
  });
  
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const diff = [];
  let oldIndex = 0;
  let newIndex = 0;
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex >= oldLines.length) {
      // All remaining lines are additions
      diff.push({ type: 'add', content: newLines[newIndex] });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      // All remaining lines are deletions
      diff.push({ type: 'delete', content: oldLines[oldIndex] });
      oldIndex++;
    } else if (oldLines[oldIndex] === newLines[newIndex]) {
      // Lines are the same
      diff.push({ type: 'same', content: oldLines[oldIndex] });
      oldIndex++;
      newIndex++;
    } else {
      // Find the next matching line
      let foundMatch = false;
      
      // Look ahead in new lines for a match with current old line
      for (let i = newIndex + 1; i < Math.min(newIndex + 5, newLines.length); i++) {
        if (newLines[i] === oldLines[oldIndex]) {
          // Found match - mark intermediate new lines as additions
          for (let j = newIndex; j < i; j++) {
            diff.push({ type: 'add', content: newLines[j] });
          }
          diff.push({ type: 'same', content: oldLines[oldIndex] });
          newIndex = i + 1;
          oldIndex++;
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        // Look ahead in old lines for a match with current new line
        for (let i = oldIndex + 1; i < Math.min(oldIndex + 5, oldLines.length); i++) {
          if (oldLines[i] === newLines[newIndex]) {
            // Found match - mark intermediate old lines as deletions
            for (let j = oldIndex; j < i; j++) {
              diff.push({ type: 'delete', content: oldLines[j] });
            }
            diff.push({ type: 'same', content: newLines[newIndex] });
            oldIndex = i + 1;
            newIndex++;
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        // No match found nearby - treat as replace
        diff.push({ type: 'delete', content: oldLines[oldIndex] });
        diff.push({ type: 'add', content: newLines[newIndex] });
        oldIndex++;
        newIndex++;
      }
    }
  }
  
  return diff;
}

function createInlineDiff(options) {
  const { parsedSuggestion, commentId, targetElement, escapeHtml, documentId } = options;
  
  if (!targetElement) {
    console.warn('Target element not found');
    return false;
  }

  const originalContent = targetElement.innerHTML;
  const newContent = parsedSuggestion.new_text || '';
  
  console.log('Creating full content diff:', { 
    originalLength: originalContent.length, 
    newLength: newContent.length,
    explanation: parsedSuggestion.explanation 
  });
  
  // If new content is empty or same as original, no diff needed
  if (!newContent.trim() || newContent === originalContent) {
    console.log('No meaningful changes detected');
    return false;
  }
  
  // Compute the diff between original and new content
  const diff = computeDiff(originalContent, newContent);
  
  // Convert diff to HTML with inline markup (clean text display)
  let diffHtml = '';
  let hasChanges = false;
  
  for (const item of diff) {
    switch (item.type) {
      case 'same':
        // Display same lines as plain text with line breaks
        if (item.content.trim()) {
          diffHtml += `<div style="margin: 1px 0; padding: 2px;">${escapeHtml ? escapeHtml(item.content) : item.content}</div>\n`;
        }
        break;
      case 'delete':
        hasChanges = true;
        diffHtml += `<div class="inline-diff-delete" data-comment-id="${commentId}" title="Original content - click to accept/reject" style="background-color: #ffebee; text-decoration: line-through; margin: 2px 0; padding: 4px; border-left: 3px solid #f44336; font-family: monospace;">- ${escapeHtml ? escapeHtml(item.content) : item.content}</div>\n`;
        break;
      case 'add':
        hasChanges = true;
        diffHtml += `<div class="inline-diff-add" data-comment-id="${commentId}" title="AI suggestion - click to accept/reject" style="background-color: #e8f5e8; margin: 2px 0; padding: 4px; border-left: 3px solid #4caf50; font-family: monospace;">+ ${escapeHtml ? escapeHtml(item.content) : item.content}</div>\n`;
        break;
    }
  }
  
  if (!hasChanges) {
    console.log('No visual changes detected in diff');
    return false;
  }
  
  // Apply the diff content to the target element
  targetElement.innerHTML = diffHtml.trim();
  
  // Add click handlers for accept/reject
  addInlineDiffEventListeners(commentId, documentId);
  
  console.log('Created full content diff with', diff.filter(d => d.type !== 'same').length, 'changes');
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
    
    // Attach listeners to all diff elements (container and children) to ensure clickability
    // Event listeners will handle deduplication through the attached attribute
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
      console.log('Accepting full content diff:', commentId, documentId);

      // Find the target element containing the diff
      let targetElement;
      if (documentId && documentId !== '') {
        const container = document.querySelector(`#document-${documentId}.active`);
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
        }
      }
      
      if (!targetElement) {
        console.error('Target element not found for comment:', commentId);
        return;
      }
      
      // Get the AI suggestion from state to retrieve the complete new content
      const { state } = await import('./state.js');
      const comment = state.comments[commentId];
      
      if (!comment || !comment.aiSuggestion || !comment.aiSuggestion.new_text) {
        console.error('AI suggestion data not found for comment:', commentId);
        return;
      }
      
      // Apply the complete new content (removing all diff markup)
      targetElement.innerHTML = comment.aiSuggestion.new_text;
      
      // Clean up
      removeInlineDiffActions();
      
      // Remove the comment/annotation
      const annotation = document.getElementById(commentId);
      if (annotation) {
        annotation.remove();
      }
      
      // Remove from state
      delete state.comments[commentId];
      
      // Import addMessageToUI
      const { addMessageToUI } = await import('./chat.js');
      addMessageToUI('system', '✅ AI suggestion accepted and applied to entire content.');
      
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
            await execTemplate(false, true);
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
        console.log('Looking for container with ID:', `document-${documentId}`);
        const container = document.querySelector(`#document-${documentId}.active`);
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
        console.log('Available elements with comment ID:', document.querySelectorAll(`[data-comment-id="${commentId}"]`));
        console.log('Available containers:', document.querySelectorAll('[id^="document-"]'));
        return;
      }
      
      // Debug: Check what we found
      console.log('Reject diff - Target element found:', targetElement);
      console.log('Reject diff - Target element type:', targetElement.tagName, targetElement.className);
      
      // Get the original text (from delete elements)
      const deleteElements = targetElement.querySelectorAll(`.inline-diff-delete[data-comment-id="${commentId}"]`);
      const originalText = Array.from(deleteElements).map(el => el.textContent).join('');
      console.log('Reject diff - Original text:', originalText);
      
      // Find root containers and replace with original text
      const containers = targetElement.querySelectorAll(`.inline-diff-container[data-comment-id="${commentId}"]`);
      console.log('Reject diff - Containers found:', containers.length);
      
      containers.forEach(container => {
        const textNode = document.createTextNode(originalText);
        container.parentNode.replaceChild(textNode, container);
      });
      
      // Clean up any remaining diff elements (should be none since we use containers consistently)
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