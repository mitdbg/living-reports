// Template Execution Module
import { state, elements, updateState, windowId } from './state.js';
import { switchToPreview, switchToCode, switchToDiff } from './modes.js';
import { addMessageToUI } from './chat.js';
import { refreshHighlightEventListeners } from './comments.js';

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

// Basic template execution
export function executeTemplate(clearCache = false, isLiveUpdate = false) {
  const templateText = elements.codeEditor.textContent;
  if (!templateText.trim()) {
    setExecutionStatus('Please enter a template first', 'error');
    return;
  }

  if (!isLiveUpdate) {
    setExecutionStatus(clearCache ? 'Executing template (no cache)...' : 'Executing template...', 'loading');
  }

  executeTemplateRequest(templateText, clearCache, isLiveUpdate);
}

async function executeTemplateRequest(templateText, clearCache = false, isLiveUpdate = false) {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/execute-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        template_text: templateText,
        session_id: state.sessionId,
        clear_cache: clearCache
      })
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
        switchToPreview();
      }
      
      // Update preview (simplified)
      elements.previewContent.innerHTML = escapeAndFormatOutput(data.rendered_output);
      
      // Re-attach event listeners to highlighted text after content update
      refreshHighlightEventListeners();
    } else {
      setExecutionStatus('Execution failed', 'error');
      elements.previewContent.innerHTML = `<div style="color: red;">Error: ${data.error}</div>`;
      
      // Re-attach event listeners to highlighted text after content update
      refreshHighlightEventListeners();
    }
  } catch (error) {
    console.error('Error executing template:', error);
    setExecutionStatus('Execution failed', 'error');
    elements.previewContent.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    
    // Re-attach event listeners to highlighted text after content update
    refreshHighlightEventListeners();
  }
}

function escapeAndFormatOutput(text) {
  if (!text) return 'No output generated';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function setExecutionStatus(message, type) {
  elements.executionStatus.textContent = message;
  elements.executionStatus.className = type;
  
  if (type !== 'error') {
    setTimeout(() => {
      elements.executionStatus.textContent = '';
    }, 3000);
  }
}

// Backend communication for chat
export async function sendToBackend(message, suggestTemplate = false) {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message,
        session_id: state.sessionId,
        current_template: elements.codeEditor.textContent,
        current_output: state.currentOutput,
        suggest_template: suggestTemplate
      })
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if this is a diff view response (template suggestion)
    if (data.view_type === 'diff' && suggestTemplate) {
      // Switch to diff view mode
      await handleDiffViewResponse(data);
    } else {
      // Handle regular chat response
      if (data.content || data.assistant_message || data.response) {
        const responseText = data.content || data.assistant_message || data.response;
        
        // Add the raw response to chat
        addMessageToUI('system', responseText);
        
        // If in preview mode, try to extract and display content smartly
        if (state.currentMode === 'preview') {
          const extractedContent = extractContentFromResponse(responseText);
          if (extractedContent && extractedContent !== responseText) {
            // Display extracted content in preview
            displayContentInPreview(extractedContent);
            // Add a note to chat that content was extracted
            addMessageToUI('system', 'Content extracted and displayed in preview');
          }
        }
      } else {
        // If no content in response, show a fallback message
        addMessageToUI('system', 'I received your message but didn\'t get a proper response from the server.');
      }
    }
    
  } catch (error) {
    console.error('Error sending message:', error);
    addMessageToUI('system', 'Error: Failed to get response from server. Make sure the Python backend is running.');
    // Re-throw to let the caller handle it
    throw error;
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
    console.log('Creating AI suggestion comment with', lineDiffs?.length || 0, 'diffs');
    
    // Validate input parameters
    if (!lineDiffs || !Array.isArray(lineDiffs)) {
      console.error('Invalid lineDiffs provided:', lineDiffs);
      addMessageToUI('system', '❌ Invalid AI suggestion data received');
      return;
    }
    
    if (lineDiffs.length === 0) {
      console.log('No changes suggested by AI');
      addMessageToUI('system', '💡 AI reviewed the code but suggested no changes');
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
    
    // Create a special AI suggestion comment
    const commentId = `ai-suggestion-${incrementCommentCounter()}`;
    
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
      mode: 'code',
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
    
    console.log('Applying inline diff highlighting...');
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
    
    console.log('Creating AI suggestion annotation...');
    // Create floating annotation with accept/reject buttons
    const { createAISuggestionAnnotation } = await import('./annotations.js');
    createAISuggestionAnnotation(commentData);
    
    // Show feedback
    addMessageToUI('system', `💡 AI suggested ${lineDiffs.length} changes. Review them in the highlighted code.`);
    
    // Trigger auto-save for comment changes
    if (window.documentManager) {
      window.documentManager.onCommentChange();
    }
    
    console.log('AI suggestion comment created successfully');
    
  } catch (error) {
    console.error('Error creating AI suggestion comment:', error);
    addMessageToUI('system', `❌ Failed to create AI suggestion: ${error.message}`);
    
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
  const codeEditor = elements.codeEditor;
  if (!codeEditor) return;
  
  const lines = codeEditor.textContent.split('\n');
  
  // Clear the editor first
  codeEditor.innerHTML = '';
  
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
        codeEditor.appendChild(removedSpan);
        
      } else if (diff.changeType === 'added') {
        // Show green background for added lines
        const addedSpan = document.createElement('span');
        addedSpan.className = 'ai-diff-added';
        addedSpan.setAttribute('data-comment-id', commentId);
        addedSpan.setAttribute('data-line-index', String(i));
        addedSpan.setAttribute('data-diff-type', 'added');
        addedSpan.textContent = diff.suggestedLine || '';
        codeEditor.appendChild(addedSpan);
        
      } else if (diff.changeType === 'modified') {
        // Show both old (strikethrough) and new (green) for modified lines
        const removedSpan = document.createElement('span');
        removedSpan.className = 'ai-diff-removed';
        removedSpan.setAttribute('data-comment-id', commentId);
        removedSpan.setAttribute('data-line-index', String(i));
        removedSpan.setAttribute('data-diff-type', 'removed');
        removedSpan.textContent = lines[i] || diff.originalLine || '';
        codeEditor.appendChild(removedSpan);
        
        codeEditor.appendChild(document.createTextNode('\n'));
        
        const addedSpan = document.createElement('span');
        addedSpan.className = 'ai-diff-added';
        addedSpan.setAttribute('data-comment-id', commentId);
        addedSpan.setAttribute('data-line-index', String(i));
        addedSpan.setAttribute('data-diff-type', 'added');
        addedSpan.textContent = diff.suggestedLine || '';
        codeEditor.appendChild(addedSpan);
      }
      
    } else if (i < lines.length) {
      // Normal line without changes
      codeEditor.appendChild(document.createTextNode(lines[i]));
    }
    
    // Add newline after each line except the last one
    if (i < maxLines - 1) {
      codeEditor.appendChild(document.createTextNode('\n'));
    }
  }
}

