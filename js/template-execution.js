// Template Execution Module
import { state, elements, updateState, windowId } from './state.js';
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

// Operators Integration - Execute required operators before template processing
async function executeRequiredOperatorsBeforeTemplate(templateText, isLiveUpdate = false) {
  try {
    // Only execute operators if operators module is available
    if (!window.operatorsModule || !window.operatorsModule.executeRequiredOperatorsForTemplate) {
      console.log(`[${windowId}] Operators module not available, skipping operator execution`);
      return;
    }

    console.log(`[${windowId}] Checking template for required operators...`);
    
    // Execute required operators for this template
    const result = await window.operatorsModule.executeRequiredOperatorsForTemplate(templateText);
    
    if (result.success) {
      if (result.executedOperators.length > 0) {
        console.log(`[${windowId}] Successfully executed ${result.executedOperators.length} operators:`, result.executedOperators);
        
        if (!isLiveUpdate) {
          // Show summary message for manual execution
          addMessageToUI('system', `✅ Pre-executed ${result.executedOperators.length} operators: ${result.executedOperators.join(', ')}`);
        }
      } else {
        console.log(`[${windowId}] No operators needed for this template`);
      }
    } else {
      console.error(`[${windowId}] Error executing required operators:`, result.error);
      
      if (!isLiveUpdate) {
        addMessageToUI('system', `⚠️ Some operators failed to execute: ${result.error}`);
      }
      
      // Continue with template execution even if operators fail
      // This allows templates to work with partial data or fallback to manual execution
    }
    
  } catch (error) {
    console.error(`[${windowId}] Error in executeRequiredOperatorsBeforeTemplate:`, error);
    
    if (!isLiveUpdate) {
      addMessageToUI('system', `⚠️ Could not execute required operators: ${error.message}`);
    }
    
    // Continue with template execution
  }
}

// Basic template execution
export async function executeTemplate(clearCache = false, isLiveUpdate = false) {
  if (!elements.templateEditor) {
    setExecutionStatus('Template editor not found', 'error');
    return;
  }
  
  // Check if the template editor contains rich HTML content that should be preserved
  const hasRichHTML = elements.templateEditor.innerHTML && 
                      elements.templateEditor.innerHTML !== elements.templateEditor.textContent &&
                      isRichHTMLContent(elements.templateEditor.innerHTML);
  
  let templateText;
  if (hasRichHTML) {
    // Preserve rich HTML content (like PPTX2HTML)
    templateText = elements.templateEditor.innerHTML;
    console.log('Detected rich HTML content, preserving HTML structure');
  } else {
    // Convert to plain text for simple content
    templateText = getTextContentWithLineBreaks(elements.templateEditor);
  }
  
  if (!templateText.trim()) {
    setExecutionStatus('Please enter a template first', 'error');
    return;
  }

  if (!isLiveUpdate) {
    setExecutionStatus('Preparing template execution...', 'loading');
  }

  // Execute required operators before template processing
  await executeRequiredOperatorsBeforeTemplate(templateText, isLiveUpdate);

  if (!isLiveUpdate) {
    setExecutionStatus(clearCache ? 'Executing template (no cache)...' : 'Executing template...', 'loading');
  }

  executeTemplateRequest(templateText, clearCache, isLiveUpdate);
}

async function executeTemplateRequest(templateText, clearCache = false, isLiveUpdate = false) {
  try {
    // Get current document ID for data lake context
    const documentId = window.documentManager?.activeDocumentId || null;
    
    const response = await fetch('http://127.0.0.1:5000/api/execute-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        template_text: templateText,
        session_id: state.sessionId,
        document_id: documentId,
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
        // Only switch to preview if user can switch modes
        if (canUserSwitchModes()) {
          switchToPreview();
        }
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
    
    // Other rich HTML structures
    /<div[^>]*style="[^"]*position:\s*absolute/i,
    /<div[^>]*style="[^"]*width:\s*\d+px[^"]*height:\s*\d+px/i,
    
    // Complex nested structures
    /(<div[^>]*>[^<]*<div[^>]*>[^<]*<\/div>[^<]*<\/div>)/i,
    /(<section[^>]*>[\s\S]*<\/section>)/i
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
  if (!elements.templateExecutionStatus) return;
  
  elements.templateExecutionStatus.textContent = message;
  elements.templateExecutionStatus.className = `template-execution-status ${type}`;
  
  if (type !== 'error') {
    setTimeout(() => {
      elements.templateExecutionStatus.textContent = '';
      elements.templateExecutionStatus.className = 'template-execution-status';
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
        current_template: getTextContentWithLineBreaks(elements.templateEditor),
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
  const templateEditor = elements.templateEditor;
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
  elements.templateEditor.textContent = comment.suggestedTemplate;
  
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
    window.documentManager.onCommentChange();
  }
}

// Reject AI suggestion
export async function rejectAISuggestion(commentId) {
  const { state } = await import('./state.js');
  const comment = state.comments[commentId];
  if (!comment || !comment.isAISuggestion) return;
  
  // Restore original template (remove diff highlighting)
  elements.templateEditor.textContent = comment.currentTemplate;
  
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
  const highlights = elements.templateEditor.querySelectorAll(`[data-comment-id="${commentId}"]`);
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
  
  const copyButton = canCopyToCode ? 
    '<button onclick="copyTotemplateEditor()" class="copy-to-editor-btn">Copy to Code Editor</button>' : '';
  
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
  elements.previewContent.innerHTML = renderedContent;
  
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
  
  if (window.lastExtractedContent && elements.templateEditor) {
    elements.templateEditor.textContent = window.lastExtractedContent;
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
  if (!elements.executeTemplateBtn) {
    console.error(`[${windowId}] Execute template button not found!`);
    return;
  }
  
  // Check if user can execute templates
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    console.log(`[${windowId}] Hiding execute template button for consumer: ${currentUser.name}`);
    elements.executeTemplateBtn.style.display = 'none';
    return; // Don't add event listeners for consumers
  }
  
  // Remove existing event listener from the previous button if it exists
  if (templateExecData.executeHandler && templateExecData.currentExecuteBtn) {
    console.log(`[${windowId}] Removing event listener from previous execute template button`);
    templateExecData.currentExecuteBtn.removeEventListener('click', templateExecData.executeHandler);
  }
  
  // Create new event handler
  templateExecData.executeHandler = async () => {
    console.log(`[${windowId}] Execute template clicked`);
    await executeTemplate();
  };
  
  // Add the event listener to the current button
  elements.executeTemplateBtn.addEventListener('click', templateExecData.executeHandler);
  
  // Track which button currently has the listener
  templateExecData.currentExecuteBtn = elements.executeTemplateBtn;
  
  console.log(`[${windowId}] Template execution initialized, button:`, elements.executeTemplateBtn);
  
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