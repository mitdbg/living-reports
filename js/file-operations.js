// File Operations Module
import { elements, state, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { switchToPreview, switchToTemplate } from './modes.js';
import { refreshHighlightEventListeners } from './comments.js';
import { addToDataLake } from './data-lake.js';

const { ipcRenderer } = require('electron');

// Create window-specific storage for initialization flags and handlers
const FILE_OPS_KEY = `fileOps_${windowId}`;
if (!window[FILE_OPS_KEY]) {
  window[FILE_OPS_KEY] = {
    fileOperationsInitialized: false,
    loadContextHandler: null,
    clearContextHandler: null,
    currentOpenFileBtn: null,
    currentClearContextBtn: null
  };
}

const fileOpsData = window[FILE_OPS_KEY];

// Context Files Management
function addContextFileToDisplay(file, backendSaved = false) {
  const contextFile = {
    id: Date.now() + Math.random(), // Unique ID
    name: file.name,
    path: file.path,
    content: file.content,
    backendSaved: backendSaved,
    loadedAt: new Date().toISOString()
  };
  
  // Add to state
  state.loadedContextFiles.push(contextFile);
  
  // Update display
  updateContextFilesDisplay();
}

function removeContextFileFromDisplay(fileId) {
  const originalLength = state.loadedContextFiles.length;
  
  // Remove from state
  state.loadedContextFiles = state.loadedContextFiles.filter(file => file.id !== fileId);
  
  // Update display
  updateContextFilesDisplay();
}

function updateContextFilesDisplay() {
  if (!elements.contextFilesSection || !elements.contextFilesList) {
    console.error('Context files elements not found');
    return;
  }
  
  if (state.loadedContextFiles.length === 0) {
    // Hide section if no files
    elements.contextFilesSection.style.display = 'none';
    elements.contextFilesList.innerHTML = '';
    return;
  }
  
  // Show section
  elements.contextFilesSection.style.display = 'block';
  
  // Generate HTML for each file
  const filesHTML = state.loadedContextFiles.map(file => {
    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileIcon = getFileIcon(fileExt);
    
    return `
      <div class="context-file-item" data-file-id="${file.id}">
        <div class="context-file-info">
          <span class="context-file-icon">${fileIcon}</span>
          <span class="context-file-name" title="${file.name}">${file.name}</span>
          <span class="context-file-type">${fileExt.toUpperCase()}</span>
        </div>
        <div class="context-file-actions">
          <button class="context-file-btn view-btn" title="View in preview" data-action="view" data-file-id="${file.id}">
            👁️
          </button>
          <button class="context-file-btn remove-btn" title="Remove from context" data-action="remove" data-file-id="${file.id}">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  elements.contextFilesList.innerHTML = filesHTML;
  
  // Add event listeners to the buttons
  const viewButtons = elements.contextFilesList.querySelectorAll('[data-action="view"]');
  const removeButtons = elements.contextFilesList.querySelectorAll('[data-action="remove"]');
  
  viewButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const fileId = parseFloat(e.target.getAttribute('data-file-id'));
      const file = state.loadedContextFiles.find(f => f.id === fileId);
      if (file) {
        displayContextInPreview(file);
      }
    });
  });
  
  removeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const fileId = parseFloat(e.target.getAttribute('data-file-id'));
      const file = state.loadedContextFiles.find(f => f.id === fileId);
      if (file && confirm(`Remove "${file.name}" from context?`)) {
        removeContextFileFromDisplay(fileId);
        addMessageToUI('system', `Removed "${file.name}" from context display.`);
        
        // If this was the last file, also clear backend context
        if (state.loadedContextFiles.length === 0) {
          clearFileContext();
        }
      }
    });
  });
}

function getFileIcon(fileExt) {
  const iconMap = {
    'md': '📝',
    'markdown': '📝',
    'txt': '📄',
    'json': '📋',
    'csv': '📊',
    'html': '🌐',
    'htm': '🌐',
    'js': '📜',
    'css': '🎨',
    'pdf': '📄',
    'xml': '📄',
    'xlsx': '📊',
    'xls': '📊'
  };
  
  return iconMap[fileExt] || '📄';
}

// File opening functionality
export function initFileOperations() {
  // Check if context files elements exist
  if (!elements.contextFilesSection || !elements.contextFilesList) {
    console.error(`[${windowId}] Context files elements not found`);
    return;
  }
  
  // Remove existing event listeners from previous buttons if they exist
  if (fileOpsData.loadContextHandler && fileOpsData.currentOpenFileBtn) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous open file button`);
    fileOpsData.currentOpenFileBtn.removeEventListener('click', fileOpsData.loadContextHandler);
  }
  if (fileOpsData.clearContextHandler && fileOpsData.currentClearContextBtn) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous clear context button`);
    fileOpsData.currentClearContextBtn.removeEventListener('click', fileOpsData.clearContextHandler);
  }
  
  // Create new event handlers
  fileOpsData.loadContextHandler = loadContextFile;
  fileOpsData.clearContextHandler = clearFileContext;
  
  // Initialize Load Context button
  if (elements.openFileBtn) {
    elements.openFileBtn.addEventListener('click', fileOpsData.loadContextHandler);
    fileOpsData.currentOpenFileBtn = elements.openFileBtn;
  } else {
    console.error(`[${windowId}] Open file button not found!`);
  }
  
  // Initialize Clear Context button
  if (elements.clearContextBtn) {
    elements.clearContextBtn.addEventListener('click', fileOpsData.clearContextHandler);
    fileOpsData.currentClearContextBtn = elements.clearContextBtn;
  } else {
    console.error(`[${windowId}] Clear context button not found!`);
  }
  
  console.log(`[${windowId}] ✅ File operations initialized`);
  
  // Mark as initialized
  fileOpsData.fileOperationsInitialized = true;
  window[FILE_OPS_KEY] = fileOpsData;
}

async function loadContextFile() {
  try {
    addMessageToUI('system', 'Opening file dialog...');
    
    const file = await ipcRenderer.invoke('open-file-dialog');
    
    if (!file) {
      addMessageToUI('system', 'File selection cancelled.');
      return;
    }
    
    if (file.error) {
      addMessageToUI('system', `Error opening file: ${file.error}`);
      console.error('File error:', file.error);
      return;
    }
    
    addMessageToUI('system', `Context file loaded: ${file.name}`);
    
    // Check if file needs backend processing (Excel, PDF, HTML)
    const fileExt = file.name.split('.').pop().toLowerCase();
    const needsProcessing = ['xlsx', 'xls', 'pdf', 'html', 'htm'].includes(fileExt);
    
    let processedFile = file;
    
    if (needsProcessing) {
      try {
        addMessageToUI('system', `Processing ${fileExt.toUpperCase()} file...`);
        
        // Send file to backend for processing
        const response = await fetch('http://127.0.0.1:5000/api/process-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            fileName: file.name,
            filePath: file.path,
            content: file.content, // This might be base64 for binary files
            session_id: state.sessionId
          })
        });

        if (!response.ok) {
          throw new Error(`Backend responded with status: ${response.status}`);
        }

        const processedData = await response.json();
        
        if (processedData.success) {
          // Use the processed content
          processedFile = {
            name: processedData.fileName,
            path: processedData.filePath,
            content: processedData.content
          };
          addMessageToUI('system', `File processed successfully. Extracted ${processedData.content.length} characters.`);
        } else {
          throw new Error(processedData.error || 'Failed to process file');
        }
        
      } catch (error) {
        console.error('Error processing file:', error);
        addMessageToUI('system', `Warning: Could not process file on backend (${error.message}). Using raw content.`);
        // Continue with original file content
      }
    }
    
    // Add file to context display immediately
    // addContextFileToDisplay(processedFile, false); // Removed: using Data Lake instead
    
    // Try to send file to backend as context
    let backendSaved = false;
    try {
      addMessageToUI('system', 'Saving context to backend...');
      
      const response = await fetch('http://127.0.0.1:5000/api/file-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileName: processedFile.name,
          filePath: processedFile.path,
          content: processedFile.content,
          session_id: state.sessionId,
          action: 'load_context'
        })
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      addMessageToUI('system', data.message);
      backendSaved = true;
      
      // Update the context file to mark it as backend saved - removed since using Data Lake
      // const contextFile = state.loadedContextFiles.find(f => f.name === processedFile.name);
      // if (contextFile) {
      //   contextFile.backendSaved = true;
      //   updateContextFilesDisplay();
      // }
    } catch (error) {
      console.error('Error saving context to backend:', error);
      addMessageToUI('system', 'Warning: Could not save to backend (backend may not be running). File still available for display.');
    }
    
    // Always show the display choice dialog, regardless of backend status
    showDisplayChoiceDialog(processedFile, backendSaved);
    
  } catch (error) {
    console.error('Error loading context file:', error);
    addMessageToUI('system', `Error loading context file: ${error.message}`);
  }
}

function showDisplayChoiceDialog(file, backendSaved) {
  // Create a modal dialog
  const dialog = document.createElement('div');
  dialog.className = 'display-choice-dialog';
  
  const backendStatus = backendSaved 
    ? 'Context saved successfully to backend.' 
    : 'Context available locally (backend not connected).';
    
  dialog.innerHTML = `
    <div class="dialog-overlay">
      <div class="dialog-content">
        <h3>Context File Loaded</h3>
        <p>${backendStatus}</p>
        <p>What would you like to do with <strong>${file.name}</strong>?</p>
        <div class="dialog-actions">
          <button id="display-context-btn" class="btn-primary">Display in Preview</button>
          <button id="add-to-data-lake-btn" class="btn-primary">Add to Data Lake</button>
          <button id="keep-hidden-btn" class="btn-secondary">Keep Hidden</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Add event listeners with unique IDs to avoid conflicts
  const displayBtn = document.getElementById('display-context-btn');
  const dataLakeBtn = document.getElementById('add-to-data-lake-btn');
  const hideBtn = document.getElementById('keep-hidden-btn');
  
  if (displayBtn) {
    displayBtn.addEventListener('click', () => {
      displayContextInPreview(file);
      document.body.removeChild(dialog);
    });
  }
  
  if (dataLakeBtn) {
    dataLakeBtn.addEventListener('click', async () => {
      console.log('🔍 DEBUG: Add to Data Lake button clicked');
      console.log('🔍 DEBUG: File object being added:', file);
      
      // Add file to data lake
      const result = await addToDataLake(file);
      console.log('🔍 DEBUG: addToDataLake result:', result);
      
      // Generate the same reference name that data lake uses
      const referenceName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').toLowerCase();
      
      addMessageToUI('system', `${file.name} added to Data Lake. Reference it with $${referenceName}`);
      document.body.removeChild(dialog);
    });
  }
  
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      addMessageToUI('system', 'Context file loaded but not displayed. Use chat to reference the context.');
      document.body.removeChild(dialog);
    });
  }
  
  // Add click outside to close
  const overlay = dialog.querySelector('.dialog-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(dialog);
      }
    });
  }
}

