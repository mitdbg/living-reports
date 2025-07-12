// Template Execution Module
import { state, getElements, updateState, windowId } from './state.js';
import { createDocumentElementId, createDocumentElement, registerElement } from './element-id-manager.js';
import { switchToPreview, switchToTemplate, switchToDiff, canUserSwitchModes } from './modes.js';
import { addMessageToUI } from './chat.js';
import { refreshHighlightEventListeners } from './comments.js';
import { getCurrentUser } from './auth.js';
import { getTextContentWithLineBreaks } from './utils.js';

// Store current diff data for immediate application
let currentDiffData = null;

// Create window-specific storage for initialization flags and handlers
const TEMPLATE_EXEC_KEY = `templateExec_${windowId}`;
if (!window[TEMPLATE_EXEC_KEY]) {
  window[TEMPLATE_EXEC_KEY] = {
    templateExecutionInitialized: false,
    executeHandler: null,
    currentExecuteBtn: null // Track which button currently has the listener
  };
}

const templateExecData = window[TEMPLATE_EXEC_KEY];

// Utility function to create document-specific comment IDs
function createDocumentCommentId(baseId) {
  return createDocumentElementId(`comment-${baseId}`);
}

// Utility function to create document-specific annotation IDs
function createDocumentAnnotationId(baseId) {
  return createDocumentElementId(`annotation-${baseId}`);
}

// Operators Integration - Execute required operators before template processing
async function executeRequiredOperatorsBeforeTemplate(templateText, isLiveUpdate = false, clearCache = false) {
  try {
    // Only execute operators if operators module is available
    if (!window.operatorsModule || !window.operatorsModule.executeRequiredOperatorsForTemplate) {
      return;
    }

    // Clear dependency cache if requested
    if (clearCache && window.operatorsModule.clearDependencyCache) {
      window.operatorsModule.clearDependencyCache();
    }

    // Show loading indicator for operator execution
    if (!isLiveUpdate) {
      showOperatorExecutionIndicator();
    }
    
    // Execute required operators for this template
    const result = await window.operatorsModule.executeRequiredOperatorsForTemplate(templateText);
    
    // Hide loading indicator
    if (!isLiveUpdate) {
      hideOperatorExecutionIndicator();
    }
  } catch (error) {
    // Hide loading indicator on error
    if (!isLiveUpdate) {
      hideOperatorExecutionIndicator();
    }
  }
}

