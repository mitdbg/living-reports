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
      mode: 'template', // Always create template suggestions in template mode
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
    
    // Template suggestions should NOT add highlighting to preview content
    // They should only create annotations visible in template mode
    
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
    
    // Get current template content
    const currentTemplate = elements.templateEditor.textContent;
    
    // Show diff view instead of directly applying changes
    await showTemplateEditorDiff(suggestion, currentTemplate);
    
    // Show success message
    addMessageToUI('system', `📝 Template diff view showing suggested ${suggestion.change_type} changes. Review and choose to accept or reject.`);
    
  } catch (error) {
    console.error('Error showing template suggestion:', error);
    addMessageToUI('system', `❌ Failed to show suggestion: ${error.message}`);
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

/**
 * Show diff view in template editor for a suggestion
 * @param {Object} suggestion - The AI-generated suggestion
 * @param {string} currentTemplate - Current template content
 */
async function showTemplateEditorDiff(suggestion, currentTemplate) {
  try {
    // Calculate what the new template would look like
    let newTemplate = currentTemplate;
    const changeType = suggestion.change_type;
    
    if (changeType === 'replace') {
      // For replace, find and replace the selected text with the suggestion
      const comment = state.comments[Object.keys(state.comments).find(id => 
        state.comments[id].aiSuggestion === suggestion
      )];
      if (comment) {
        newTemplate = currentTemplate.replace(comment.selectedText, suggestion.suggested_change);
      }
    } else if (changeType === 'add') {
      // For add, insert the suggestion
      newTemplate = currentTemplate + '\n' + suggestion.suggested_change;
    } else if (changeType === 'remove') {
      // For remove, remove the suggested content
      newTemplate = currentTemplate.replace(suggestion.suggested_change, '');
    }
    
    // Call the diff API to get structured diff data
    const response = await fetch('http://127.0.0.1:5000/api/compute-diff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_text: currentTemplate,
        suggested_text: newTemplate,
        session_id: state.sessionId || 'default',
        content_type: 'template'
      })
    });
    
    const diffResult = await response.json();
    
    if (diffResult.success) {
      // Show diff view in template editor
      showInlineTemplateDiff(diffResult);
      addMessageToUI('system', '📝 Template diff view activated. Review changes and choose to accept or reject.');
    } else {
      throw new Error(diffResult.error || 'Failed to compute diff');
    }
    
  } catch (error) {
    console.error('Error showing template diff:', error);
    addMessageToUI('system', `❌ Failed to show diff view: ${error.message}`);
  }
}

/**
 * Show inline diff in the template editor
 * @param {Object} diffResult - Diff computation result from backend
 */
function showInlineTemplateDiff(diffResult) {
  const templateEditor = elements.templateEditor;
  if (!templateEditor) return;
  
  // Create inline diff content directly in the template editor
  const diffHtml = generateInlineDiffContent(diffResult.template_diffs, diffResult.current_template, diffResult.suggested_template);
  
  // Add diff controls above the editor
  const diffControls = document.createElement('div');
  diffControls.className = 'inline-diff-controls';
  diffControls.innerHTML = `
    <div class="diff-header">
      <span class="diff-title">📝 Template Changes Preview</span>
      <div class="diff-actions">
        <button class="diff-action-btn accept-all" onclick="acceptTemplateDiff()">✅ Accept</button>
        <button class="diff-action-btn reject-all" onclick="rejectTemplateDiff()">❌ Reject</button>
        <button class="diff-action-btn close-diff" onclick="closeTemplateDiff()">✖️ Close</button>
      </div>
    </div>
  `;
  
  // Insert diff controls before template editor
  templateEditor.parentNode.insertBefore(diffControls, templateEditor);
  
  // Replace template editor content with inline diff
  templateEditor.innerHTML = diffHtml;
  templateEditor.classList.add('template-diff-mode');
  
  // Make template editor read-only during diff view
  templateEditor.contentEditable = false;
  
  // Store diff data for accept/reject actions
  window.currentTemplateDiff = diffResult;
}

