// Comment Translation Module
// Handles translating user comments into template edit suggestions

import { state, elements } from './state.js';
import { addMessageToUI, addWaitingIndicator, removeWaitingIndicator } from './chat.js';
import { getCurrentUser } from './auth.js';

/**
 * Translate a user comment into a template edit suggestion
 * @param {string} commentText - The user's comment text
 * @param {string} selectedText - The text the user selected when commenting
 * @param {string} mode - The mode where the comment was made ('preview', 'template', 'source')
 * @returns {Promise<Object>} The translation suggestion
 */
export async function translateCommentToTemplateEdit(commentText, selectedText, mode = 'preview') {
  try {
    // Get current document context
    const documentContext = await getCurrentDocumentContext();
    
    // Parse variable information from selected HTML
    const variableInfo = parseVariableFromSelectedText(selectedText);
    
    // Convert HTML selected text to plain text for better LLM processing
    let plainSelectedText = selectedText;
    if (/<[^>]*>/.test(selectedText)) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = selectedText;
      plainSelectedText = tempDiv.textContent || tempDiv.innerText || '';
    }
    
    // Create a structured prompt for the LLM with clear variable context
    let variableContext = '';
    if (variableInfo.isVariable) {
      variableContext = `
VARIABLE CONTEXT:
- User selected a VARIABLE: "${variableInfo.varName}" 
- Current value: "${variableInfo.currentValue}"
- Displayed as: "${plainSelectedText}"
- Template pattern: Look for $${variableInfo.varName} or {{${variableInfo.varName}}} in template
- This is instance ${variableInfo.instance} of this variable in the document
`;
    } else {
      variableContext = `
VARIABLE CONTEXT:
- User selected STATIC TEXT: "${plainSelectedText}"
- This is not a variable, it's literal text in the template
`;
    }
    
    const structuredPrompt = `
CONTEXT: The user is commenting on a document template system.

FULL TEMPLATE CONTENT:
\`\`\`
${documentContext.template_content}
\`\`\`

${variableContext}

USER COMMENT: "${commentText}"
SELECTED TEXT: "${plainSelectedText}"

TASK: Based on the user's comment, suggest a specific change to the template.

${variableInfo.isVariable ? 
`GUIDANCE: Since user selected variable "${variableInfo.varName}", consider:
1. Changing the variable reference in template (e.g., $${variableInfo.varName} → something else)
2. Adding logic around the variable (e.g., conditions, formatting)
3. Changing how the variable is used in the template text` :
`GUIDANCE: Since user selected static text, look for the exact text in template and suggest changes.`}

RESPONSE FORMAT (JSON):
{
  "change_type": "replace|add|remove",
  "original_text": "exact text in template to change",
  "new_text": "replacement text", 
  "explanation": "brief explanation",
  "confidence": 0.85,
  "variable_name": "${variableInfo.isVariable ? variableInfo.varName : null}"
}


CRITICAL REQUIREMENTS:
1. "original_text" MUST be the exact text that exists in the template, so user will know what to change
2. For variable assignments like {{var:=value}}, original_text should be the FULL assignment
3. For static text, original_text should be the literal text in template
4. "new_text" is what should replace the original_text
5. Always return valid JSON only

INSTRUCTIONS:
1. Find the exact text in template that corresponds to the selection
2. For variables: target the variable pattern ($varName or {{varName:=value}})
3. For static text: target the literal text
4. Ensure "original_text" exactly matches text in the template
5. Return ONLY the JSON object

RESPONSE:`;
    
    // Prepare request data with the structured prompt
    const requestData = {
      comment_text: structuredPrompt,
      selected_text: plainSelectedText,
      mode: mode,
      template_content: documentContext.template_content,
      preview_content: documentContext.preview_content,
      source_content: documentContext.source_content,
      variables: documentContext.variables,
      document_id: documentContext.document_id,
      session_id: documentContext.session_id,
      // Add variable context for backend processing
      variable_context: variableInfo,
      original_comment: commentText,
      original_selected_text: selectedText
    };
    
    console.log('Sending comment translation with variable context:', variableInfo);
    
    // Call backend API
    const response = await fetch('http://127.0.0.1:5000/api/translate-comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to translate comment');
    }
    
    // Parse the structured response
    let parsedSuggestion = null;
    if (result.success && result.suggestion) {
      parsedSuggestion = parseStructuredLLMResponse(result.suggestion, documentContext.template_content, variableInfo);
    }
    
    console.log('Parsed comment translation result:', parsedSuggestion);
    return {
      success: parsedSuggestion !== null,
      suggestion: parsedSuggestion,
      original_comment: commentText,
      original_selected_text: selectedText,
      variable_context: variableInfo
    };
    
  } catch (error) {
    console.error('Error translating comment:', error);
    
    return {
      success: false,
      error: error.message,
      original_comment: commentText,
      original_selected_text: selectedText,
      variable_context: parseVariableFromSelectedText(selectedText)
    };
  }
}

