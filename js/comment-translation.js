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
  "target_text": "exact text in template to change",
  "new_text": "replacement text", 
  "explanation": "brief explanation",
  "confidence": 0.85,
  "variable_name": "${variableInfo.isVariable ? variableInfo.varName : null}"
}

INSTRUCTIONS:
1. Find the exact text in template that corresponds to the selection
2. For variables: target the variable pattern ($varName or {{varName}})
3. For static text: target the literal text
4. Ensure "target_text" exactly matches text in the template
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
    
    // If parsing failed, create a fallback suggestion
    if (!parsedSuggestion) {
      parsedSuggestion = createFallbackSuggestion(commentText, plainSelectedText, documentContext.template_content, variableInfo);
    }
    
    console.log('Parsed comment translation result:', parsedSuggestion);
    return {
      success: true,
      suggestion: parsedSuggestion,
      original_comment: commentText,
      original_selected_text: selectedText,
      variable_context: variableInfo
    };
    
  } catch (error) {
    console.error('Error translating comment:', error);
    
    // Return fallback suggestion on error
    const documentContext = await getCurrentDocumentContext();
    const variableInfo = parseVariableFromSelectedText(selectedText);
    let plainSelectedText = selectedText;
    if (/<[^>]*>/.test(selectedText)) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = selectedText;
      plainSelectedText = tempDiv.textContent || tempDiv.innerText || '';
    }
    
    return {
      success: false,
      error: error.message,
      fallback_suggestion: createFallbackSuggestion(commentText, plainSelectedText, documentContext.template_content, variableInfo),
      variable_context: variableInfo
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
    
    // Create simplified comment data
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
    const templateEditor = elements.templateEditor;
    if (!templateEditor) {
      console.warn('Template editor not found');
      return;
    }
    
    // Work with the template editor's textContent for precise positioning
    const templateTextContent = templateEditor.textContent || '';
    const changeType = suggestion.change_type;
    
    console.log('Creating inline diff for suggestion:', suggestion);
    console.log('Template content length:', templateTextContent.length);
    
    // Use the precise target_text from LLM response
    const targetText = suggestion.target_text || '';
    const newText = suggestion.suggested_change || suggestion.new_text || '';
    
    if (changeType === 'replace') {
      // For replace: use precise target_text from LLM
      if (templateTextContent.includes(targetText)) {
        // Create the inline diff replacement
        const inlineDiffHtml = `<span class="inline-diff-delete" data-comment-id="${commentData.id}" title="Click to accept/reject (${Math.round(suggestion.confidence * 100)}% confidence)">${targetText}</span><span class="inline-diff-add" data-comment-id="${commentData.id}" title="Click to accept/reject">${newText}</span>`;
        
        // Replace the target text directly in the template editor
        const newContent = templateTextContent.replace(targetText, inlineDiffHtml);
        templateEditor.innerHTML = newContent;
        
        console.log(`Applied inline replace diff: "${targetText}" → "${newText}"`);
      } else {
        console.warn('Target text not found in template:', targetText);
        addMessageToUI('system', `⚠️ Could not locate target text "${targetText}" in template. Please check the suggestion manually.`);
        return;
      }
      
    } else if (changeType === 'add') {
      // For add: use character position if available, otherwise append
      const additionHtml = `<span class="inline-diff-add" data-comment-id="${commentData.id}" title="Click to accept/reject">${newText}</span>`;
      
      let newContent;
      if (suggestion.character_start !== undefined) {
        // Insert at specific position
        const insertPosition = Math.min(suggestion.character_start, templateTextContent.length);
        newContent = templateTextContent.slice(0, insertPosition) + additionHtml + templateTextContent.slice(insertPosition);
      } else {
        // Append at the end
        newContent = templateTextContent + '\n' + additionHtml;
      }
      
      templateEditor.innerHTML = newContent;
      console.log(`Applied inline add diff at position ${suggestion.character_start}: "${newText}"`);
      
    } else if (changeType === 'remove') {
      // For remove: show target text with strikethrough
      if (templateTextContent.includes(targetText)) {
        const deletionHtml = `<span class="inline-diff-delete" data-comment-id="${commentData.id}" title="Click to accept/reject">${targetText}</span>`;
        
        const newContent = templateTextContent.replace(targetText, deletionHtml);
        templateEditor.innerHTML = newContent;
        
        console.log(`Applied inline remove diff: "${targetText}"`);
      } else {
        console.warn('Target text for removal not found in template:', targetText);
        addMessageToUI('system', `⚠️ Could not locate text to remove "${targetText}" in template.`);
        return;
      }
    }
    
    // Add click handlers to the diff elements for accept/reject actions
    addInlineDiffEventListeners(commentData.id);
    
    // Store the diff data for cleanup with precise information
    if (!window.currentInlineDiffs) {
      window.currentInlineDiffs = {};
    }
    window.currentInlineDiffs[commentData.id] = {
      suggestion: suggestion,
      commentData: commentData,
      originalText: targetText,
      newText: newText,
      changeType: changeType,
      characterStart: suggestion.character_start,
      characterEnd: suggestion.character_end,
      lineNumber: suggestion.line_number
    };
    
    // Show success message with confidence level
    const confidenceLevel = suggestion.confidence > 0.8 ? 'High' : 
                           suggestion.confidence > 0.6 ? 'Medium' : 'Low';
    
    addMessageToUI('system', `✨ Inline diff created with ${confidenceLevel} confidence (${Math.round(suggestion.confidence * 100)}%). Click the highlighted text to accept or reject.`);
    
  } catch (error) {
    console.error('Error showing inline template diff:', error);
    addMessageToUI('system', `❌ Failed to show inline diff: ${error.message}`);
  }
}