// Show loading indicator for operator execution
function showOperatorExecutionIndicator() {
  // Create or update the indicator
  let indicator = document.getElementById('operator-execution-indicator');
  
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'operator-execution-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 320px;
      max-width: 450px;
      animation: slideInRight 0.3s ease-out;
    `;
    
    // Add keyframe animation
    if (!document.querySelector('#operator-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'operator-indicator-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .operator-spinner {
          animation: spin 1s linear infinite;
        }
        
        .operator-progress-bar {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 8px;
        }
        
        .operator-progress-fill {
          height: 100%;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 2px;
          transition: width 0.3s ease;
          width: 0%;
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(indicator);
  }
  
  indicator.innerHTML = `
    <div class="operator-spinner" style="
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top: 2px solid white;
      border-radius: 50%;
      flex-shrink: 0;
    "></div>
    <div style="flex: 1;">
      <div style="font-weight: 600; margin-bottom: 4px;">Executing Operators</div>
      <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Preparing data for template execution...</div>
      <div class="operator-progress-bar">
        <div class="operator-progress-fill" style="width: 0%;"></div>
      </div>
    </div>
  `;
  
  indicator.style.display = 'flex';
}

// Hide loading indicator for operator execution
function hideOperatorExecutionIndicator() {
  const indicator = document.getElementById('operator-execution-indicator');
  if (indicator) {
    indicator.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => {
      if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }
}

// Update operator execution progress
function updateOperatorExecutionProgress(message, operatorName = null, progress = null) {
  const indicator = document.getElementById('operator-execution-indicator');
  if (indicator) {
    const messageDiv = indicator.querySelector('div > div:nth-child(2)');
    const progressBar = indicator.querySelector('.operator-progress-fill');
    
    if (messageDiv) {
      if (operatorName) {
        messageDiv.textContent = `Executing: ${operatorName}`;
      } else {
        messageDiv.textContent = message;
      }
    }
    
    if (progressBar && progress !== null) {
      progressBar.style.width = `${progress}%`;
    }
  }
}

// Expose functions globally for operators module to use
window.showOperatorExecutionIndicator = showOperatorExecutionIndicator;
window.hideOperatorExecutionIndicator = hideOperatorExecutionIndicator;
window.updateOperatorExecutionProgress = updateOperatorExecutionProgress;

// Test function to manually show the indicator (for debugging)
window.testOperatorIndicator = function() {
  showOperatorExecutionIndicator();
  
  // Update progress after 2 seconds
  setTimeout(() => {
    updateOperatorExecutionProgress('Testing progress update', 'Test Operator', 25);
  }, 2000);
  
  // Update progress after 4 seconds
  setTimeout(() => {
    updateOperatorExecutionProgress('Testing progress update', 'Test Operator', 50);
  }, 4000);
  
  // Update progress after 6 seconds
  setTimeout(() => {
    updateOperatorExecutionProgress('Testing progress update', 'Test Operator', 75);
  }, 6000);
  
  // Hide after 8 seconds
  setTimeout(() => {
    hideOperatorExecutionIndicator();
  }, 8000);
};

// Basic template execution
export async function executeTemplate(clearCache = false, isLiveUpdate = false) {  
  const templateEditor = getElements.templateEditor;
  const currentDocumentId = window.documentManager?.activeDocumentId;
  if (currentDocumentId) {
    const documentSpecificId = `${currentDocumentId}-template-editor`;
    const documentSpecificEditor = document.getElementById(documentSpecificId);
    const activeDocument = document.querySelector('.tab-content.active');
    if (activeDocument) {
      const templateEditorInActiveDoc = activeDocument.querySelector('.template-editor');
    }
  }
  
  if (!templateEditor) {
    const fallbackEditor = document.querySelector('.template-editor') || 
                          document.getElementById('template-editor') ||
                          document.querySelector('.tab-content.active .template-editor');
    
    if (fallbackEditor) {
      // Use the fallback editor
      const fallbackTemplateText = getTextContentWithLineBreaks(fallbackEditor);
      
      if (fallbackTemplateText && fallbackTemplateText.trim()) {
        // Continue with the fallback editor
        const hasRichHTML = fallbackEditor.innerHTML && 
                           fallbackEditor.innerHTML !== fallbackEditor.textContent &&
                           isRichHTMLContent(fallbackEditor.innerHTML);
        
        let templateText;
        if (hasRichHTML) {
          templateText = fallbackEditor.innerHTML;
        } else {
          templateText = fallbackTemplateText;
        }
        
        if (!isLiveUpdate) {
          setExecutionStatus('Preparing template execution...', 'loading');
        }
        
        await executeRequiredOperatorsBeforeTemplate(templateText, isLiveUpdate, clearCache);
        
        if (!isLiveUpdate) {
          setExecutionStatus(clearCache ? 'Executing template (no cache)...' : 'Executing template...', 'loading');
        }
        
        executeTemplateRequest(templateText, clearCache, isLiveUpdate);
        return;
      }
    }
    
    setExecutionStatus('Template editor not found', 'error');
    return;
  }
  
  // Check if the template editor contains rich HTML content that should be preserved
  const hasRichHTML = templateEditor.innerHTML && 
                      templateEditor.innerHTML !== templateEditor.textContent &&
                      isRichHTMLContent(templateEditor.innerHTML);
  
  let templateText;
  if (hasRichHTML) {
    // Preserve rich HTML content (like PPTX2HTML)
    templateText = templateEditor.innerHTML;
  } else {
    // Convert to plain text for simple content
    templateText = getTextContentWithLineBreaks(templateEditor);
  }
  
  if (!templateText.trim()) {
    console.error(`[${windowId}] 🔍 DEBUG: Template text is empty after trimming!`);
    setExecutionStatus('Please enter a template first', 'error');
    return;
  }

  if (!isLiveUpdate) {
    setExecutionStatus('Preparing template execution...', 'loading');
  }

  // Execute required operators before template processing
  await executeRequiredOperatorsBeforeTemplate(templateText, isLiveUpdate, clearCache);

  if (!isLiveUpdate) {
    setExecutionStatus(clearCache ? 'Executing template (no cache)...' : 'Executing template...', 'loading');
  }

  executeTemplateRequest(templateText, clearCache, isLiveUpdate);
}

async function executeTemplateRequest(templateText, clearCache = false, isLiveUpdate = false) {
  
  try {
    // Get current document ID for data sources context
    const documentId = window.documentManager?.activeDocumentId || null;
    
    const requestBody = { 
      template_text: templateText,
      session_id: state.sessionId,
      document_id: documentId,
      clear_cache: clearCache
    };
    
    
    const response = await fetch('http://127.0.0.1:5000/api/execute-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      
      updateState({ 
        variables: data.variables || {},
        currentOutput: data.rendered_output,
        currentTemplate: templateText
      });
      
      if (!isLiveUpdate) {
        setExecutionStatus('Executed successfully', 'success');
        // Only switch to preview if user can switch modes
        if (canUserSwitchModes()) {
          switchToPreview();
        }
      }
      
      // Update preview (simplified)
      const previewContent = getElements.previewContent;
      
      if (previewContent) {
        previewContent.innerHTML = escapeAndFormatOutput(data.rendered_output);
      }
      
      // Re-attach event listeners to highlighted text after content update
      refreshHighlightEventListeners();
    } else {
      console.error(`[${windowId}] 🔍 DEBUG: Template execution failed:`, data.error);
      setExecutionStatus('Execution failed', 'error');
      const previewContent = getElements.previewContent;
      if (previewContent) {
        previewContent.innerHTML = `<div style="color: red;">Error: ${data.error}</div>`;
      }
      
      // Re-attach event listeners to highlighted text after content update
      refreshHighlightEventListeners();
    }
  } catch (error) {
    setExecutionStatus('Execution failed', 'error');
    const previewContent = getElements.previewContent;
    if (previewContent) {
      previewContent.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    }
    
    // Re-attach event listeners to highlighted text after content update
    refreshHighlightEventListeners();
  }
}

export function escapeAndFormatOutput(text) {
  if (!text) return 'No output generated';
  
  // Check if the text contains rich HTML content (like PPTX2HTML output)
  const hasRichHTML = isRichHTMLContent(text);
  
  if (hasRichHTML) {
    // For rich HTML content, preserve the structure and only format line breaks carefully
    return preserveRichHTML(text);
  }
  
  // For simple content, check if it contains basic HTML elements
  const containsHTML = /<(img|video|span)[^>]*>/.test(text);
  
  if (containsHTML) {
    // Text contains HTML elements, just format line breaks while preserving HTML
    return text.replace(/\n(?![^<]*>)/g, '<br>');
  } else {
    // Plain text, escape HTML and format line breaks
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }
}

function isRichHTMLContent(text) {
  // Check for indicators of rich HTML content that should be preserved
  const richHTMLIndicators = [
    // PPTX2HTML output markers
    /<section[^>]*style=/i,
    /<svg[^>]*class="drawing"/i,
    /<div[^>]*class="block content"/i,
    /<style>[^<]*\._css_/i,
    
    // CSV table content
    /<table[^>]*class="csv-table"/i,
    /<table[^>]*style=[^>]*border-collapse/i,
    
    // Markdown rendered content
    /<div[^>]*class="markdown-content"/i,
    
    // JSON formatted content
    /<div[^>]*class="json-content"/i,
    /<pre><code>/i,
    
    // Excel/CSV structured content
    /<table[^>]*>[\s\S]*<\/table>/i,
    
    // HTML content wrappers
    /<div[^>]*class="html-content"/i,
    
    // PowerPoint content
    /<div[^>]*class="powerpoint-content"/i,
    /<div[^>]*class="pptx-presentation"/i,
    
    // PDF content wrapper
    /<div[^>]*class="pdf-content"/i,
    
    // Other rich HTML structures
    /<div[^>]*style="[^"]*position:\s*absolute/i,
    /<div[^>]*style="[^"]*width:\s*\d+px[^"]*height:\s*\d+px/i,
    
    // Complex nested structures
    /(<div[^>]*>[^<]*<div[^>]*>[^<]*<\/div>[^<]*<\/div>)/i,
    /(<section[^>]*>[\s\S]*<\/section>)/i,
    
    // Media content
    /<img[^>]*src=/i,
    /<video[^>]*>/i,
    
    // Any content with CSS classes (indicates structured content)
    /<div[^>]*class="[^"]+"/i,
    /<span[^>]*class="[^"]+"/i
  ];
  
  return richHTMLIndicators.some(pattern => pattern.test(text));
}

function preserveRichHTML(text) {
  // For rich HTML content, we want to preserve the structure exactly
  // Only convert single line breaks that are not part of HTML structure to <br>
  
  // Don't modify content that already has proper HTML structure
  // Just ensure that standalone newlines (not part of HTML tags) become <br>
  return text.replace(/\n(?![^<]*>)(?![\s]*<)/g, '<br>');
}

function setExecutionStatus(message, type) {
  const templateExecutionStatus = getElements.templateExecutionStatus;
  if (!templateExecutionStatus) return;
  
  templateExecutionStatus.textContent = message;
  templateExecutionStatus.className = `template-execution-status ${type}`;
  
  if (type !== 'error') {
    setTimeout(() => {
      templateExecutionStatus.textContent = '';
      templateExecutionStatus.className = 'template-execution-status';
    }, 3000);
  }
}

// Handle diff view response from template suggestions
async function handleDiffViewResponse(data) {
  // First, show the LLM's response in chat if available
  if (data.response || data.assistant_message || data.content) {
    const llmResponse = data.response || data.assistant_message || data.content;
    addMessageToUI('system', `🤖 **AI Suggestion:** ${llmResponse}`);
  }
  
  // Create a suggestion comment instead of showing diff overlay
  if (data.template && data.template.line_diffs) {
    await createAISuggestionComment(data.template.line_diffs, data.template.current_template, data.template.suggested_template, data.response || data.assistant_message || data.content);
  }
}

// Create AI suggestion as a comment with inline diff
async function createAISuggestionComment(lineDiffs, currentTemplate, suggestedTemplate, aiMessage) {
  try {
    // Validate input parameters
    if (!lineDiffs || !Array.isArray(lineDiffs)) {
      console.error('Invalid lineDiffs provided:', lineDiffs);
      return;
    }
    
    if (lineDiffs.length === 0) {
      return;
    }
    
    // Import required modules with timeout protection
    const [{ createTextComment }, { state, incrementCommentCounter }, { getCurrentUser }] = await Promise.race([
      Promise.all([
        import('./comments.js'),
        import('./state.js'),
        import('./auth.js')
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Module import timeout')), 5000)
      )
    ]);
    
    // Store diff data for later use
    currentDiffData = {
      lineDiffs: lineDiffs,
      currentTemplate: currentTemplate,
      suggestedTemplate: suggestedTemplate
    };
    
    // Create summary of changes
    const changesSummary = summarizeChanges(lineDiffs);
    
    // Get current user info
    const currentUser = getCurrentUser();
    const userInfo = currentUser ? `${currentUser.emoji} ${currentUser.name}` : '👤 User';
    
    // Create comment content with change details and user info
    const commentContent = `AI Suggestion for ${userInfo}:\n${changesSummary}\n\nClick Accept/Reject buttons to apply changes.`;
    
    // Get the entire code editor content as selected text (for now)
    const selectedText = currentTemplate;
    
    // Create a special AI suggestion comment with document-specific ID
    const baseCommentId = `ai-suggestion-${incrementCommentCounter()}`;
    const commentId = createDocumentCommentId(baseCommentId);
    
    // Get AI as the author but include user context
    const aiAuthor = {
      id: 'ai-assistant',
      name: `AI Assistant → ${currentUser?.name || 'User'}`,
      emoji: '🤖',
      color: '#007bff'
    };
    
    // Create comment data
    const commentData = {
      id: commentId,
      selectedText: selectedText,
      commentMessage: commentContent,
      mode: 'template',
      author: aiAuthor.id,
      authorName: aiAuthor.name,
      authorEmoji: aiAuthor.emoji,
      authorColor: aiAuthor.color,
      createdAt: new Date().toISOString(),
      isResolved: false,
      isActive: true,
      
      // Special AI suggestion properties
      isAISuggestion: true,
      lineDiffs: lineDiffs,
      currentTemplate: currentTemplate,
      suggestedTemplate: suggestedTemplate,
      aiMessage: aiMessage,
      requestedBy: currentUser, // Store who requested the suggestion
      
      ui: {
        position: null,
        element: null,
        isVisible: true,
        isDragging: false
      }
    };
    
    // Store in comments state
    state.comments[commentId] = commentData;
    
    // Apply inline diff highlighting in the code editor with timeout protection
    const highlightPromise = new Promise((resolve, reject) => {
      try {
        applyInlineDiffHighlighting(lineDiffs, commentId);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    await Promise.race([
      highlightPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Diff highlighting timeout')), 3000)
      )
    ]);
    
    // Create floating annotation with accept/reject buttons
    const { createAISuggestionAnnotation } = await import('./annotations.js');
    createAISuggestionAnnotation(commentData);
    
    // Show feedback
    addMessageToUI('system', `💡 AI suggested ${lineDiffs.length} changes. Review them in the highlighted code.`);
    
    // Trigger auto-save for comment changes
    if (window.documentManager) {
      window.documentManager.onContentChange();
    }
    
  } catch (error) {    
    // Remove waiting indicator in case of error
    try {
      removeWaitingIndicator();
    } catch (indicatorError) {
      console.error('Error removing waiting indicator:', indicatorError);
    }
  }
}

// Summarize changes for the comment
function summarizeChanges(lineDiffs) {
  const addedCount = lineDiffs.filter(d => d.changeType === 'added').length;
  const removedCount = lineDiffs.filter(d => d.changeType === 'removed').length;
  const modifiedCount = lineDiffs.filter(d => d.changeType === 'modified').length;
  
  const parts = [];
  if (addedCount > 0) parts.push(`+${addedCount} additions`);
  if (removedCount > 0) parts.push(`-${removedCount} deletions`);
  if (modifiedCount > 0) parts.push(`±${modifiedCount} modifications`);
  
  return parts.join(', ');
}

// Apply inline diff highlighting directly in the code editor
function applyInlineDiffHighlighting(lineDiffs, commentId) {
  const templateEditor = getElements.templateEditor;
  if (!templateEditor) return;
  
  const lines = templateEditor.textContent.split('\n');
  
  // Clear the editor first
  templateEditor.innerHTML = '';
  
  // Create a map for faster lookup of diffs by line index
  const diffMap = new Map();
  lineDiffs.forEach(diff => {
    diffMap.set(diff.lineIndex, diff);
  });
  
  // Track which lines have been processed
  const processedLines = new Set();
  
  // Process the content line by line - use the maximum of lines or highest diff index
  const maxDiffIndex = lineDiffs.length > 0 ? Math.max(...lineDiffs.map(d => d.lineIndex)) : -1;
  const maxLines = Math.max(lines.length, maxDiffIndex + 1);
  
  for (let i = 0; i < maxLines; i++) {
    const diff = diffMap.get(i);
    
    if (diff && !processedLines.has(i)) {
      processedLines.add(i);
      
      if (diff.changeType === 'removed') {
        // Show strikethrough for removed lines
        const removedSpan = document.createElement('span');
        removedSpan.className = 'ai-diff-removed';
        removedSpan.setAttribute('data-comment-id', commentId);
        removedSpan.setAttribute('data-line-index', String(i));
        removedSpan.setAttribute('data-diff-type', 'removed');
        removedSpan.textContent = lines[i] || diff.originalLine || '';
        templateEditor.appendChild(removedSpan);
        
      } else if (diff.changeType === 'added') {
        // Show green background for added lines
        const addedSpan = document.createElement('span');
        addedSpan.className = 'ai-diff-added';
        addedSpan.setAttribute('data-comment-id', commentId);
        addedSpan.setAttribute('data-line-index', String(i));
        addedSpan.setAttribute('data-diff-type', 'added');
        addedSpan.textContent = diff.suggestedLine || '';
        templateEditor.appendChild(addedSpan);
        
      } else if (diff.changeType === 'modified') {
        // Show both old (strikethrough) and new (green) for modified lines
        const removedSpan = document.createElement('span');
        removedSpan.className = 'ai-diff-removed';
        removedSpan.setAttribute('data-comment-id', commentId);
        removedSpan.setAttribute('data-line-index', String(i));
        removedSpan.setAttribute('data-diff-type', 'removed');
        removedSpan.textContent = lines[i] || diff.originalLine || '';
        templateEditor.appendChild(removedSpan);
        
        templateEditor.appendChild(document.createTextNode('\n'));
        
        const addedSpan = document.createElement('span');
        addedSpan.className = 'ai-diff-added';
        addedSpan.setAttribute('data-comment-id', commentId);
        addedSpan.setAttribute('data-line-index', String(i));
        addedSpan.setAttribute('data-diff-type', 'added');
        addedSpan.textContent = diff.suggestedLine || '';
        templateEditor.appendChild(addedSpan);
      }
      
    } else if (i < lines.length) {
      // Normal line without changes
      templateEditor.appendChild(document.createTextNode(lines[i]));
    }
    
    // Add newline after each line except the last one
    if (i < maxLines - 1) {
      templateEditor.appendChild(document.createTextNode('\n'));
    }
  }
}

// Accept AI suggestion
export async function acceptAISuggestion(commentId) {
  const { state } = await import('./state.js');
  const comment = state.comments[commentId];
  if (!comment || !comment.isAISuggestion) return;
  
  // Apply the suggested template
  const templateEditor = getElements.templateEditor;
  if (templateEditor) {
    templateEditor.textContent = comment.suggestedTemplate;
  }
  
  // Remove diff highlighting
  removeAIDiffHighlighting(commentId);
  
  // Mark comment as resolved
  comment.isResolved = true;
  
  // Remove the annotation window
  const annotation = document.getElementById(commentId);
  if (annotation) {
    annotation.remove();
  }
  
  // Remove from state
  delete state.comments[commentId];
  
  // Execute the new template
  await executeTemplate(false, true);
  
  // Show feedback
  addMessageToUI('system', '✅ AI suggestion accepted and applied!');
  
  // Trigger auto-save
  if (window.documentManager) {
    window.documentManager.onContentChange();
  }
}

// Reject AI suggestion
export async function rejectAISuggestion(commentId) {
  const { state } = await import('./state.js');
  const comment = state.comments[commentId];
  if (!comment || !comment.isAISuggestion) return;
  
  // Restore original template (remove diff highlighting)
  const templateEditor = getElements.templateEditor;
  if (templateEditor) {
    templateEditor.textContent = comment.currentTemplate;
  }
  
  // Remove diff highlighting
  removeAIDiffHighlighting(commentId);
  
  // Mark comment as resolved
  comment.isResolved = true;
  
  // Remove the annotation window
  const annotation = document.getElementById(commentId);
  if (annotation) {
    annotation.remove();
  }
  
  // Remove from state
  delete state.comments[commentId];
  
  // Show feedback
  addMessageToUI('system', '❌ AI suggestion rejected. Original code restored.');
  
  // Trigger auto-save
  if (window.documentManager) {
    window.documentManager.onContentChange();
  }
}

// Remove AI diff highlighting
function removeAIDiffHighlighting(commentId) {
  const templateEditor = getElements.templateEditor;
  if (!templateEditor) return;
  
  const highlights = templateEditor.querySelectorAll(`[data-comment-id="${commentId}"]`);
  highlights.forEach(highlight => {
    highlight.replaceWith(document.createTextNode(highlight.textContent));
  });
}

// Smart content extraction from chat responses
function extractContentFromResponse(responseText) {
  if (!responseText || responseText.length < 50) return null;
  
  // Common conversational prefixes to remove
  const prefixPatterns = [
    /^(sure[,.]?\s*here\s*(is|are)?\s*)/i,
    /^(sounds\s*good[,.]?\s*(here\s*(is|are)?\s*)?)/i,
    /^(of\s*course[,.]?\s*(here\s*(is|are)?\s*)?)/i,
    /^(absolutely[,.]?\s*(here\s*(is|are)?\s*)?)/i,
    /^(certainly[,.]?\s*(here\s*(is|are)?\s*)?)/i,
    /^(here\s*(is|are)\s*)/i,
    /^(i\s*can\s*help\s*you\s*with\s*that[,.]?\s*)/i,
    /^(let\s*me\s*provide\s*you\s*with\s*)/i,
    /^(i'll\s*create\s*)/i,
    /^(i'll\s*help\s*you\s*create\s*)/i,
    /^(based\s*on\s*your\s*request[,.]?\s*)/i
  ];
  
  let content = responseText.trim();
  
  // Remove conversational prefixes
  for (const pattern of prefixPatterns) {
    content = content.replace(pattern, '');
  }
  
  // Remove common conversational suffixes
  const suffixPatterns = [
    /\s*(let\s*me\s*know\s*if\s*you\s*need\s*any\s*changes?[.!]?)$/i,
    /\s*(feel\s*free\s*to\s*modify\s*as\s*needed[.!]?)$/i,
    /\s*(hope\s*this\s*helps?[.!]?)$/i
  ];
  
  for (const pattern of suffixPatterns) {
    content = content.replace(pattern, '');
  }
  
  content = content.trim();
  
  // Check if this looks like structured content (markdown, HTML, templates, etc.)
  const structuredContentIndicators = [
    /^#\s+/m,                    // Markdown headers
    /^\*\*.*\*\*$/m,             // Bold text
    /^\s*\*\s+/m,                // Bullet points
    /^\s*\d+\.\s+/m,             // Numbered lists
    /```[\s\S]*```/,             // Code blocks
    /\{\{.*\}\}/,                // Template variables
    /<[^>]+>/,                   // HTML tags
    /\|.*\|/,                    // Tables
    /^-{3,}$/m                   // Horizontal rules
  ];
  
  const hasStructuredContent = structuredContentIndicators.some(pattern => pattern.test(content));
  
  // Only extract if it seems like structured content and is significantly different from original
  if (hasStructuredContent && content.length > 100 && content.length / responseText.length > 0.7) {
    return content;
  }
  
  return null;
}

// Display extracted content in preview
function displayContentInPreview(content) {
  // Detect content type and render appropriately
  let renderedContent = '';
  
  // Check if user can copy to code editor
  const currentUser = getCurrentUser();
  const canCopyToCode = currentUser && currentUser.role !== 'Report Consumer';
  
  // Create document-specific copy button ID
  const copyButtonId = createDocumentElementId('copy-to-editor-btn');
  const copyButton = canCopyToCode ? 
    `<button id="${copyButtonId}" onclick="copyTotemplateEditor()" class="copy-to-editor-btn">Copy to Code Editor</button>` : '';
  
  if (content.includes('{{') && content.includes('}}')) {
    // Looks like a template - display as code with highlighting
    renderedContent = `
      <div class="extracted-content">
        <div class="content-header">
          <h3>Generated Template</h3>
          ${copyButton}
        </div>
        <div class="template-content">
          <pre><code>${escapeHtml(content)}</code></pre>
        </div>
      </div>
    `;
  } else if (content.includes('#') || content.includes('**') || content.includes('```')) {
    // Looks like markdown
    renderedContent = `
      <div class="extracted-content">
        <div class="content-header">
          <h3>Generated Content</h3>
          ${copyButton}
        </div>
        <div class="markdown-content">
          ${renderSimpleMarkdown(content)}
        </div>
      </div>
    `;
  } else {
    // Plain text content
    renderedContent = `
      <div class="extracted-content">
        <div class="content-header">
          <h3>Generated Content</h3>
          ${copyButton}
        </div>
        <div class="plain-content">
          <pre>${escapeHtml(content)}</pre>
        </div>
      </div>
    `;
  }
  
  // Store the content for copying
  window.lastExtractedContent = content;
  
  // Display in preview
  const previewContent = getElements.previewContent;
  if (previewContent) {
    previewContent.innerHTML = renderedContent;
  }
  
  // Re-attach event listeners to highlighted text after content update
  refreshHighlightEventListeners();
  
  // Switch to preview mode if not already there and user can switch modes
  if (state.currentMode !== 'preview' && canUserSwitchModes()) {
    switchToPreview();
  }
}

