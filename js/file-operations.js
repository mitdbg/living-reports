// File Operations Module
import { elements, state, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { switchToPreview, switchToTemplate } from './modes.js';
import { refreshHighlightEventListeners } from './comments.js';
import { addToDataSources } from './data-source.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement } from './element-id-manager.js';
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
    
    const fileExt = file.name.split('.').pop().toLowerCase();
    const needsBackendProcessing = ['xlsx', 'xls', 'html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'].includes(fileExt);
    const isPowerPoint = ['pptx', 'ppt'].includes(fileExt);
    
    let processedFile = file;
    if (needsBackendProcessing) {
      try {
        addMessageToUI('system', `Processing ${file.name} file...`);
        
        // Send file to backend for processing
        const documentId = window.documentManager?.activeDocumentId || null;
        const response = await fetch('http://127.0.0.1:5000/api/process-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            fileName: file.name,
            filePath: file.path,
            content: file.content, // This might be base64 for binary files
            session_id: state.sessionId,
            document_id: documentId
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
            content: processedData.content,
            redirect_output_file_path: processedData.output_file_path,
          };
          addMessageToUI('system', `File processed successfully. Saved JSON file to ${processedData.output_file_path}`);
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
    // addContextFileToDisplay(processedFile, false); // Removed: using Data Sources instead
    
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
          redirect_output_file_path: processedFile.redirect_output_file_path,
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
  const currentDocumentId = window.documentManager?.activeDocumentId || null;
  
  if (!currentDocumentId) {
    console.warn('No active document found for choice dialog');
    // Fallback to a simple alert or create without document scoping
    alert(`Context file loaded: ${file.name}. Use chat to interact with the content.`);
    return;
  }

  const backendStatus = backendSaved 
    ? 'Context saved successfully to backend.' 
    : 'Context available locally (backend not connected).';
    
  const dialogHtml = `
    <div class="dialog-overlay">
      <div class="dialog-content">
        <h3>Context File Loaded</h3>
        <p>${backendStatus}</p>
        <p>What would you like to do with <strong>${file.name}</strong>?</p>
        <div class="dialog-actions">
          <button id="display-context-btn" class="btn-primary">Display in Preview</button>
          <button id="add-to-data-sources-btn" class="btn-primary">Add to Data Sources</button>
          <button id="keep-hidden-btn" class="btn-secondary">Keep Hidden</button>
        </div>
      </div>
    </div>
  `;
  
  // Create dialog with explicit document ID and register it
  const dialog = createDocumentDialog('display-choice-dialog', dialogHtml, 'file-operations', currentDocumentId);
  dialog.className = 'display-choice-dialog';
  
  document.body.appendChild(dialog);
  
  // Helper function to remove dialog and unregister elements
  const removeDialog = () => {
    // Unregister all elements created for this dialog
    const displayBtnId = createDocumentElementId('display-context-btn', currentDocumentId);
    const dataSourcesBtnId = createDocumentElementId('add-to-data-sources-btn', currentDocumentId);
    const hideBtnId = createDocumentElementId('keep-hidden-btn', currentDocumentId);
    const dialogId = createDocumentElementId('display-choice-dialog', currentDocumentId);
    
    // Unregister elements
    if (window.documentManager) {
      window.documentManager.constructor.unregisterDynamicElement(currentDocumentId, displayBtnId);
      window.documentManager.constructor.unregisterDynamicElement(currentDocumentId, dataSourcesBtnId);
      window.documentManager.constructor.unregisterDynamicElement(currentDocumentId, hideBtnId);
      window.documentManager.constructor.unregisterDynamicElement(currentDocumentId, dialogId);
    }
    
    // Remove from DOM
    if (dialog.parentNode) {
      document.body.removeChild(dialog);
    }
  };
  
  // Get elements using document-specific IDs
  const displayBtn = getDocumentElement('display-context-btn', currentDocumentId);
  const dataSourcesBtn = getDocumentElement('add-to-data-sources-btn', currentDocumentId);
  const hideBtn = getDocumentElement('keep-hidden-btn', currentDocumentId);
  
  if (displayBtn) {
    displayBtn.addEventListener('click', () => {
      displayContextInPreview(file);
      removeDialog();
    });
  }
  
  if (dataSourcesBtn) {
    dataSourcesBtn.addEventListener('click', async () => {
      // Add file to data lake
      const result = await addToDataSources(file);
      
      // Generate the same reference name that data sources uses
      const referenceName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').toLowerCase();
      
      addMessageToUI('system', `${file.name} added to Data Sources. Reference it with $${referenceName}`);
      removeDialog();
    });
  }
  
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      addMessageToUI('system', 'Context file loaded but not displayed. Use chat to reference the context.');
      removeDialog();
    });
  }
  
  // Add click outside to close
  const overlay = dialog.querySelector('.dialog-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        removeDialog();
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
      renderedContent = renderPDF(file.content);
      break;
    case 'json':
      renderedContent = renderJSON(file.content);
      break;
    case 'pptx':
    case 'ppt':
      renderedContent = renderPowerPoint(file);
      break;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'bmp':
    case 'tiff':
    case 'webp':
    case 'svg':
    case 'ico':
      renderedContent = renderImage(file);
      break;
    default:
      renderedContent = renderPlainText(file.content);
  }
  
  // Display in preview panel - show only the content without the header info box
  elements.previewContent.innerHTML = renderedContent;
  
  // Load content into template editor
  if (elements.templateEditor) {
    elements.templateEditor.innerHTML = renderedContent;
  }
  addMessageToUI('system', `Content loaded into both preview and template panels: ${file.name}`);
  
  // Re-attach event listeners to highlighted text after content update
  refreshHighlightEventListeners();
  
  // Switch to preview mode
  switchToPreview();
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

