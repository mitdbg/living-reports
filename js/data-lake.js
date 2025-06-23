// Data Lake Module
import { state, elements, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';

// Data Lake state
let dataLake = [];

// Get current document ID from DocumentManager
function getCurrentDocumentId() {
  return window.documentManager?.activeDocumentId || null;
}

// Set current document ID and load data lake
export async function loadDataLake(documentId) {
  console.log(`[${windowId}] Loading Data Lake for document: ${documentId}`);
  await loadDataLakeForCurrentDocument();
}

// Load data lake for current document from backend
async function loadDataLakeForCurrentDocument() {
  const currentDocumentId = getCurrentDocumentId();
  
  if (!currentDocumentId) {
    console.warn(`[${windowId}] Cannot load data lake: no current document set`);
    return;
  }
  
  console.log(`[${windowId}] 🔍 DEBUG: loadDataLakeForCurrentDocument called`);
  console.log(`[${windowId}] Loading Data Lake from backend for document: ${currentDocumentId}`);
  
  try {
    const response = await fetch(`http://127.0.0.1:5000/api/data-lake?documentId=${currentDocumentId}&windowId=${windowId}&session_id=${state.sessionId || windowId}`);
    
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[${windowId}] 🔍 DEBUG: Backend response:`, result);
    
    if (result.success && result.dataLake) {
      dataLake = result.dataLake;
      console.log(`[${windowId}] ✅ Loaded ${dataLake.length} items from backend for document ${currentDocumentId}`);
      console.log(`[${windowId}] 🔍 DEBUG: Loaded dataLake:`, dataLake);
    } else {
      dataLake = [];
      console.log(`[${windowId}] No data lake found in backend for document ${currentDocumentId}, starting fresh`);
    }
    
  } catch (error) {
    console.error(`[${windowId}] ❌ Error loading data lake from backend:`, error);
    dataLake = [];
    console.log(`[${windowId}] Starting with empty data lake due to backend error`);
  }
  
  console.log(`[${windowId}] 🔍 DEBUG: Final dataLake array:`, dataLake);
  console.log(`[${windowId}] 🔍 DEBUG: Final dataLake length:`, dataLake.length);
}

// Save data lake for current document to backend
async function saveDataLake() {
  const currentDocumentId = getCurrentDocumentId();
  
  if (!currentDocumentId) {
    console.warn(`[${windowId}] Cannot save data lake: no current document set`);
    return;
  }
  
  console.log(`[${windowId}] 🔍 DEBUG: saveDataLake - saving to backend for document: ${currentDocumentId}`);
  console.log(`[${windowId}] 🔍 DEBUG: saveDataLake - saving dataLake:`, dataLake);
  
  try {
    const response = await fetch('http://127.0.0.1:5000/api/data-lake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        documentId: currentDocumentId,
        windowId: windowId,
        dataLake: dataLake,
        session_id: state.sessionId || windowId
      })
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[${windowId}] ✅ Saved ${dataLake.length} items to Data Lake backend for document ${currentDocumentId}`);
    console.log(`[${windowId}] Backend response:`, result.message);
    
  } catch (error) {
    console.error(`[${windowId}] ❌ Error saving data lake to backend:`, error);
  }
}

// Initialize Data Lake
export function initDataLake() {
  console.log(`[${windowId}] Initializing Data Lake`);
  
  // Set up event listeners for Data Lake button in document context
  setupDataLakeEventListeners();
  
  console.log(`[${windowId}] Data Lake initialized`);
}

// Set up Data Lake event listeners
function setupDataLakeEventListeners() {
  // Listen for Data Lake buttons (since they are dynamically created)
  document.addEventListener('click', (event) => {
    if (event.target.matches('.data-lake-btn') || event.target.closest('.data-lake-btn')) {
      console.log(`[${windowId}] Data Lake button clicked`);
      showDataLakeDialog();
    }
  });
  
  // Dialog event listeners
  document.addEventListener('click', (event) => {
    if (event.target.id === 'close-data-lake-btn' || event.target.id === 'close-data-lake-bottom-btn') {
      hideDataLakeDialog();
    }
    

    
    if (event.target.matches('.data-item-btn.remove-btn')) {
      const itemId = event.target.getAttribute('data-item-id');
      removeDataItem(itemId);
    }
  });
  
  // Search functionality
  document.addEventListener('input', (event) => {
    if (event.target.id === 'data-lake-search') {
      filterDataLakeItems(event.target.value);
    }
  });
}

