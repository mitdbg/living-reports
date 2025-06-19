// Data Lake Module
import { state, elements, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';

// Data Lake state
let dataLake = [];
let autocompleteWidget = null;
let autocompletePosition = { x: 0, y: 0 };
let selectedAutocompleteIndex = -1;

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
  setupAutocompleteListeners();
  
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
    
    if (event.target.matches('.data-item-btn.insert-btn')) {
      const referenceName = event.target.getAttribute('data-reference-name');
      insertDataReference(referenceName);
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

// Check if element is editable (for autocomplete functionality)
function isEditableElement(element) {
  if (!element) return false;
  
  // Check for contenteditable elements
  if (element.contentEditable === 'true') {
    return true;
  }
  
  // Check for input fields and textareas
  const editableTypes = ['input', 'textarea'];
  if (editableTypes.includes(element.tagName.toLowerCase())) {
    return true;
  }
  
  // Check for template editors (specific to our app)
  if (element.classList.contains('template-editor') || 
      element.classList.contains('source-editor')) {
    return true;
  }
  
  return false;
}

// Set up autocomplete listeners
function setupAutocompleteListeners() {
  // Listen for $ character in editable elements
  document.addEventListener('keyup', (event) => {
    if (isEditableElement(event.target) && event.key === '$') {
      showAutocomplete(event.target, event);
    }
  });
  
  // Hide autocomplete on outside click
  document.addEventListener('click', (event) => {
    if (autocompleteWidget && !autocompleteWidget.contains(event.target)) {
      hideAutocomplete();
    }
  });
  
  // Handle autocomplete navigation
  document.addEventListener('keydown', (event) => {
    if (autocompleteWidget && autocompleteWidget.style.display !== 'none') {
      handleAutocompleteNavigation(event);
    }
  });
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
    } else if (e.target.matches('.data-item-btn.insert-btn')) {
      const referenceName = e.target.getAttribute('data-reference-name');
      insertDataReference(referenceName);
    } else if (e.target.matches('.data-item-btn.remove-btn')) {
      const itemId = e.target.getAttribute('data-item-id');
      removeDataItem(itemId);
    } else if (e.target.classList.contains('dialog-overlay')) {
      hideDataLakeDialog();
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
        </div>
      </div>
    </div>
    <div class="data-item-actions">
      <button class="data-item-btn insert-btn" data-reference-name="${item.referenceName}">
        Insert
      </button>
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
            </div>
          </div>
        </div>
        <div class="data-item-actions">
          <button class="data-item-btn insert-btn" onclick="insertDataReference('${item.name}')">
            Insert
          </button>
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
    const type = item.querySelector('.data-item-meta').textContent.toLowerCase();
    
    if (name.includes(searchTerm) || type.includes(searchTerm)) {
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

// Initialize autocomplete functionality
function initAutocomplete() {
  // Try to get autocomplete widget using document-specific ID first, fall back to global
  autocompleteWidget = getDocumentElement('autocomplete-widget') || document.getElementById('autocomplete-widget');
  
  // Add event listeners to all template editors (current and future)
  document.addEventListener('input', handleTemplateInput);
  document.addEventListener('keydown', handleAutocompleteNavigation);
  document.addEventListener('click', hideAutocomplete);
}

// Handle input in template editors
function handleTemplateInput(e) {
  // Check if this is a template editor
  if (!e.target.classList.contains('template-editor')) return;
  
  const editor = e.target;
  const text = editor.textContent;
  const selection = window.getSelection();
  
  if (selection.rangeCount === 0) return;
  
  const range = selection.getRangeAt(0);
  const cursorPosition = range.startOffset;
  
  // Find the position of the last '$' character before cursor
  const textBeforeCursor = text.substring(0, cursorPosition);
  const lastDollarIndex = textBeforeCursor.lastIndexOf('$');
  
  if (lastDollarIndex !== -1) {
    // Check if the '$' is at the beginning or preceded by whitespace/newline
    const charBeforeDollar = lastDollarIndex > 0 ? textBeforeCursor[lastDollarIndex - 1] : ' ';
    const isValidTrigger = /\s/.test(charBeforeDollar) || lastDollarIndex === 0;
    
    if (isValidTrigger) {
      // Get the text after '$' up to cursor
      const searchTerm = textBeforeCursor.substring(lastDollarIndex + 1);
      
      // Show autocomplete if there's no space after '$'
      if (!searchTerm.includes(' ') && !searchTerm.includes('\n')) {
        showAutocomplete(editor, lastDollarIndex, searchTerm);
        return;
      }
    }
  }
  
  // Hide autocomplete if not triggered
  hideAutocomplete();
}

// Show autocomplete widget
function showAutocomplete(editor, dollarPosition, searchTerm) {
  if (!autocompleteWidget || dataLake.length === 0) {
    hideAutocomplete();
    return;
  }
  
  // Filter data lake items based on search term (search by reference name)
  const filteredItems = dataLake.filter(item => 
    item.referenceName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (filteredItems.length === 0) {
    hideAutocomplete();
    return;
  }
  
  // Calculate position for autocomplete widget
  const editorRect = editor.getBoundingClientRect();
  const range = document.createRange();
  const textNode = editor.firstChild || editor;
  
  if (textNode.nodeType === Node.TEXT_NODE && dollarPosition < textNode.textContent.length) {
    range.setStart(textNode, dollarPosition);
    range.setEnd(textNode, dollarPosition + 1);
  } else {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  
  const rangeRect = range.getBoundingClientRect();
  
  autocompletePosition.x = rangeRect.left;
  autocompletePosition.y = rangeRect.bottom + 5;
  
  // Update autocomplete content
  updateAutocompleteContent(filteredItems, searchTerm);
  
  // Position and show autocomplete widget
  autocompleteWidget.style.left = autocompletePosition.x + 'px';
  autocompleteWidget.style.top = autocompletePosition.y + 'px';
  autocompleteWidget.style.display = 'block';
  
  selectedAutocompleteIndex = 0;
  updateAutocompleteSelection();
}

// Update autocomplete content
function updateAutocompleteContent(items, searchTerm) {
  const itemsContainer = autocompleteWidget.querySelector('.autocomplete-items');
  
  if (items.length === 0) {
    itemsContainer.innerHTML = '<div class="autocomplete-no-results">No matching data sources</div>';
    return;
  }
  
  const itemsHTML = items.map((item, index) => {
    const icon = getFileIcon(item.type);
    return `
      <div class="autocomplete-item" data-index="${index}" data-reference-name="${item.referenceName}">
        <div class="autocomplete-item-icon">${icon}</div>
        <div class="autocomplete-item-info">
          <div class="autocomplete-item-name">${item.referenceName}</div>
          <div class="autocomplete-item-type">${item.name}</div>
        </div>
      </div>
    `;
  }).join('');
  
  itemsContainer.innerHTML = itemsHTML;
  
  // Add click handlers
  const autocompleteItems = itemsContainer.querySelectorAll('.autocomplete-item');
  autocompleteItems.forEach(item => {
    item.addEventListener('click', () => {
      const dataName = item.dataset.referenceName;
      insertDataReference(dataName);
      hideAutocomplete();
    });
  });
}

// Update autocomplete selection
function updateAutocompleteSelection() {
  const items = autocompleteWidget.querySelectorAll('.autocomplete-item');
  items.forEach((item, index) => {
    if (index === selectedAutocompleteIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Handle autocomplete navigation
function handleAutocompleteNavigation(e) {
  if (!autocompleteWidget || autocompleteWidget.style.display === 'none') return;
  
  const items = autocompleteWidget.querySelectorAll('.autocomplete-item');
  
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
      updateAutocompleteSelection();
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
      updateAutocompleteSelection();
      break;
      
    case 'Enter':
      e.preventDefault();
      if (selectedAutocompleteIndex >= 0 && selectedAutocompleteIndex < items.length) {
        const selectedItem = items[selectedAutocompleteIndex];
        const dataName = selectedItem.dataset.referenceName;
        insertDataReference(dataName);
        hideAutocomplete();
      }
      break;
      
    case 'Escape':
      e.preventDefault();
      hideAutocomplete();
      break;
  }
}

// Hide autocomplete widget
function hideAutocomplete() {
  if (autocompleteWidget) {
    autocompleteWidget.style.display = 'none';
    selectedAutocompleteIndex = -1;
  }
}

// Insert data reference at cursor position
window.insertDataReference = function(referenceName) {
  // Find the currently active template editor
  let templateEditor = null;
  
  // Try to get the template editor from the active document
  if (window.documentManager?.activeDocumentId) {
    const container = document.getElementById(`document-${window.documentManager.activeDocumentId}`);
    templateEditor = container?.querySelector('.template-editor');
  }
  
  // Fallback to global template editor
  if (!templateEditor) {
    templateEditor = elements.templateEditor;
  }
  
  if (!templateEditor) {
    addMessageToUI('system', 'No template editor found');
    return;
  }
  
  // Check if the template editor currently has focus
  const templateHasFocus = document.activeElement === templateEditor || 
                          templateEditor.contains(document.activeElement);
  
  let insertAtCursor = false;
  let range = null;
  
  if (templateHasFocus) {
    // Template editor has focus, try to insert at cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
      // Check if the selection is actually within the template editor
      if (templateEditor.contains(range.commonAncestorContainer) || 
          templateEditor === range.commonAncestorContainer) {
        insertAtCursor = true;
      }
    }
  }
  
  if (!insertAtCursor) {
    // Either template editor doesn't have focus or no valid cursor position
    // Insert at the bottom of the template editor
    templateEditor.focus();
    range = document.createRange();
    range.selectNodeContents(templateEditor);
    range.collapse(false); // Collapse to end (bottom)
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  
  // Now insert the reference
  const text = templateEditor.textContent;
  const cursorPosition = range.startOffset;
  
  // Check if we're replacing a partial '$variable' or just inserting
  if (insertAtCursor) {
    const textBeforeCursor = text.substring(0, cursorPosition);
    const lastDollarIndex = textBeforeCursor.lastIndexOf('$');
    
    if (lastDollarIndex !== -1 && lastDollarIndex >= cursorPosition - 20) {
      // Replace from the '$' position
      const rangeToReplace = document.createRange();
      const textNode = templateEditor.firstChild || templateEditor;
      
      if (textNode.nodeType === Node.TEXT_NODE) {
        rangeToReplace.setStart(textNode, lastDollarIndex);
        rangeToReplace.setEnd(textNode, cursorPosition);
        rangeToReplace.deleteContents();
        rangeToReplace.insertNode(document.createTextNode(`$${referenceName}`));
      }
    } else {
      // Insert new reference at cursor
      range.deleteContents();
      range.insertNode(document.createTextNode(`$${referenceName}`));
    }
  } else {
    // Insert at bottom - add a newline if needed and then the reference
    const needsNewline = text.length > 0 && !text.endsWith('\n');
    const textToInsert = needsNewline ? `\n$${referenceName}` : `$${referenceName}`;
    
    range.deleteContents();
    range.insertNode(document.createTextNode(textToInsert));
  }
  
  // Move cursor after the inserted text
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  
  // Focus the template editor to ensure it's active
  templateEditor.focus();
  
  const location = insertAtCursor ? 'at cursor position' : 'at bottom of template';
  addMessageToUI('system', `Inserted data reference: $${referenceName} (${location})`);
  
  // Close data lake dialog if open
  hideDataLakeDialog();
};

// Get data source by name
export function getDataSource(name) {
  return dataLake.find(item => item.name === name);
}

// Get all data sources
export function getAllDataSources() {
  return [...dataLake];
}

// Export for global access
window.dataLakeModule = {
  addToDataLake,
  getDataSource,
  getAllDataSources,
  insertDataReference: window.insertDataReference,
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
    
    document.body.appendChild(dialog);

    // Set up event listeners for the new dialog
    setupDataLakeDialogEventListeners(dialog);
  }
  
  return dialog;
}