function renderPDF(content) {
  const containerId = `pdf-container-${Date.now()}`;
  
  // Create actual DOM element instead of just HTML string
  const container = document.createElement("div");
  container.id = containerId;
  container.className = "pdf-container";

  // Parse content if it's a string
  let pages = content;
  if (typeof content === 'string') {
    try {
      pages = JSON.parse(content);
    } catch (error) {
      console.error('Error parsing PDF content:', error);
      container.innerHTML = `<div class="pdf-error">Error parsing PDF content: ${error.message}</div>`;
      return `<div class="pdf-content">${container.outerHTML}</div>`;
    }
  }

  pages.forEach(page => {
    // Create page container with background image
    const pageDiv = document.createElement("div");
    pageDiv.className = "pdf-page";
    pageDiv.style.width = page.width + "px";
    pageDiv.style.height = page.height + "px";
    
    // Convert file path to HTTP URL for serving through backend
    const backgroundUrl = page.background.startsWith('database/') 
      ? `http://127.0.0.1:5000/api/serve-file/${page.background}`
      : `http://127.0.0.1:5000/api/serve-file/${page.background}`;
    
    pageDiv.style.backgroundImage = `url(${backgroundUrl})`;
    pageDiv.style.backgroundSize = "cover";
    pageDiv.style.position = "relative";

    // Loop over all elements on the page
    page.elements.forEach(el => {
      if (el.type === "text") {
        // Measure actual rendered width using a hidden span
        const measure = document.createElement("span");
        measure.style.position = "absolute";
        measure.style.visibility = "hidden";
        measure.style.whiteSpace = "nowrap";
        measure.style.fontSize = el.font_size + "px";
        measure.style.fontFamily = el.font;
        measure.textContent = el.text;
        document.body.appendChild(measure);
        const measuredWidth = measure.offsetWidth;
        document.body.removeChild(measure);

        // Choose the larger of original width or measured width
        const finalWidth = Math.max(el.width, measuredWidth);

        // Create editable text element
        const textDiv = document.createElement("div");
        textDiv.className = "text-box";
        textDiv.contentEditable = true;
        textDiv.textContent = el.text;

        Object.assign(textDiv.style, {
          position: "absolute",
          left: el.x + "px",
          top: el.y + "px",
          width: finalWidth + "px",
          height: el.height + "px",
          fontSize: el.font_size + "px",
          fontFamily: el.font,
          color: el.color,
          whiteSpace: "nowrap",      // Prevent line breaks
          overflow: "visible",       // Allow overflow if needed
          backgroundColor: "transparent",
          lineHeight: "1",           // Match PDF more closely
        });

        pageDiv.appendChild(textDiv);
      }
    });

    container.appendChild(pageDiv);
  });
  
  // Return the HTML string wrapped in pdf-content div
  return `<div class="pdf-content">${container.outerHTML}</div>`;
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

function renderImage(file) {
  // Check if this is a direct file upload (has fileUrl) or file URL stored in content
  if (file.isImageFile && file.fileUrl) {
    // Direct file upload - use the file URL
    return `<img src="${file.fileUrl}" alt="${file.name}" style="max-width: 100%; height: auto;" />`;
  } else if (file.content && (file.content.startsWith('/api/serve-file/') || file.content.startsWith('http://127.0.0.1:5000/api/serve-file/'))) {
    // File URL stored in content
    return `<img src="${file.content}" alt="${file.name}" style="max-width: 100%; height: auto;" />`;
  } else {
    // No valid file URL found
    return `<div class="image-error">⚠️ Unable to display image: ${file.name}</div>`;
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

// Client-side PPTX processing using PPTX2HTML
function processPPTXClientSide(file, callback) {
  // Create a worker to process the PPTX file
  const worker = new Worker('./js/pptx2html/worker.js');
  
  let htmlContent = '';
  let isProcessingComplete = false;
  
  worker.addEventListener('message', function(e) {
    const msg = e.data;
    
    switch(msg.type) {
      case "slide":
        htmlContent += msg.data;
        break;
      case "globalCSS":
        htmlContent += "<style>" + msg.data + "</style>";
        break;
      case "ExecutionTime":
        isProcessingComplete = true;
        // Processing complete, return the HTML content
        callback({
          success: true,
          content: htmlContent,
          processingTime: msg.data
        });
        worker.terminate();
        break;
      case "ERROR":
        console.error('PPTX Worker Error:', msg.data);
        callback({
          success: false,
          error: msg.data
        });
        worker.terminate();
        break;
      case "WARN":
        console.warn('PPTX Worker Warning:', msg.data);
        break;
      case "DEBUG":
        console.debug('PPTX Worker Debug:', msg.data);
        break;
      default:
        console.info('PPTX Worker Info:', msg.data);
    }
  }, false);
  
  // Convert base64 to ArrayBuffer
  const binaryString = atob(file.content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Send the file to the worker for processing
  worker.postMessage({
    "type": "processPPTX",
    "data": bytes.buffer
  });
}

function renderPowerPoint(file) {
  // Check if this is a PowerPoint file that needs client-side processing
  const fileExt = file.name.split('.').pop().toLowerCase();
  const isPowerPoint = ['pptx', 'ppt'].includes(fileExt);
  
  if (isPowerPoint && (file.content.includes('client-side processing') || file.content.includes('PPTX file ready') || file.content.startsWith('UEsD'))) {
    // Show loading message
    const loadingContent = `
      <div class="powerpoint-loading">
        <div class="loading-spinner">⏳</div>
        <h3>Processing PowerPoint File</h3>
        <p>Converting ${file.name} to HTML format...</p>
        <div class="loading-progress">
          <div class="progress-bar" id="pptx-progress-bar"></div>
        </div>
      </div>
    `;
    
    // Return loading content first
    setTimeout(() => {
      // Process the PPTX file client-side
      processPPTXClientSide(file, (result) => {
        if (result.success) {
                     // Update the preview with the processed content
           const processedContentForPreview = `
             <div class="pptx-presentation-wrapper">
               <div class="pptx-header">
                 <h2>📽️ ${file.name}</h2>
                 <p class="processing-info">Processed in ${result.processingTime}ms using PPTX2HTML</p>
               </div>
               <div class="pptx-content">
                 ${result.content}
               </div>
             </div>
           `;
           
           // Raw content for template (without headers)
           const rawContent = result.content;
          
                     // Update both preview and template content
           if (elements.previewContent) {
             elements.previewContent.innerHTML = processedContentForPreview;
           }
           
           // Also load into template panel (raw content only)
           if (elements.templateEditor) {
             elements.templateEditor.innerHTML = rawContent;
           }
        } else {
          // Show error message
          const errorContent = `
            <div class="powerpoint-error">
              <h3>❌ Error Processing PowerPoint</h3>
              <p>Failed to process ${file.name}: ${result.error}</p>
              <p>The file may be corrupted or in an unsupported format.</p>
            </div>
          `;
          
          if (elements.previewContent) {
            elements.previewContent.innerHTML = errorContent;
          }
        }
      });
    }, 100);
    
    return loadingContent;
  }
  
  // Check if content is already HTML (from new backend processing)
  if (file.content.includes('<div class="pptx-presentation">') || file.content.includes('<div class="pptx-presentation-wrapper">')) {
    // New rich HTML format (either custom or pptx2html) - display as-is
    return file.content;
  }
  
  // Fallback for old plain text format
  let formattedContent = file.content
    .replace(/^(Slide \d+:)$/gm, '<h2 class="slide-title">$1</h2>')
    .replace(/^(=+)$/gm, '<hr class="slide-separator">')
    .replace(/^(Layout: .+)$/gm, '<p class="layout-info"><em>$1</em></p>')
    .replace(/^(Text Box \d+:)$/gm, '<h3 class="text-box-title">$1</h3>')
    .replace(/^(Table \d+:)$/gm, '<h3 class="table-title">$1</h3>')
    .replace(/^(Image \d+:)$/gm, '<h3 class="image-title">$1</h3>')
    .replace(/^(-+)$/gm, '<hr class="section-separator">')
    .replace(/^(  Paragraph \d+.+)$/gm, '<p class="paragraph-info">$1</p>')
    .replace(/^(    \[.+\]: .+)$/gm, '<p class="formatting-info">$1</p>')
    .replace(/^(  Row \d+: .+)$/gm, '<p class="table-row">$1</p>')
    .replace(/^(SLIDE NOTES:)$/gm, '<h2 class="notes-title">$1</h2>')
    .replace(/\n/g, '<br>');
  
  return `
    <div class="powerpoint-content">
      <style>
        .powerpoint-loading {
          text-align: center;
          padding: 40px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .loading-spinner {
          font-size: 2em;
          margin-bottom: 20px;
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .loading-progress {
          width: 100%;
          height: 4px;
          background: #e0e0e0;
          border-radius: 2px;
          margin-top: 20px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #45a049);
          width: 0%;
          animation: progress 3s ease-in-out infinite;
        }
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        .powerpoint-error {
          text-align: center;
          padding: 40px;
          color: #d32f2f;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .pptx-presentation-wrapper {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .pptx-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          margin-bottom: 20px;
        }
        .pptx-header h2 {
          margin: 0 0 10px 0;
        }
        .processing-info {
          margin: 0;
          opacity: 0.9;
          font-size: 0.9em;
        }
        .powerpoint-content {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .slide-title {
          color: #2c5282;
          border-bottom: 2px solid #2c5282;
          padding-bottom: 5px;
          margin-top: 30px;
          margin-bottom: 15px;
        }
        .slide-separator {
          border: none;
          height: 2px;
          background: linear-gradient(to right, #2c5282, transparent);
          margin: 20px 0;
        }
        .layout-info {
          color: #666;
          font-style: italic;
          margin-bottom: 15px;
        }
        .text-box-title {
          color: #1a202c;
          margin-top: 20px;
          margin-bottom: 10px;
          font-size: 1.1em;
        }
        .table-title, .image-title {
          color: #2d3748;
          margin-top: 20px;
          margin-bottom: 10px;
          font-size: 1.1em;
        }
        .section-separator {
          border: none;
          height: 1px;
          background: #e2e8f0;
          margin: 15px 0;
        }
        .paragraph-info {
          margin-left: 20px;
          color: #4a5568;
          font-weight: 500;
        }
        .formatting-info {
          margin-left: 40px;
          color: #718096;
          font-size: 0.9em;
          font-style: italic;
        }
        .table-row {
          margin-left: 20px;
          font-family: monospace;
          background: #f7fafc;
          padding: 5px;
          border-radius: 3px;
        }
        .notes-title {
          color: #805ad5;
          border-bottom: 2px solid #805ad5;
          padding-bottom: 5px;
          margin-top: 40px;
          margin-bottom: 20px;
        }
      </style>
      ${formattedContent}
    </div>
  `;
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
    
    // Clear the context files display - removed since using Data Sources
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