// Inline diff helper functions
/**
 * Add event listeners to inline diff elements
 * @param {string} commentId - The comment ID
 */
function addInlineDiffEventListeners(commentId) {
  const diffElements = document.querySelectorAll(`[data-comment-id="${commentId}"]`);
  
  diffElements.forEach(element => {
    if (!element.hasAttribute('data-diff-listener-attached')) {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Show inline diff actions
        showInlineDiffActions(commentId, element);
      });
      element.setAttribute('data-diff-listener-attached', 'true');
    }
  });
}

/**
 * Show inline diff actions (accept/reject) near the clicked element
 * @param {string} commentId - The comment ID
 * @param {Element} element - The clicked diff element
 */
function showInlineDiffActions(commentId, element) {
  // Remove any existing action popup
  const existingPopup = document.querySelector('.inline-diff-actions');
  if (existingPopup) {
    existingPopup.remove();
  }
  
  // Create action popup
  const popup = document.createElement('div');
  popup.className = 'inline-diff-actions';
  popup.innerHTML = `
    <button class="diff-action-btn accept" onclick="acceptInlineDiff('${commentId}')">✅ Accept</button>
    <button class="diff-action-btn reject" onclick="rejectInlineDiff('${commentId}')">❌ Reject</button>
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

// Global functions for inline diff actions
/**
 * Accept an inline diff change
 * @param {string} commentId - The comment ID
 */
window.acceptInlineDiff = function(commentId) {
  try {
    const diffData = window.currentInlineDiffs[commentId];
    if (!diffData) {
      console.warn('No diff data found for comment:', commentId);
      return;
    }
    
    const templateEditor = elements.templateEditor;
    
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
    delete state.comments[commentId];
    
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
    addMessageToUI('system', `❌ Failed to accept change: ${error.message}`);
  }
};

/**
 * Reject an inline diff change
 * @param {string} commentId - The comment ID
 */
window.rejectInlineDiff = function(commentId) {
  try {
    const diffData = window.currentInlineDiffs[commentId];
    if (!diffData) {
      console.warn('No diff data found for comment:', commentId);
      return;
    }
    
    const templateEditor = elements.templateEditor;
    
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
    delete state.comments[commentId];
    
    addMessageToUI('system', '🚫 Template change rejected and removed.');
    
  } catch (error) {
    console.error('Error rejecting inline diff:', error);
    addMessageToUI('system', `❌ Failed to reject change: ${error.message}`);
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
    const requiredFields = ['change_type', 'target_text', 'explanation'];
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
    
    // Validate that target_text exists in template (for replace/remove operations)
    if (['replace', 'remove'].includes(parsedSuggestion.change_type)) {
      if (!templateContent.includes(parsedSuggestion.target_text)) {
        console.warn('Target text not found in template:', parsedSuggestion.target_text);
        // Try to find similar text
        const words = parsedSuggestion.target_text.split(' ');
        const firstWord = words[0];
        if (firstWord && templateContent.includes(firstWord)) {
          // Update target_text to first word that exists
          parsedSuggestion.target_text = firstWord;
          console.log('Updated target_text to first matching word:', firstWord);
        } else {
          return null;
        }
      }
    }
    
    // Set defaults for missing optional fields
    parsedSuggestion.confidence = parsedSuggestion.confidence || 0.7;
    parsedSuggestion.suggested_change = parsedSuggestion.new_text || parsedSuggestion.target_text;
    
    // Calculate character positions if not provided
    if (parsedSuggestion.target_text && !parsedSuggestion.character_start) {
      const startIndex = templateContent.indexOf(parsedSuggestion.target_text);
      if (startIndex !== -1) {
        parsedSuggestion.character_start = startIndex;
        parsedSuggestion.character_end = startIndex + parsedSuggestion.target_text.length;
        
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
 * Create a fallback suggestion when LLM parsing fails
 * @param {string} commentText - User's comment
 * @param {string} selectedText - Selected text (plain)
 * @param {string} templateContent - Template content
 * @param {Object} variableInfo - Variable context information
 * @returns {Object} Fallback suggestion
 */
function createFallbackSuggestion(commentText, selectedText, templateContent, variableInfo) {
  // Try to find the selected text in template
  let targetText = selectedText;
  let changeType = 'replace';
  
  if (!templateContent.includes(selectedText)) {
    // Try to find similar text
    const words = selectedText.split(' ').filter(word => word.length > 2);
    let foundText = null;
    
    for (const word of words) {
      if (templateContent.includes(word)) {
        foundText = word;
        break;
      }
    }
    
    if (foundText) {
      targetText = foundText;
    } else {
      // If no match found, default to add operation
      changeType = 'add';
      targetText = '';
    }
  }
  
  // Generate a basic suggestion based on comment - make it generic for any comment
  let suggestedChange;
  const comment = commentText.toLowerCase();
  
  if (comment.includes('remove') || comment.includes('delete')) {
    changeType = 'remove';
    suggestedChange = '';
  } else if (comment.includes('add') || comment.includes('include')) {
    changeType = 'add';
    suggestedChange = `Additional content: ${commentText}`;
  } else {
    // For any other comment, create a meaningful suggestion
    changeType = 'replace';
    suggestedChange = `[${commentText}] ${selectedText}`;
  }
  
  const startIndex = targetText ? templateContent.indexOf(targetText) : templateContent.length;
  
  return {
    change_type: changeType,
    target_text: targetText,
    suggested_change: suggestedChange,
    new_text: suggestedChange,
    explanation: `Fallback suggestion based on comment: "${commentText}"`,
    confidence: 0.4, // Low confidence for fallback
    character_start: startIndex,
    character_end: startIndex + (targetText ? targetText.length : 0),
    line_number: startIndex !== -1 ? (templateContent.substring(0, startIndex).match(/\n/g) || []).length + 1 : 1,
    variable_context: variableInfo
  };
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
        successMessage += ` Variable "${varInfo.varName}" (value: ${varInfo.currentValue}) → Target: "${suggestion.target_text}"`;
      } else {
        successMessage += ` Target: "${suggestion.target_text}"`;
      }
      
      successMessage += ` | Change: ${suggestion.change_type}`;
      
      addMessageToUI('system', successMessage);
      
    } else {
      // Handle fallback
      const fallbackSuggestion = translationResult.fallback_suggestion;
      if (fallbackSuggestion) {
        await createTemplateEditSuggestionComment(commentText, selectedText, fallbackSuggestion, mode);
        addMessageToUI('system', '⚠️ Created basic suggestion (structured parsing failed). Review manually.');
      } else {
        throw new Error(translationResult.error || 'Failed to generate suggestion');
      }
    }
    
  } catch (error) {
    console.error('Error in askAIWithCommentTranslation:', error);
    addMessageToUI('system', `❌ Failed to create template suggestion: ${error.message}`);
    
    // Create basic comment as fallback
    try {
      const { createTextComment } = await import('./comments.js');
      createTextComment(selectedText, commentText);
      addMessageToUI('system', '💡 Created regular comment instead. Manual review needed.');
    } catch (fallbackError) {
      console.error('Error creating fallback comment:', fallbackError);
    }
    
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