/**
 * Get current document context for translation
 * @returns {Object} Document context data
 */
async function getCurrentDocumentContext() {
  // Get template content
  const templateContent = elements.templateEditor ? elements.templateEditor.textContent : '';
  
  // Get preview content (strip HTML for better processing)
  let previewContent = '';
  if (elements.previewContent) {
    previewContent = elements.previewContent.innerHTML;
  }
  
  // Get source content
  const sourceContent = elements.sourceEditor ? elements.sourceEditor.textContent : '';
  
  // Get variables from current state
  const variables = state.variables || {};
  
  // Get document and session IDs
  const documentId = window.documentManager?.activeDocumentId || 'default';
  const sessionId = state.sessionId || 'default';
  
  return {
    template_content: templateContent,
    preview_content: previewContent,
    source_content: sourceContent,
    variables: variables,
    document_id: documentId,
    session_id: sessionId
  };
}

/**
 * Create a template edit suggestion comment based on user feedback
 * @param {string} originalComment - The original user comment
 * @param {string} selectedText - The selected text
 * @param {Object} suggestion - The AI-generated suggestion
 * @param {string} mode - The mode where the comment was made
 */
export async function createTemplateEditSuggestionComment(originalComment, selectedText, suggestion, mode) {
  try {
    const { incrementCommentCounter } = await import('./state.js');
    const currentUser = getCurrentUser();
    const commentId = `template-suggestion-${incrementCommentCounter()}`;
    
    // Create simplified comment data with inline diff metadata
    const commentData = {
      id: commentId,
      selectedText: selectedText,
      commentMessage: `🎯 ${originalComment}\n🤖 ${suggestion.explanation}`,
      mode: 'template',
      author: currentUser ? currentUser.id : 'anonymous',
      authorName: currentUser ? currentUser.name : 'Anonymous',
      authorEmoji: '🔄',
      authorColor: '#8b5cf6',
      createdAt: new Date().toISOString(),
      isResolved: false,
      isActive: true,
      isTemplateSuggestion: true,
      originalComment: originalComment,
      aiSuggestion: suggestion,
      confidence: suggestion.confidence,
      // Add inline diff metadata for persistence
      inlineDiffData: {
        changeType: suggestion.change_type,
        originalText: suggestion.original_text,
        newText: suggestion.suggested_change || suggestion.new_text || '',
        characterStart: suggestion.character_start,
        characterEnd: suggestion.character_end,
        lineNumber: suggestion.line_number,
        variableContext: suggestion.variable_context
      },
      ui: { position: null, element: null, isVisible: true, isDragging: false }
    };
    
    // Store in comments state
    state.comments[commentId] = commentData;
    
    // Create inline diff in template editor
    await showTemplateEditorDiffForSuggestion(suggestion, commentData);
    
    // Trigger auto-save
    if (window.documentManager) {
      window.documentManager.onCommentChange();
    }
    
    return commentData;
    
  } catch (error) {
    console.error('Error creating template suggestion comment:', error);
    throw error;
  }
}

/**
 * Show inline diff in the template editor for a suggestion
 * @param {Object} suggestion - The AI-generated suggestion with precise positioning
 * @param {Object} commentData - The comment data
 */