// Initialize Data Lake UI components (legacy - now handled by dynamic dialog creation)
function initDataLakeUI() {
  // This function is now obsolete since we create dialogs dynamically
  // All event listeners are handled in setupDataLakeEventListeners
  console.log('initDataLakeUI: Using dynamic dialog creation instead of static elements');
}

// Add item to Data Lake
export async function addToDataLake(file) {
  const currentDocumentId = getCurrentDocumentId();
  
  console.log(`[${windowId}] 🔍 DEBUG: addToDataLake called with file:`, file);
  console.log(`[${windowId}] 🔍 DEBUG: currentDocumentId:`, currentDocumentId);
  
  if (!currentDocumentId) {
    console.warn(`[${windowId}] Cannot add to data lake: no current document set`);
    return false;
  }
  
  console.log(`[${windowId}] Adding to Data Lake for document ${currentDocumentId}:`, file.name);
  
  // Generate clean reference name from filename
  const referenceName = generateDataLakeName(file.name);
  
  const dataItem = {
    id: Date.now().toString(),
    name: file.name,
    referenceName: referenceName, // Add clean reference name
    type: file.type || 'unknown',
    size: file.size || 0,
    content: file.content || '',
    filePath: file.path || '', // Add file path
    addedAt: new Date().toISOString(),
    documentId: currentDocumentId
  };
  
  console.log(`[${windowId}] 🔍 DEBUG: Created dataItem:`, dataItem);
  
  // Check if item already exists
  const existingIndex = dataLake.findIndex(item => item.name === dataItem.name);
  if (existingIndex !== -1) {
    dataLake[existingIndex] = dataItem; // Update existing
    console.log(`[${windowId}] Updated existing item in Data Lake: ${dataItem.name}`);
  } else {
    dataLake.push(dataItem);
    console.log(`[${windowId}] Added new item to Data Lake: ${dataItem.name}`);
  }
  
  console.log(`[${windowId}] 🔍 DEBUG: dataLake array after adding:`, dataLake);
  console.log(`[${windowId}] 🔍 DEBUG: dataLake length:`, dataLake.length);
  
  await saveDataLake(); // Save to backend
  return true;
}

// Remove item from Data Lake
async function removeDataItem(itemId) {
  const index = dataLake.findIndex(item => item.id === itemId);
  if (index !== -1) {
    const removedItem = dataLake.splice(index, 1)[0];
    console.log(`[${windowId}] Removed from Data Lake: ${removedItem.name}`);
    await saveDataLake(); // Save updated data lake to backend
    refreshDataLakeDialog();
  }
}



// Set up event listeners for the data lake dialog
function setupDataLakeDialogEventListeners(dialog) {
  console.log('Setting up data lake dialog event listeners');
  
  // Use event delegation on the dialog itself
  dialog.addEventListener('click', (e) => {
    // Get document-specific button elements for comparison
    const closeBtn = getDocumentElement('close-data-lake-btn');
    const closeBottomBtn = getDocumentElement('close-data-lake-bottom-btn');
    
    if (e.target === closeBtn || e.target.id === closeBtn?.id ||
        e.target === closeBottomBtn || e.target.id === closeBottomBtn?.id) {
      hideDataLakeDialog();
    } else if (e.target.matches('.data-item-btn.remove-btn')) {
      const itemId = e.target.getAttribute('data-item-id');
      removeDataItem(itemId);
    } else if (e.target.classList.contains('dialog-overlay')) {
      hideDataLakeDialog();
    }
  });
  
  // Add click handler for data lake items (to show content preview)
  dialog.addEventListener('click', (e) => {
    // Check if clicked on a data lake item but not on the buttons
    const dataLakeItem = e.target.closest('.data-lake-item');
    if (dataLakeItem && !e.target.matches('.data-item-btn') && !e.target.closest('.data-item-btn')) {
      const itemId = dataLakeItem.getAttribute('data-item-id');
      showDatasetContentPreview(itemId);
    }
  });
  
  // Set up search input listener
  const searchInput = getDocumentElement('data-lake-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterDataLakeItems(e.target.value);
    });
  }
}

