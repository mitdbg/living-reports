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
    
    // Prepare request data
    const requestData = {
      comment_text: commentText,
      selected_text: selectedText,
      mode: mode,
      template_content: documentContext.template_content,
      preview_content: documentContext.preview_content,
      source_content: documentContext.source_content,
      variables: documentContext.variables,
      document_id: documentContext.document_id,
      session_id: documentContext.session_id
    };
    
    console.log('Sending comment translation request:', requestData);
    
    // Call backend API
    const response = await fetch('http://localhost:5000/api/translate-comment', {
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
    
    console.log('Comment translation result:', result);
    return result;
    
  } catch (error) {
    console.error('Error translating comment:', error);
    throw error;
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
    // Import required modules
    const { createTextComment } = await import('./comments.js');
    const { incrementCommentCounter } = await import('./state.js');
    
    // Get current user
    const currentUser = getCurrentUser();
    
    // Create a compound comment that includes:
    // 1. Original user comment
    // 2. AI suggested template change
    // 3. Explanation
    
    const suggestionCommentText = `
🎯 **Original Comment:** "${originalComment}"

🤖 **AI Analysis:** ${suggestion.explanation}

💡 **Suggested Template Change:**
\`\`\`
${suggestion.suggested_change}
\`\`\`

📍 **Target Location:** ${suggestion.target_location || 'See highlighted area'}

🎲 **Confidence:** ${Math.round(suggestion.confidence * 100)}%

**Change Type:** ${suggestion.change_type}
    `.trim();
    
    // Create a special comment ID for template suggestions
    const commentId = `template-suggestion-${incrementCommentCounter()}`;
    
    // Create comment data
    const commentData = {
      id: commentId,
      selectedText: selectedText,
      commentMessage: suggestionCommentText,
      mode: mode,
      author: currentUser ? currentUser.id : 'anonymous',
      authorName: currentUser ? currentUser.name : 'Anonymous',
      authorEmoji: '🔄', // Special emoji for template suggestions
      authorColor: '#8b5cf6', // Purple color for suggestions
      createdAt: new Date().toISOString(),
      isResolved: false,
      isActive: true,
      
      // Special template suggestion properties
      isTemplateSuggestion: true,
      originalComment: originalComment,
      aiSuggestion: suggestion,
      suggestedChange: suggestion.suggested_change,
      changeType: suggestion.change_type,
      confidence: suggestion.confidence,
      
      ui: {
        position: null,
        element: null,
        isVisible: true,
        isDragging: false
      }
    };
    
    // Store in comments state
    state.comments[commentId] = commentData;
    
    // Apply highlighting to the selected text
    const { createTextHighlight } = await import('./comments.js');
    createTextHighlight({
      selectedText: selectedText,
      commentId: commentId,
      mode: mode
    });
    
    // Create floating annotation
    const { createTemplateSuggestionAnnotation } = await import('./annotations.js');
    createTemplateSuggestionAnnotation(commentData);
    
    // Show feedback message
    addMessageToUI('system', `✨ Template edit suggestion created based on your comment: "${originalComment.substring(0, 50)}${originalComment.length > 50 ? '...' : ''}"`);
    
    // Trigger auto-save for comment changes
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
 * Enhanced Ask AI function that uses comment translation
 * @param {string} selectedText - The selected text
 * @param {string} commentText - The user's comment
 * @param {string} mode - The current mode
 */
export async function askAIWithCommentTranslation(selectedText, commentText, mode = 'preview') {
  let waitingIndicatorAdded = false;
  
  try {
    // Add waiting indicator
    addWaitingIndicator();
    waitingIndicatorAdded = true;
    
    // Show initial feedback
    addMessageToUI('user', `💬 Comment: "${commentText}"\n📄 Context: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"`);
    addMessageToUI('system', '🔄 Analyzing comment and generating template suggestion...');
    
    // Get translation suggestion
    const translationResult = await translateCommentToTemplateEdit(commentText, selectedText, mode);
    
    if (translationResult.success && translationResult.suggestion) {
      // Create a template suggestion comment
      await createTemplateEditSuggestionComment(
        commentText,
        selectedText,
        translationResult.suggestion,
        mode
      );
      
      // Show success message
      addMessageToUI('system', `✅ Created template edit suggestion with ${Math.round(translationResult.suggestion.confidence * 100)}% confidence. Check the highlighted area for details.`);
      
    } else {
      // Handle fallback suggestion
      const fallbackSuggestion = translationResult.fallback_suggestion;
      if (fallbackSuggestion) {
        await createTemplateEditSuggestionComment(
          commentText,
          selectedText,
          fallbackSuggestion,
          mode
        );
        
        addMessageToUI('system', '⚠️ Created basic suggestion (AI service unavailable). Review the highlighted area for manual guidance.');
      } else {
        throw new Error(translationResult.error || 'Failed to generate suggestion');
      }
    }
    
  } catch (error) {
    console.error('Error in askAIWithCommentTranslation:', error);
    addMessageToUI('system', `❌ Failed to create template suggestion: ${error.message}`);
    
    // Create a basic comment as fallback
    try {
      const { createTextComment } = await import('./comments.js');
      createTextComment(selectedText, commentText);
      addMessageToUI('system', '💡 Created regular comment instead. You can manually review and apply changes.');
    } catch (fallbackError) {
      console.error('Error creating fallback comment:', fallbackError);
    }
    
  } finally {
    // Always remove waiting indicator
    if (waitingIndicatorAdded) {
      try {
        removeWaitingIndicator();
      } catch (indicatorError) {
        console.warn('Error removing waiting indicator:', indicatorError);
      }
    }
  }
}

/**
 * Apply a template suggestion to the template editor
 * @param {string} commentId - The comment ID containing the suggestion
 */
export async function applyTemplateSuggestion(commentId) {
  try {
    const comment = state.comments[commentId];
    if (!comment || !comment.isTemplateSuggestion) {
      throw new Error('Invalid template suggestion comment');
    }
    
    const suggestion = comment.aiSuggestion;
    const changeType = suggestion.change_type;
    
    // Get current template content
    const currentTemplate = elements.templateEditor.textContent;
    
    // Apply the change based on type
    let newTemplate = currentTemplate;
    
    if (changeType === 'replace') {
      // For replace, find and replace the selected text with the suggestion
      newTemplate = currentTemplate.replace(comment.selectedText, suggestion.suggested_change);
    } else if (changeType === 'add') {
      // For add, insert the suggestion near the selected text
      const insertionPoint = currentTemplate.indexOf(comment.selectedText);
      if (insertionPoint !== -1) {
        const beforeText = currentTemplate.substring(0, insertionPoint + comment.selectedText.length);
        const afterText = currentTemplate.substring(insertionPoint + comment.selectedText.length);
        newTemplate = beforeText + '\n' + suggestion.suggested_change + afterText;
      }
    } else if (changeType === 'remove') {
      // For remove, remove the selected text
      newTemplate = currentTemplate.replace(comment.selectedText, '');
    } else {
      // For other change types, show the suggestion and let user manually apply
      addMessageToUI('system', `💡 Manual change needed: ${suggestion.suggested_change}`);
      return;
    }
    
    // Apply the new template
    elements.templateEditor.textContent = newTemplate;
    
    // Mark comment as resolved
    comment.isResolved = true;
    
    // Remove the annotation
    const annotation = document.getElementById(commentId);
    if (annotation) {
      annotation.remove();
    }
    
    // Execute template to see results
    const { executeTemplate } = await import('./template-execution.js');
    executeTemplate(false, true);
    
    // Show success message
    addMessageToUI('system', `✅ Template suggestion applied successfully! (${changeType})`);
    
    // Trigger auto-save
    if (window.documentManager) {
      window.documentManager.onCommentChange();
    }
    
  } catch (error) {
    console.error('Error applying template suggestion:', error);
    addMessageToUI('system', `❌ Failed to apply suggestion: ${error.message}`);
  }
}

/**
 * Reject a template suggestion
 * @param {string} commentId - The comment ID containing the suggestion
 */
export async function rejectTemplateSuggestion(commentId) {
  try {
    const comment = state.comments[commentId];
    if (!comment || !comment.isTemplateSuggestion) {
      throw new Error('Invalid template suggestion comment');
    }
    
    // Mark comment as resolved
    comment.isResolved = true;
    
    // Remove the annotation
    const annotation = document.getElementById(commentId);
    if (annotation) {
      annotation.remove();
    }
    
    // Remove from state
    delete state.comments[commentId];
    
    // Show feedback
    addMessageToUI('system', '🚫 Template suggestion rejected and removed.');
    
    // Trigger auto-save
    if (window.documentManager) {
      window.documentManager.onCommentChange();
    }
    
  } catch (error) {
    console.error('Error rejecting template suggestion:', error);
    addMessageToUI('system', `❌ Failed to reject suggestion: ${error.message}`);
  }
}

// Make functions globally accessible
window.applyTemplateSuggestion = applyTemplateSuggestion;
window.rejectTemplateSuggestion = rejectTemplateSuggestion; 