async function showTemplateEditorDiffForSuggestion(suggestion, commentData) {
  try {
    // Get the template editor for the active document
    let templateEditor;
    let activeDocumentId = null;
    
    if (window.documentManager?.activeDocumentId) {
      activeDocumentId = window.documentManager.activeDocumentId;
      const container = document.getElementById(`document-${activeDocumentId}`);
      templateEditor = container?.querySelector('.template-editor');
    }
    
    // Fallback to global template editor if document-specific one not found
    if (!templateEditor) {
      templateEditor = elements.templateEditor;
    }
    
    if (!templateEditor) {
      console.warn('Template editor not found');
      return;
    }
    
    // Work with the current HTML content (may contain existing diffs)
    let currentHtmlContent = templateEditor.innerHTML || '';
    const originalText = suggestion.original_text || '';
    const newText = suggestion.suggested_change || suggestion.new_text || '';
    const changeType = suggestion.change_type;
    
    console.log('Creating inline diff for suggestion:', suggestion);
    console.log('Current HTML content length:', currentHtmlContent.length);
    
    // Check for conflicts with existing diffs targeting the same text
    const conflictingDiffs = findConflictingDiffs(originalText, currentHtmlContent);
    
    // Remove conflicting diffs before applying new one
    if (conflictingDiffs.length > 0) {
      console.log(`Found ${conflictingDiffs.length} conflicting diffs, removing them...`);
      currentHtmlContent = removeConflictingInlineDiffs(currentHtmlContent, conflictingDiffs);
      
      // Clean up the conflicting diff data
      conflictingDiffs.forEach(commentId => {
        if (window.currentInlineDiffs && window.currentInlineDiffs[commentId]) {
          delete window.currentInlineDiffs[commentId];
          console.log(`Cleaned up conflicting diff data for comment: ${commentId}`);
        }
      });
    }
    
    // Apply the new diff based on change type
    let newContent = currentHtmlContent;
    
    if (changeType === 'replace') {
      // For replace: use precise original_text from LLM
      if (newContent.includes(originalText)) {
        // Create the inline diff replacement
        const inlineDiffHtml = `<span class="inline-diff-delete" data-comment-id="${commentData.id}" title="Click to accept/reject (${Math.round(suggestion.confidence * 100)}% confidence)">${originalText}</span><span class="inline-diff-add" data-comment-id="${commentData.id}" title="Click to accept/reject">${newText}</span>`;
        
        // Replace the target text in the current content
        newContent = newContent.replace(originalText, inlineDiffHtml);
        
        console.log(`Applied inline replace diff: "${originalText}" → "${newText}"`);
      } else {
        console.warn('Target text not found in current content:', originalText);
        addMessageToUI('system', `⚠️ Could not locate target text "${originalText}" in template. Please check the suggestion manually.`);
        return;
      }
      
    } else if (changeType === 'add') {
      // For add: use character position if available, otherwise append
      const additionHtml = `<span class="inline-diff-add" data-comment-id="${commentData.id}" title="Click to accept/reject">${newText}</span>`;
      
      // Get the plain text version for position calculation
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newContent;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      
      if (suggestion.character_start !== undefined) {
        // Insert at specific position (need to map from plain text position to HTML position)
        const insertPosition = Math.min(suggestion.character_start, plainText.length);
        // For now, append at the end to avoid complex HTML position mapping
        newContent = newContent + '\n' + additionHtml;
      } else {
        // Append at the end
        newContent = newContent + '\n' + additionHtml;
      }
      
      console.log(`Applied inline add diff: "${newText}"`);
      
    } else if (changeType === 'remove') {
      // For remove: show target text with strikethrough
      if (newContent.includes(originalText)) {
        const deletionHtml = `<span class="inline-diff-delete" data-comment-id="${commentData.id}" title="Click to accept/reject">${originalText}</span>`;
        
        newContent = newContent.replace(originalText, deletionHtml);
        
        console.log(`Applied inline remove diff: "${originalText}"`);
      } else {
        console.warn('Target text for removal not found in current content:', originalText);
        addMessageToUI('system', `⚠️ Could not locate text to remove "${originalText}" in template.`);
        return;
      }
    }
    
    // Update the template editor with the new content
    templateEditor.innerHTML = newContent;
    
    // Add click handlers to the diff elements for accept/reject actions
    // Pass the active document ID to scope the event listeners correctly
    addInlineDiffEventListeners(commentData.id, activeDocumentId);
    
    // Store the diff data for cleanup with precise information
    if (!window.currentInlineDiffs) {
      window.currentInlineDiffs = {};
    }
    window.currentInlineDiffs[commentData.id] = {
      suggestion: suggestion,
      commentData: commentData,
      originalText: originalText,
      newText: newText,
      changeType: changeType,
      characterStart: suggestion.character_start,
      characterEnd: suggestion.character_end,
      lineNumber: suggestion.line_number
    };
    
    // CRITICAL: Also save this state to the comment data for persistence
    commentData.inlineDiffState = {
      isActive: true,
      appliedHtml: templateEditor.innerHTML,
      originalContent: newContent, // Store the content after applying this diff
      originalText: originalText,
      newText: newText,
      changeType: changeType
    };
    
    // Update the state to trigger persistence
    state.comments[commentData.id] = commentData;
    
    // Show success message with confidence level
    const confidenceLevel = suggestion.confidence > 0.8 ? 'High' : 
                           suggestion.confidence > 0.6 ? 'Medium' : 'Low';
    
    const existingDiffCount = Object.keys(window.currentInlineDiffs || {}).length;
    addMessageToUI('system', `✨ Inline diff created with ${confidenceLevel} confidence (${Math.round(suggestion.confidence * 100)}%). ${existingDiffCount > 1 ? `Total active diffs: ${existingDiffCount}` : ''} Click highlighted text to accept or reject.`);
    
  } catch (error) {
    console.error('Error showing inline template diff:', error);
    addMessageToUI('system', `❌ Failed to show inline diff: ${error.message}`);
  }
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
export { addInlineDiffEventListeners };

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
  }, 5000);
}