function displayContextInPreview(file) {
  // Detect file format and render accordingly
  const fileExt = file.name.split('.').pop().toLowerCase();
  let renderedContent = '';
  
  switch (fileExt) {
    case 'md':
    case 'markdown':
      renderedContent = renderMarkdown(file.content);
      break;
    case 'html':
    case 'htm':
      renderedContent = renderHTML(file.content);
      break;
    case 'csv':
      renderedContent = renderCSV(file.content);
      break;
    case 'pdf':
      renderedContent = renderPDF(file);
      break;
    case 'json':
      renderedContent = renderJSON(file.content);
      break;
    default:
      renderedContent = renderPlainText(file.content);
  }
  
  // Display in preview panel
  elements.previewContent.innerHTML = `
    <div class="context-file-header">
      <h2>📄 Context File: ${file.name}</h2>
      <p class="file-path">${file.path}</p>
      <p class="file-type">Format: ${fileExt.toUpperCase()}</p>
    </div>
    <div class="context-file-content">
      ${renderedContent}
    </div>
  `;
  
  // Re-attach event listeners to highlighted text after content update
  refreshHighlightEventListeners();
  
  // Switch to preview mode
  switchToPreview();
  addMessageToUI('system', `Context file displayed in preview: ${file.name}`);
}

// Format renderers
function renderMarkdown(content) {
  // Use marked.js if available, otherwise fall back to simple formatting
  if (typeof marked !== 'undefined') {
    try {
      // Configure marked for file content
      marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false,
        silent: true
      });
      
      const html = marked.parse(content);
      return `<div class="markdown-content">${html}</div>`;
    } catch (error) {
      console.error('Error parsing markdown:', error);
      // Fall through to simple formatting
    }
  }
  
  // Simple fallback formatting when marked.js is not available
  let html = content
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  
  // Wrap list items
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  
  return `<div class="markdown-content">${html}</div>`;
}