/**
 * Generate inline diff content that shows changes within the template editor
 * @param {Array} diffs - Array of diff objects
 * @param {string} currentTemplate - Current template text
 * @param {string} suggestedTemplate - Suggested template text
 */
function generateInlineDiffContent(diffs, currentTemplate, suggestedTemplate) {
  const currentLines = currentTemplate.split('\n');
  const suggestedLines = suggestedTemplate.split('\n');
  const maxLines = Math.max(currentLines.length, suggestedLines.length);
  
  let html = '';
  
  for (let i = 0; i < maxLines; i++) {
    const currentLine = currentLines[i] || '';
    const suggestedLine = suggestedLines[i] || '';
    
    // Find if this line has changes
    const diff = diffs.find(d => d.line_index === i);
    
    if (diff) {
      if (diff.change_type === 'modified') {
        html += `<div class="diff-line-container">`;
        html += `<div class="diff-line diff-removed">- ${escapeHtml(diff.current_line)}</div>`;
        html += `<div class="diff-line diff-added">+ ${escapeHtml(diff.suggested_line)}</div>`;
        html += `</div>`;
      } else if (diff.change_type === 'added') {
        html += `<div class="diff-line diff-added">+ ${escapeHtml(diff.suggested_line)}</div>`;
      } else if (diff.change_type === 'removed') {
        html += `<div class="diff-line diff-removed">- ${escapeHtml(diff.current_line)}</div>`;
      }
    } else {
      // Unchanged line
      html += `<div class="diff-line diff-unchanged">${escapeHtml(currentLine)}</div>`;
    }
    
    // Add line break except for last line
    if (i < maxLines - 1) {
      html += '\n';
    }
  }
  
  return html;
}

// Helper function for escaping HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions globally accessible
window.applyTemplateSuggestion = applyTemplateSuggestion;
window.rejectTemplateSuggestion = rejectTemplateSuggestion;

// Global functions for template diff view actions
window.acceptTemplateDiff = async function() {
  try {
    if (!window.currentTemplateDiff) {
      throw new Error('No template diff data available');
    }
    
    // Apply the suggested template
    elements.templateEditor.textContent = window.currentTemplateDiff.suggested_template;
    
    // Close diff view
    closeTemplateDiff();
    
    // Execute template to see results
    const { executeTemplate } = await import('./template-execution.js');
    executeTemplate(false, true);
    
    // Show success message
    addMessageToUI('system', '✅ Template changes accepted and applied!');
    
    // Trigger auto-save
    if (window.documentManager) {
      window.documentManager.onCommentChange();
    }
    
  } catch (error) {
    console.error('Error accepting template diff:', error);
    addMessageToUI('system', `❌ Failed to accept changes: ${error.message}`);
  }
};

window.rejectTemplateDiff = function() {
  try {
    // Close diff view without applying changes
    closeTemplateDiff();
    
    // Show feedback message
    addMessageToUI('system', '🚫 Template changes rejected. Original template preserved.');
    
  } catch (error) {
    console.error('Error rejecting template diff:', error);
    addMessageToUI('system', `❌ Failed to reject changes: ${error.message}`);
  }
};

window.closeTemplateDiff = function() {
  try {
    // Remove diff controls
    const diffControls = document.querySelector('.inline-diff-controls');
    if (diffControls) {
      diffControls.remove();
    }
    
    // Restore original template editor
    if (elements.templateEditor && window.currentTemplateDiff) {
      // Restore original content
      elements.templateEditor.textContent = window.currentTemplateDiff.current_template;
      
      // Remove diff mode class
      elements.templateEditor.classList.remove('template-diff-mode');
      
      // Make template editor editable again
      elements.templateEditor.contentEditable = true;
    }
    
    // Clear stored diff data
    window.currentTemplateDiff = null;
    
  } catch (error) {
    console.error('Error closing template diff:', error);
  }
}; 