// Show Data Lake dialog
function showDataLakeDialog() {
  const currentDocumentId = getCurrentDocumentId();
  
  console.log(`[${windowId}] 🔍 DEBUG: showDataLakeDialog called`);
  console.log(`[${windowId}] 🔍 DEBUG: currentDocumentId:`, currentDocumentId);
  
  if (!currentDocumentId) {
    alert('Please select a document first');
    return;
  }
  
  console.log(`[${windowId}] 🔍 DEBUG: dataLake array at dialog open:`, dataLake);
  console.log(`[${windowId}] 🔍 DEBUG: dataLake length:`, dataLake.length);
  
  const dialog = getOrCreateDataLakeDialog();
  if (dialog) {
    dialog.style.display = 'flex';
    refreshDataLakeDialog();
  } else {
    console.error(`[${windowId}] 🔍 DEBUG: data-lake-dialog element not found!`);
  }
}

// Hide Data Lake dialog
function hideDataLakeDialog() {
  const dialog = getDocumentElement('data-lake-dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

// Refresh Data Lake dialog content
function refreshDataLakeDialog() {
  console.log(`[${windowId}] 🔍 DEBUG: refreshDataLakeDialog called`);
  
  const itemsContainer = getDocumentElement('data-lake-items');
  const noDataMessage = getDocumentElement('no-data-message');
  
  console.log(`[${windowId}] 🔍 DEBUG: itemsContainer found:`, !!itemsContainer);
  console.log(`[${windowId}] 🔍 DEBUG: noDataMessage found:`, !!noDataMessage);
  console.log(`[${windowId}] 🔍 DEBUG: dataLake array in refresh:`, dataLake);
  console.log(`[${windowId}] 🔍 DEBUG: dataLake length in refresh:`, dataLake.length);
  
  if (!itemsContainer) {
    console.error(`[${windowId}] 🔍 DEBUG: data-lake-items container not found!`);
    return;
  }
  
  // Clear existing items
  const existingItems = itemsContainer.querySelectorAll('.data-lake-item');
  console.log(`[${windowId}] 🔍 DEBUG: Found ${existingItems.length} existing items to remove`);
  existingItems.forEach(item => item.remove());
  
  if (dataLake.length === 0) {
    console.log(`[${windowId}] 🔍 DEBUG: No data in lake, showing no-data message`);
    if (noDataMessage) {
      noDataMessage.style.display = 'block';
    }
  } else {
    console.log(`[${windowId}] 🔍 DEBUG: Found ${dataLake.length} items, hiding no-data message and creating items`);
    if (noDataMessage) {
      noDataMessage.style.display = 'none';
    }
    
    dataLake.forEach((item, index) => {
      console.log(`[${windowId}] 🔍 DEBUG: Creating UI element for item ${index}:`, item);
      const itemElement = createDataLakeItemElement(item);
      itemsContainer.appendChild(itemElement);
    });
  }
}

// Create Data Lake item element
function createDataLakeItemElement(item) {
  console.log(`[${windowId}] 🔍 DEBUG: createDataLakeItemElement called for item:`, item);
  
  const itemElement = document.createElement('div');
  itemElement.className = 'data-lake-item';
  itemElement.setAttribute('data-item-id', item.id);
  
  const icon = getFileIcon(item.type);
  const formattedSize = formatFileSize(item.size);
  const formattedDate = formatDate(item.addedAt);
  
  itemElement.innerHTML = `
    <div class="data-item-info">
      <div class="data-item-icon">${icon}</div>
      <div class="data-item-details">
        <div class="data-item-name">${item.name}</div>
        <div class="data-item-reference">$${item.referenceName}</div>
        <div class="data-item-meta">
          <span>Type: ${item.type.toUpperCase()}</span>
          <span>Size: ${formattedSize}</span>
          <span>Added: ${formattedDate}</span>
          ${item.filePath ? `<span>Path: ${item.filePath}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="data-item-actions">
      <button class="data-item-btn remove-btn" data-item-id="${item.id}">
        Remove
      </button>
    </div>
  `;
  
  console.log(`[${windowId}] 🔍 DEBUG: Created item element:`, itemElement);
  return itemElement;
}

// Generate a clean name for data lake from filename
function generateDataLakeName(filename) {
  return filename.replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .toLowerCase();
}

// Get file extension
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

// Open Data Lake dialog
function openDataLakeDialog() {
  const dialog = getOrCreateDataLakeDialog();
  if (dialog) {
    dialog.style.display = 'flex';
    updateDataLakeDisplay();
    
    // Focus search input
    const searchInput = getDocumentElement('data-lake-search');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
  }
}

// Close Data Lake dialog
function closeDataLakeDialog() {
  const dialog = getDocumentElement('data-lake-dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

// Check if Data Lake dialog is open
function isDataLakeDialogOpen() {
  const dialog = getDocumentElement('data-lake-dialog');
  return dialog && dialog.style.display === 'flex';
}

// Update Data Lake display
function updateDataLakeDisplay() {
  const itemsContainer = getDocumentElement('data-lake-items');
  const noDataMessage = getDocumentElement('no-data-message');
  
  if (!itemsContainer) return;
  
  if (dataLake.length === 0) {
    itemsContainer.innerHTML = `
      <div class="no-data-message">
        <p>No data sources in your lake yet.</p>
        <p>Use "Load Context" to add files to your data lake.</p>
      </div>
    `;
    return;
  }
  
  const itemsHTML = dataLake.map(item => {
    const icon = getFileIcon(item.fileType);
    const formattedSize = formatFileSize(item.size);
    const formattedDate = formatDate(item.addedAt);
    
    return `
      <div class="data-lake-item" data-item-id="${item.id}">
        <div class="data-item-info">
          <div class="data-item-icon">${icon}</div>
          <div class="data-item-details">
            <div class="data-item-name">${item.name}</div>
            <div class="data-item-meta">
              <span>Type: ${item.fileType.toUpperCase()}</span>
              <span>Size: ${formattedSize}</span>
              <span>Added: ${formattedDate}</span>
              ${item.filePath ? `<span>Path: ${item.filePath}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="data-item-actions">
          <button class="data-item-btn remove-btn" onclick="removeFromDataLake('${item.id}')">
            Remove
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  itemsContainer.innerHTML = itemsHTML;
}

// Get file icon based on file type
function getFileIcon(fileType) {
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
    'xls': '📊',
    'pptx': '📽️',
    'ppt': '📽️'
  };
  
  return iconMap[fileType] || '📄';
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Filter data lake items
function filterDataLakeItems(searchTerm) {
  const items = document.querySelectorAll('.data-lake-item');
  items.forEach(item => {
    const name = item.querySelector('.data-item-name').textContent.toLowerCase();
    const meta = item.querySelector('.data-item-meta').textContent.toLowerCase();
    
    if (name.includes(searchTerm.toLowerCase()) || meta.includes(searchTerm.toLowerCase())) {
      item.classList.remove('filtered-out');
    } else {
      item.classList.add('filtered-out');
    }
  });
}

// Remove item from Data Lake
window.removeFromDataLake = function(itemId) {
  const itemIndex = dataLake.findIndex(item => item.id === parseFloat(itemId));
  if (itemIndex !== -1) {
    const itemName = dataLake[itemIndex].name;
    dataLake.splice(itemIndex, 1);
    saveDataLake();
    updateDataLakeDisplay();
    addMessageToUI('system', `Removed "${itemName}" from Data Lake`);
  }
};





// Get data source by name
export function getDataSource(name) {
  return dataLake.find(item => item.name === name);
}

// Get all data sources
export function getAllDataSources() {
  return [...dataLake];
}

// Show dataset content preview in floating window
function showDatasetContentPreview(itemId) {
  const item = dataLake.find(item => item.id === itemId);
  if (!item) {
    console.error('Data item not found:', itemId);
    return;
  }
  
  console.log(`[${windowId}] Showing content preview for:`, item.name);
  
  // Create floating preview window
  const previewDialog = createDatasetPreviewDialog(item);
  document.body.appendChild(previewDialog);
  
  // Show the dialog
  previewDialog.style.display = 'flex';
  
  // Focus on close button
  const closeBtn = previewDialog.querySelector('.close-btn');
  if (closeBtn) {
    setTimeout(() => closeBtn.focus(), 100);
  }
}

// Create dataset preview dialog
function createDatasetPreviewDialog(item) {
  const dialogId = `dataset-preview-${item.id}`;
  
  // Remove existing preview dialog if any
  const existingDialog = document.getElementById(dialogId);
  if (existingDialog) {
    existingDialog.remove();
  }
  
  const dialog = document.createElement('div');
  dialog.id = dialogId;
  dialog.className = 'dataset-preview-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  const content = document.createElement('div');
  content.className = 'dataset-preview-content';
  content.style.cssText = `
    background: white;
    border-radius: 8px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
  `;
  
  // Header
  const header = document.createElement('div');
  header.className = 'dataset-preview-header';
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  `;
  
  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0;
    color: #333;
    font-size: 18px;
    font-weight: 600;
  `;
  title.textContent = `📊 ${item.name}`;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s;
  `;
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', () => dialog.remove());
  closeBtn.addEventListener('mouseenter', () => closeBtn.style.backgroundColor = '#f0f0f0');
  closeBtn.addEventListener('mouseleave', () => closeBtn.style.backgroundColor = 'transparent');
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Content area
  const contentArea = document.createElement('div');
  contentArea.className = 'dataset-preview-body';
  contentArea.style.cssText = `
    padding: 20px;
    overflow: auto;
    flex: 1;
    min-height: 0;
  `;
  
  // Render content based on file type
  const renderedContent = renderDatasetContent(item);
  contentArea.innerHTML = renderedContent;
  
  content.appendChild(header);
  content.appendChild(contentArea);
  dialog.appendChild(content);
  
  // Close on overlay click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
  
  // Close on Escape key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      dialog.remove();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  
  return dialog;
}

// Render dataset content based on file type
function renderDatasetContent(item) {
  const fileExt = getFileExtension(item.name);
  let content = item.content || '';
  
  switch (fileExt) {
    case 'csv':
      return renderCSVContent(content);
    case 'json':
      return renderJSONContent(content);
    case 'txt':
    case 'md':
    case 'markdown':
      return renderTextContent(content);
    case 'html':
    case 'htm':
      return renderHTMLContent(content);
    default:
      return renderPlainContent(content);
  }
}

// Render CSV content as table
function renderCSVContent(content) {
  if (!content || content.trim() === '') {
    return '<p style="color: #666; font-style: italic;">No content available</p>';
  }
  
  try {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return '<p style="color: #666;">Empty CSV file</p>';
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim().replace(/"/g, '')));
    
    let tableHTML = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
    `;
    
    headers.forEach(header => {
      tableHTML += `<th style="border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; font-weight: 600;">${escapeHtml(header)}</th>`;
    });
    
    tableHTML += '</tr></thead><tbody>';
    
    // Limit to first 100 rows for performance
    const displayRows = rows.slice(0, 100);
    displayRows.forEach((row, index) => {
      const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
      tableHTML += `<tr style="background-color: ${bgColor};">`;
      row.forEach(cell => {
        tableHTML += `<td style="border: 1px solid #dee2e6; padding: 8px 12px;">${escapeHtml(cell)}</td>`;
      });
      tableHTML += '</tr>';
    });
    
    tableHTML += '</tbody></table>';
    
    if (rows.length > 100) {
      tableHTML += `<p style="margin-top: 10px; color: #666; font-style: italic;">Showing first 100 rows of ${rows.length} total rows</p>`;
    }
    
    tableHTML += '</div>';
    return tableHTML;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return `<div style="color: #dc3545; padding: 10px; background-color: #f8d7da; border-radius: 4px;">
      <strong>Error parsing CSV:</strong> ${error.message}<br>
      <details style="margin-top: 10px;">
        <summary>Raw content:</summary>
        <pre style="white-space: pre-wrap; font-size: 12px; margin-top: 5px;">${escapeHtml(content.substring(0, 1000))}${content.length > 1000 ? '...' : ''}</pre>
      </details>
    </div>`;
  }
}

// Render JSON content
function renderJSONContent(content) {
  if (!content || content.trim() === '') {
    return '<p style="color: #666; font-style: italic;">No content available</p>';
  }
  
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);
    return `<pre style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.4;">${escapeHtml(formatted)}</pre>`;
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return `<div style="color: #dc3545; padding: 10px; background-color: #f8d7da; border-radius: 4px;">
      <strong>Error parsing JSON:</strong> ${error.message}<br>
      <details style="margin-top: 10px;">
        <summary>Raw content:</summary>
        <pre style="white-space: pre-wrap; font-size: 12px; margin-top: 5px;">${escapeHtml(content.substring(0, 1000))}${content.length > 1000 ? '...' : ''}</pre>
      </details>
    </div>`;
  }
}

// Render text content
function renderTextContent(content) {
  if (!content || content.trim() === '') {
    return '<p style="color: #666; font-style: italic;">No content available</p>';
  }
  
  return `<pre style="white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; font-size: 14px;">${escapeHtml(content)}</pre>`;
}

// Render HTML content
function renderHTMLContent(content) {
  if (!content || content.trim() === '') {
    return '<p style="color: #666; font-style: italic;">No content available</p>';
  }
  
  return `<div style="border: 1px solid #dee2e6; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #f8f9fa; padding: 8px 12px; font-size: 12px; font-weight: 600; border-bottom: 1px solid #dee2e6;">Rendered HTML:</div>
    <div style="padding: 15px;">${content}</div>
  </div>`;
}

// Render plain content
function renderPlainContent(content) {
  if (!content || content.trim() === '') {
    return '<p style="color: #666; font-style: italic;">No content available</p>';
  }
  
  // Limit content length for display
  const displayContent = content.length > 5000 ? content.substring(0, 5000) + '...' : content;
  return `<pre style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.4; background-color: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto;">${escapeHtml(displayContent)}</pre>`;
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export for global access
window.dataLakeModule = {
  addToDataLake,
  getDataSource,
  getAllDataSources,
  removeFromDataLake: window.removeFromDataLake
};

// Function to reset data lake state (for DocumentManager)
export function resetDataLakeInitialization() {
  console.log(`[${windowId}] Resetting data lake initialization`);
  // Clear data lake array to force re-initialization
  dataLake = [];
}

// Create or get the data lake dialog with document-specific IDs
function getOrCreateDataLakeDialog() {
  let dialog = getDocumentElement('data-lake-dialog');
  
  if (!dialog) {
    const dialogHtml = `
      <div class="dialog-overlay">
        <div class="dialog-content data-lake-content">
          <div class="dialog-header">
            <h3>🗄️ Data Lake</h3>
            <button class="close-btn" id="close-data-lake-btn">✕</button>
          </div>
          
          <div class="data-lake-search">
            <input type="text" id="data-lake-search" placeholder="Search data sources..." />
          </div>
          
          <div class="data-lake-items" id="data-lake-items">
            <div class="no-data-message" id="no-data-message">
              <p>No data sources in your lake yet.</p>
              <p>Use "Load Context" to add files to your data lake.</p>
            </div>
          </div>
          
          <div class="dialog-actions">
            <button class="btn-secondary" id="close-data-lake-bottom-btn">Close</button>
          </div>
        </div>
      </div>
    `;

    console.log('Creating data lake dialog with document-specific IDs');
    
    // Create dialog with document-specific IDs (all IDs in HTML will be auto-prefixed and registered)
    dialog = createDocumentDialog('data-lake-dialog', dialogHtml, 'data-lake');
    dialog.className = 'data-lake-dialog';
    dialog.style.display = 'none';
    
    // Mark dialog as hidden by design to prevent auto-restoration when switching documents
    dialog.setAttribute('data-hidden-by-design', 'true');
    
    document.body.appendChild(dialog);

    // Set up event listeners for the new dialog
    setupDataLakeDialogEventListeners(dialog);
  }
  
  return dialog;
}