function renderHTML(content) {
  // Sanitize and render HTML content
  return `<div class="html-content">${content}</div>`;
}

function renderCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return '<p>Empty CSV file</p>';
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()));
  
  let tableHTML = '<table class="csv-table"><thead><tr>';
  headers.forEach(header => {
    tableHTML += `<th>${escapeHtml(header)}</th>`;
  });
  tableHTML += '</tr></thead><tbody>';
  
  rows.forEach(row => {
    tableHTML += '<tr>';
    row.forEach(cell => {
      tableHTML += `<td>${escapeHtml(cell)}</td>`;
    });
    tableHTML += '</tr>';
  });
  
  tableHTML += '</tbody></table>';
  return `<div class="csv-content">${tableHTML}</div>`;
}

function renderPDF(file) {
  // For PDF, we'll show a placeholder and link
  return `
    <div class="pdf-content">
      <div class="pdf-placeholder">
        <h3>📄 PDF File</h3>
        <p>PDF content cannot be displayed directly in preview.</p>
        <p><strong>File:</strong> ${file.name}</p>
        <p><strong>Path:</strong> ${file.path}</p>
        <p>The PDF content has been sent to the backend for context processing.</p>
      </div>
    </div>
  `;
}

function renderJSON(content) {
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);
    return `<div class="json-content"><pre><code>${escapeHtml(formatted)}</code></pre></div>`;
  } catch (error) {
    return `<div class="json-content"><p>Error parsing JSON: ${error.message}</p><pre>${escapeHtml(content)}</pre></div>`;
  }
}