// Simple markdown rendering for extracted content using marked.js
function renderSimpleMarkdown(content) {
  // Use marked.js if available, otherwise fall back to simple formatting
  if (typeof marked !== 'undefined') {
    try {
      // Configure marked for extracted content
      marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false,
        silent: true
      });
      
      return marked.parse(content);
    } catch (error) {
      console.error('Error parsing markdown:', error);
      // Fall through to simple formatting
    }
  }
  
  // Simple fallback formatting when marked.js is not available
  return content
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^1\. (.*$)/gim, '<li>$1</li>')
    .replace(/\n/g, '<br>');
}

// Global function to copy extracted content to code editor
window.copyTotemplateEditor = function() {
  // Check if user can access code editor
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    addMessageToUI('system', 'Access denied: Consumers cannot edit code');
    return;
  }
  
  const templateEditor = getElements.templateEditor;
  if (window.lastExtractedContent && templateEditor) {
    templateEditor.textContent = window.lastExtractedContent;
    addMessageToUI('system', 'Content copied to code editor');
    // Switch to code mode only if user can switch modes
    if (state.currentMode !== 'template' && canUserSwitchModes()) {
      switchToTemplate();
    }
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function initTemplateExecution() {
  const executeTemplateBtn = getElements.executeTemplateBtn;
  if (!executeTemplateBtn) {
    console.error(`[${windowId}] Execute template button not found!`);
    return;
  }
  
  // Check if user can execute templates
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    executeTemplateBtn.style.display = 'none';
    return; // Don't add event listeners for consumers
  }
  
  // Remove existing event listener from the previous button if it exists
  if (templateExecData.executeHandler && templateExecData.currentExecuteBtn) {
    templateExecData.currentExecuteBtn.removeEventListener('click', templateExecData.executeHandler);
  }
  
  // Create new event handler
  templateExecData.executeHandler = async () => {
    await executeTemplate();
  };
  
  // Add the event listener to the current button
  executeTemplateBtn.addEventListener('click', templateExecData.executeHandler);
  
  // Track which button currently has the listener
  templateExecData.currentExecuteBtn = executeTemplateBtn;
  
  // Expose operator execution indicator functions to window for use by operators module
  window.showOperatorExecutionIndicator = showOperatorExecutionIndicator;
  window.hideOperatorExecutionIndicator = hideOperatorExecutionIndicator;
  window.updateOperatorExecutionProgress = updateOperatorExecutionProgress;
  
  // Mark as initialized
  templateExecData.templateExecutionInitialized = true;
  window[TEMPLATE_EXEC_KEY] = templateExecData;
}

// Function to reset initialization flag (for DocumentManager)
export function resetTemplateExecutionInitialization() {
  // Clean up existing event listener before resetting
  if (templateExecData.executeHandler && templateExecData.currentExecuteBtn) {
    templateExecData.currentExecuteBtn.removeEventListener('click', templateExecData.executeHandler);
  }
  
  templateExecData.templateExecutionInitialized = false;
  templateExecData.executeHandler = null;
  templateExecData.currentExecuteBtn = null;
  window[TEMPLATE_EXEC_KEY] = templateExecData;
} 