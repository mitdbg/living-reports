// Comment Translation Module
// Handles translating user comments into template edit suggestions

import { state, elements } from './state.js';
import { addMessageToUI, addWaitingIndicator, removeWaitingIndicator } from './chat.js';
import { getCurrentUser } from './auth.js';
import { createInlineDiff, findConflictingDiffs, removeConflictingInlineDiffs, addInlineDiffEventListeners } from './inline_diff.js';

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
export async function createTemplateEditSuggestionComment(originalComment, selectedText, suggestion, mode, show_floating_annotation = true) {
  try {
    const { incrementCommentCounter } = await import('./state.js');
    const currentUser = getCurrentUser();
    const commentId = `template-suggestion-${incrementCommentCounter()}`;
    
    // Create simplified comment data with inline diff metadata
    const commentData = {
      id: commentId,
      selectedText: selectedText,
      commentMessage: `🎯 ${originalComment}\n🤖 ${suggestion.explanation}`,
      mode: "template",
      author: currentUser ? currentUser.id : 'anonymous',
      authorName: currentUser ? currentUser.name : 'Anonymous',
      authorEmoji: '🔄',
      authorColor: '#8b5cf6',
      createdAt: new Date().toISOString(),
      isResolved: false,
      isActive: true,
      isAISuggestion: true,
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

    // Create inline diff in template editor
    await showTemplateEditorDiffForSuggestion(suggestion, commentData);
    
    // Create floating annotation window for the template suggestion
    if (show_floating_annotation) {
      // Store in comments state
      state.comments[commentId] = commentData;

      const { createTemplateSuggestionAnnotation } = await import('./annotations.js');
      createTemplateSuggestionAnnotation(commentData);
      // Trigger auto-save
      if (window.documentManager) {
        window.documentManager.onCommentChange();
      }
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
    
    console.log('Template editor found:', templateEditor);
    console.log('+++++++++++suggestion:', suggestion);

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
    
    // Import the createInlineDiff helper function
    const { createInlineDiff } = await import('./inline_diff.js');
    
    // Use the standardized createInlineDiff helper function
    const diffSuccess = createInlineDiff({
      targetElement: templateEditor,
      commentId: commentData.id,
      selectedText: originalText, // Use original text as selected text
      parsedSuggestion: {
        original_text: originalText,
        new_text: newText,
        suggested_change: newText,
        change_type: changeType
      },
      documentId: activeDocumentId
    });
    
    if (!diffSuccess) {
      console.warn('Failed to create inline diff');
      addMessageToUI('system', `⚠️ Could not create inline diff for suggestion. Please check manually.`);
      return;
    }
    
    console.log(`Applied inline ${changeType} diff using helper function`);
    
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
      originalContent: templateEditor.innerHTML, // Store the content after applying this diff
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
 * Parse structured LLM response for precise inline diff creation
 * @param {Object|string} suggestion - LLM suggestion response
 * @param {string} templateContent - Full template content for validation
 * @param {Object} variableInfo - Variable context information
 * @returns {Object|null} Parsed suggestion or null if parsing failed
 */
export function parseStructuredLLMResponse(suggestion, templateContent, variableInfo) {
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
  console.log('Starting comment translation for:', { selectedText: selectedText.substring(0, 50), commentText, mode });
  
  try {
    // Get translation suggestion from LLM
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
      
      let successMessage = `✅ Created template suggestion with ${confidencePercent}% confidence.`;
      successMessage += ` Change: ${suggestion.change_type} | Target: "${suggestion.original_text.substring(0, 50)}${suggestion.original_text.length > 50 ? '...' : ''}"`;
      
      addMessageToUI('system', successMessage);
      
    } else {
      // Fallback: If LLM translation fails, create a simple AI suggestion using sendToBackend
      console.log('LLM translation failed, falling back to simple template suggestion');
      
      const { sendToBackend } = await import('./template-execution.js');
      const message = `Preview Comment Context: "${selectedText}"\n\nUser Comment: "${commentText}"\n\nBased on this preview content and user comment, please suggest template improvements.`;
      
      addMessageToUI('system', '🔄 Generating AI template suggestions based on preview comment...');
      await sendToBackend(message, true);
    }
    
  } catch (error) {
    console.error('Error in askAIWithCommentTranslation:', error);
    addMessageToUI('system', `❌ Failed to analyze comment for template changes: ${error.message}`);
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