function renderPlainText(content) {
  return `<div class="plain-text-content"><pre>${escapeHtml(content)}</pre></div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function clearFileContext() {
  try {
    addMessageToUI('system', 'Clearing context...');
    
    const response = await fetch(`http://127.0.0.1:5000/api/file-context?session_id=${state.sessionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    addMessageToUI('system', data.message);
    
    // Clear the context files display - removed since using Data Lake
    // state.loadedContextFiles = [];
    // updateContextFilesDisplay();
  } catch (error) {
    console.error('Error clearing context:', error);
    addMessageToUI('system', 'Error: Failed to clear context. Make sure the backend is running.');
  }
}

// Function to reset initialization flag (for DocumentManager)
export function resetFileOperationsInitialization() {
  // Clean up existing event listeners before resetting
  if (fileOpsData.loadContextHandler && fileOpsData.currentOpenFileBtn) {
    console.log(`[${windowId}] 🧹 Cleaning up open file event listener during reset`);
    fileOpsData.currentOpenFileBtn.removeEventListener('click', fileOpsData.loadContextHandler);
  }
  if (fileOpsData.clearContextHandler && fileOpsData.currentClearContextBtn) {
    console.log(`[${windowId}] 🧹 Cleaning up clear context event listener during reset`);
    fileOpsData.currentClearContextBtn.removeEventListener('click', fileOpsData.clearContextHandler);
  }
  
  fileOpsData.fileOperationsInitialized = false;
  fileOpsData.loadContextHandler = null;
  fileOpsData.clearContextHandler = null;
  fileOpsData.currentOpenFileBtn = null;
  fileOpsData.currentClearContextBtn = null;
  window[FILE_OPS_KEY] = fileOpsData;
}