/**
 * Accept an inline diff change
 * @param {string} commentId - The comment ID
 * @param {string} documentId - The document ID (optional)
 */
window.acceptInlineDiff = async function(commentId, documentId = null) {
  try {
    const diffData = window.currentInlineDiffs[commentId];
    if (!diffData) {
      console.warn('No diff data found for comment:', commentId);
      return;
    }
    
    // Get the correct template editor for the specific document
    let templateEditor;
    if (documentId && documentId !== '') {
      const container = document.getElementById(`document-${documentId}`);
      templateEditor = container?.querySelector('.template-editor');
    } else if (window.documentManager?.activeDocumentId) {
      // Fall back to active document
      const container = document.getElementById(`document-${window.documentManager.activeDocumentId}`);
      templateEditor = container?.querySelector('.template-editor');
    } else {
      // Final fallback to global elements
      const { elements } = await import('./state.js');
      templateEditor = elements.templateEditor;
    }
    
    if (!templateEditor) {
      console.error('Template editor not found for document:', documentId);
      return;
    }
    
    // Remove diff styling and apply the changes
    const deleteElements = templateEditor.querySelectorAll(`.inline-diff-delete[data-comment-id="${commentId}"]`);
    const addElements = templateEditor.querySelectorAll(`.inline-diff-add[data-comment-id="${commentId}"]`);
    
    // Remove delete elements (they represent text to be removed)
    deleteElements.forEach(el => {
      el.remove();
    });
    
    // Convert add elements to plain text (they represent text to be kept)
    addElements.forEach(el => {
      const textNode = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(textNode, el);
    });
    
    // Clean up
    delete window.currentInlineDiffs[commentId];
    removeInlineDiffActions();
    
    // Remove the comment/annotation
    const annotation = document.getElementById(commentId);
    if (annotation) {
      annotation.remove();
    }
    
    // Import state to clean up comments
    const { state } = await import('./state.js');
    delete state.comments[commentId];
    
    // Import addMessageToUI
    const { addMessageToUI } = await import('./chat.js');
    addMessageToUI('system', '✅ Template change accepted and applied.');
    
    // Trigger auto-save and template execution
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
    const diffData = window.currentInlineDiffs[commentId];
    if (!diffData) {
      console.warn('No diff data found for comment:', commentId);
      return;
    }
    
    // Get the correct template editor for the specific document
    let templateEditor;
    if (documentId && documentId !== '') {
      const container = document.getElementById(`document-${documentId}`);
      templateEditor = container?.querySelector('.template-editor');
    } else if (window.documentManager?.activeDocumentId) {
      // Fall back to active document
      const container = document.getElementById(`document-${window.documentManager.activeDocumentId}`);
      templateEditor = container?.querySelector('.template-editor');
    } else {
      // Final fallback to global elements
      const { elements } = await import('./state.js');
      templateEditor = elements.templateEditor;
    }
    
    if (!templateEditor) {
      console.error('Template editor not found for document:', documentId);
      return;
    }
    
    // Remove all diff elements and restore original content
    const diffElements = templateEditor.querySelectorAll(`[data-comment-id="${commentId}"]`);
    
    diffElements.forEach(el => {
      if (el.classList.contains('inline-diff-delete')) {
        // For delete elements, convert back to plain text (restore original)
        const textNode = document.createTextNode(el.textContent);
        el.parentNode.replaceChild(textNode, el);
      } else if (el.classList.contains('inline-diff-add')) {
        // For add elements, remove them (they were proposed additions)
        el.remove();
      }
    });
    
    // Clean up
    delete window.currentInlineDiffs[commentId];
    removeInlineDiffActions();
    
    // Remove the comment/annotation
    const annotation = document.getElementById(commentId);
    if (annotation) {
      annotation.remove();
    }
    
    // Import state to clean up comments
    const { state } = await import('./state.js');
    delete state.comments[commentId];
    
    // Import addMessageToUI
    const { addMessageToUI } = await import('./chat.js');
    addMessageToUI('system', '🚫 Template change rejected and removed.');
    
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

/**
 * Parse structured LLM response for precise inline diff creation
 * @param {Object|string} suggestion - LLM suggestion response
 * @param {string} templateContent - Full template content for validation
 * @param {Object} variableInfo - Variable context information
 * @returns {Object|null} Parsed suggestion or null if parsing failed
 */
function parseStructuredLLMResponse(suggestion, templateContent, variableInfo) {
  try {
    let parsedSuggestion;
    
    // Handle string response (JSON)
    if (typeof suggestion === 'string') {
      // Log the raw response for debugging
      console.log('Raw LLM response:', suggestion);
      
      // Try to extract JSON from the response
      const jsonMatch = suggestion.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('Extracted JSON:', jsonMatch[0]);
        parsedSuggestion = JSON.parse(jsonMatch[0]);
      } else {
        console.warn('No JSON found in LLM response');
        return null;
      }
    } else if (typeof suggestion === 'object') {
      console.log('LLM response is object:', suggestion);
      parsedSuggestion = suggestion;
    } else {
      console.warn('Invalid suggestion format');
      return null;
    }
    
    // Validate required fields
    const requiredFields = ['change_type', 'original_text', 'explanation'];
    for (const field of requiredFields) {
      if (!parsedSuggestion[field]) {
        console.warn(`Missing required field: ${field}`);
        return null;
      }
    }
    
    // Validate change_type
    if (!['replace', 'add', 'remove'].includes(parsedSuggestion.change_type)) {
      console.warn('Invalid change_type:', parsedSuggestion.change_type);
      return null;
    }
    
    // Set defaults for missing optional fields
    parsedSuggestion.confidence = parsedSuggestion.confidence || 0.7;
    parsedSuggestion.suggested_change = parsedSuggestion.suggested_change || parsedSuggestion.new_text;
    
    // Calculate character positions if not provided
    if (parsedSuggestion.original_text && !parsedSuggestion.character_start) {
      const startIndex = templateContent.indexOf(parsedSuggestion.original_text);
      if (startIndex !== -1) {
        parsedSuggestion.character_start = startIndex;
        parsedSuggestion.character_end = startIndex + parsedSuggestion.original_text.length;
        
        // Calculate line number
        const textBeforeTarget = templateContent.substring(0, startIndex);
        parsedSuggestion.line_number = (textBeforeTarget.match(/\n/g) || []).length + 1;
      }
    }
    
    // Set variable context information
    parsedSuggestion.variable_context = variableInfo;
    
    console.log('Successfully parsed structured LLM response:', parsedSuggestion);
    return parsedSuggestion;
    
  } catch (error) {
    console.error('Error parsing structured LLM response:', error);
    return null;
  }
}

/**
 * Parse variable information from selected text
 * @param {string} selectedText - The selected text (may contain HTML with data attributes)
 * @returns {Object} Variable information
 */
function parseVariableFromSelectedText(selectedText) {
  const variableInfo = {
    isVariable: false,
    varName: null,
    currentValue: null,
    instance: null
  };

  // Check if selected text contains variable HTML with data attributes
  if (selectedText.includes('class="var-ref"')) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectedText;
    const varSpan = tempDiv.querySelector('.var-ref');
    
    if (varSpan) {
      variableInfo.isVariable = true;
      variableInfo.varName = varSpan.getAttribute('data-var');
      variableInfo.currentValue = varSpan.getAttribute('data-value');
      variableInfo.instance = varSpan.getAttribute('data-instance');
      
      console.log('Parsed variable from HTML:', variableInfo);
    }
  }
  
  // If not a variable span, check for direct variable patterns in text
  if (!variableInfo.isVariable) {
    const variableMatch = selectedText.match(/\$(\w+)|\{\{(\w+)\}\}/);
    if (variableMatch) {
      variableInfo.isVariable = true;
      variableInfo.varName = variableMatch[1] || variableMatch[2];
      variableInfo.currentValue = null; // Unknown without context
      variableInfo.instance = 1;
      
      console.log('Parsed variable from pattern:', variableInfo);
    }
  }

  return variableInfo;
}