// Accept AI suggestion
export async function acceptAISuggestion(commentId) {
  const { state } = await import('./state.js');
  const comment = state.comments[commentId];
  if (!comment || !comment.isAISuggestion) return;
  
  // Apply the suggested template
  elements.codeEditor.textContent = comment.suggestedTemplate;
  
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
  executeTemplate(false, true);
  
  // Show feedback
  addMessageToUI('system', '✅ AI suggestion accepted and applied!');
  
  // Trigger auto-save
  if (window.documentManager) {
    window.documentManager.onCommentChange();
  }
}

// Reject AI suggestion
export async function rejectAISuggestion(commentId) {
  const { state } = await import('./state.js');
  const comment = state.comments[commentId];
  if (!comment || !comment.isAISuggestion) return;
  
  // Restore original template (remove diff highlighting)
  elements.codeEditor.textContent = comment.currentTemplate;
  
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
    window.documentManager.onCommentChange();
  }
}

// Remove AI diff highlighting
function removeAIDiffHighlighting(commentId) {
  const highlights = elements.codeEditor.querySelectorAll(`[data-comment-id="${commentId}"]`);
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
  
  if (content.includes('{{') && content.includes('}}')) {
    // Looks like a template - display as code with highlighting
    renderedContent = `
      <div class="extracted-content">
        <div class="content-header">
          <h3>Generated Template</h3>
          <button onclick="copyToCodeEditor()" class="copy-to-editor-btn">Copy to Code Editor</button>
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
          <button onclick="copyToCodeEditor()" class="copy-to-editor-btn">Copy to Code Editor</button>
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
          <button onclick="copyToCodeEditor()" class="copy-to-editor-btn">Copy to Code Editor</button>
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
  elements.previewContent.innerHTML = renderedContent;
  
  // Re-attach event listeners to highlighted text after content update
  refreshHighlightEventListeners();
  
  // Switch to preview mode if not already there
  if (state.currentMode !== 'preview') {
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
window.copyToCodeEditor = function() {
  if (window.lastExtractedContent && elements.codeEditor) {
    elements.codeEditor.textContent = window.lastExtractedContent;
    addMessageToUI('system', 'Content copied to code editor');
    // Switch to code mode
    if (state.currentMode !== 'code') {
      switchToCode();
    }
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function initTemplateExecution() {
  if (!elements.executeBtn) {
    console.error(`[${windowId}] Execute button not found!`);
    return;
  }
  
  // Remove existing event listener from the previous button if it exists
  if (templateExecData.executeHandler && templateExecData.currentExecuteBtn) {
    console.log(`[${windowId}] Removing event listener from previous execute button`);
    templateExecData.currentExecuteBtn.removeEventListener('click', templateExecData.executeHandler);
  }
  
  // Create new event handler
  templateExecData.executeHandler = () => {
    console.log(`[${windowId}] Execute template clicked`);
    executeTemplate();
  };
  
  // Add the event listener to the current button
  elements.executeBtn.addEventListener('click', templateExecData.executeHandler);
  
  // Track which button currently has the listener
  templateExecData.currentExecuteBtn = elements.executeBtn;
  
  console.log(`[${windowId}] Template execution initialized, button:`, elements.executeBtn);
  
  // Mark as initialized
  templateExecData.templateExecutionInitialized = true;
  window[TEMPLATE_EXEC_KEY] = templateExecData;
}

// Function to reset initialization flag (for DocumentManager)
export function resetTemplateExecutionInitialization() {
  // Clean up existing event listener before resetting
  if (templateExecData.executeHandler && templateExecData.currentExecuteBtn) {
    console.log(`[${windowId}] Cleaning up execute event listener during reset`);
    templateExecData.currentExecuteBtn.removeEventListener('click', templateExecData.executeHandler);
  }
  
  templateExecData.templateExecutionInitialized = false;
  templateExecData.executeHandler = null;
  templateExecData.currentExecuteBtn = null;
  window[TEMPLATE_EXEC_KEY] = templateExecData;
} 