/**
 * Enhanced Ask AI function that uses comment translation
 * @param {string} selectedText - The selected text
 * @param {string} commentText - The user's comment
 * @param {string} mode - The current mode
 */
export async function askAIWithCommentTranslation(selectedText, commentText, mode = 'preview') {
  let waitingIndicatorAdded = false;
  
  try {
    addWaitingIndicator();
    waitingIndicatorAdded = true;
    
    addMessageToUI('user', `💬 Comment: "${commentText}"\n📄 Context: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"`);
    addMessageToUI('system', '🔄 Analyzing comment with full template context...');
    
    // Get translation suggestion
    const translationResult = await translateCommentToTemplateEdit(commentText, selectedText, mode);
    
    if (translationResult.success && translationResult.suggestion) {
      // Create template suggestion with inline diff
      await createTemplateEditSuggestionComment(
        translationResult.original_comment || commentText,
        translationResult.original_selected_text || selectedText,
        translationResult.suggestion,
        mode
      );
      
      // Show success message
      const suggestion = translationResult.suggestion;
      const confidencePercent = Math.round(suggestion.confidence * 100);
      const varInfo = translationResult.variable_context;
      
      let successMessage = `✅ Created template edit suggestion with ${confidencePercent}% confidence.`;
      
      if (varInfo && varInfo.isVariable) {
        successMessage += ` Variable "${varInfo.varName}" (value: ${varInfo.currentValue}) → Target: "${suggestion.original_text}"`;
      } else {
        successMessage += ` Target: "${suggestion.original_text}"`;
      }
      
      successMessage += ` | Change: ${suggestion.change_type}`;
      
      addMessageToUI('system', successMessage);
      
    } else {
      // No valid template suggestion from LLM - don't create any comment
      console.log('No valid template suggestion from LLM, skipping comment creation');
      addMessageToUI('system', '🤖 LLM could not suggest template changes for this comment.');
    }
    
  } catch (error) {
    console.error('Error in askAIWithCommentTranslation:', error);
    addMessageToUI('system', `❌ Failed to analyze comment for template changes: ${error.message}`);
    // Don't create any comment when there's an error
  } finally {
    if (waitingIndicatorAdded) {
      try {
        removeWaitingIndicator();
      } catch (indicatorError) {
        console.warn('Error removing waiting indicator:', indicatorError);
      }
    }
  }
}

// Helper functions for escaping HTML and regex
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
} 