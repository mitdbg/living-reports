/**
 * Element ID Manager - Utility for creating document-specific element IDs
 * This ensures all modules can create elements that don't conflict across documents
 */

/**
 * Get the current active document ID
 * @returns {string|null} The active document ID or null if none
 */
function getCurrentDocumentId() {
  return window.documentManager?.activeDocumentId || null;
}

/**
 * Create a document-specific element ID
 * @param {string} elementName - The base element name (e.g., 'variable-name', 'share-dialog')
 * @param {string} docId - Optional document ID (uses active document if not provided)
 * @returns {string} The document-specific element ID
 */
export function createDocumentElementId(elementName, docId = null) {
  const documentId = docId || getCurrentDocumentId();
  if (!documentId) {
    console.warn(`No document ID available for element: ${elementName}. Using global ID.`);
    return elementName;
  }
  
  return `${documentId}-${elementName}`;
}

/**
 * Create an element with a document-specific ID and register it
 * @param {string} tagName - HTML tag name (e.g., 'div', 'input')
 * @param {string} elementName - Base element name for ID generation
 * @param {string} moduleSource - Module creating the element (e.g., 'variables', 'sharing')
 * @param {string} docId - Optional document ID (uses active document if not provided)
 * @returns {HTMLElement} The created element with document-specific ID
 */
export function createDocumentElement(tagName, elementName, moduleSource, docId = null) {
  const documentId = docId || getCurrentDocumentId();
  const element = document.createElement(tagName);
  const elementId = createDocumentElementId(elementName, documentId);
  
  element.id = elementId;
  
  // Register the element if we have a valid document ID
  if (documentId && window.documentManager) {
    window.documentManager.constructor.registerDynamicElement(documentId, elementId, moduleSource);
  }
  
  return element;
}

/**
 * Register an existing element as document-specific
 * @param {HTMLElement} element - The element to register
 * @param {string} moduleSource - Module that owns the element
 * @param {string} docId - Optional document ID (uses active document if not provided)
 */
export function registerElement(element, moduleSource, docId = null) {
  const documentId = docId || getCurrentDocumentId();
  
  if (documentId && element.id && window.documentManager) {
    window.documentManager.constructor.registerDynamicElement(documentId, element.id, moduleSource);
  }
}

/**
 * Unregister an element when it's manually removed
 * @param {string} elementId - The element ID to unregister
 * @param {string} docId - Optional document ID (uses active document if not provided)
 */
export function unregisterElement(elementId, docId = null) {
  const documentId = docId || getCurrentDocumentId();
  
  if (documentId && window.documentManager) {
    window.documentManager.constructor.unregisterDynamicElement(documentId, elementId);
  }
}

/**
 * Get an element by its base name for the current document
 * @param {string} elementName - Base element name
 * @param {string} docId - Optional document ID (uses active document if not provided)
 * @returns {HTMLElement|null} The element or null if not found
 */
export function getDocumentElement(elementName, docId = null) {
  const elementId = createDocumentElementId(elementName, docId);
  return document.getElementById(elementId);
}

/**
 * Create a dialog with document-specific IDs for all child elements
 * @param {string} dialogName - Base name for the dialog
 * @param {string} htmlContent - HTML content (IDs will be automatically prefixed)
 * @param {string} moduleSource - Module creating the dialog
 * @param {string} docId - Optional document ID (uses active document if not provided)
 * @returns {HTMLElement} The dialog element with all IDs prefixed
 */
export function createDocumentDialog(dialogName, htmlContent, moduleSource, docId = null) {
  const documentId = docId || getCurrentDocumentId();
  const dialog = createDocumentElement('div', dialogName, moduleSource, documentId);
  
  // Replace all id attributes in the HTML content with document-specific versions
  const prefixedHtml = htmlContent.replace(/id="([^"]+)"/g, (match, originalId) => {
    const prefixedId = createDocumentElementId(originalId, documentId);
    
    // Register each prefixed ID
    if (documentId && window.documentManager) {
      window.documentManager.constructor.registerDynamicElement(documentId, prefixedId, moduleSource);
    }
    
    return `id="${prefixedId}"`;
  });
  
  // Also update 'for' attributes in labels to match prefixed IDs
  const finalHtml = prefixedHtml.replace(/for="([^"]+)"/g, (match, originalFor) => {
    const prefixedFor = createDocumentElementId(originalFor, documentId);
    return `for="${prefixedFor}"`;
  });
  
  dialog.innerHTML = finalHtml;
  
  return dialog;
}

/**
 * Helper function to create a document-specific form with auto-prefixed IDs
 * @param {string} formName - Base name for the form
 * @param {Object} fields - Object describing form fields
 * @param {string} moduleSource - Module creating the form
 * @param {string} docId - Optional document ID
 * @returns {HTMLElement} Form element with document-specific IDs
 */
export function createDocumentForm(formName, fields, moduleSource, docId = null) {
  const documentId = docId || getCurrentDocumentId();
  const form = createDocumentElement('form', formName, moduleSource, documentId);
  
  Object.entries(fields).forEach(([fieldName, fieldConfig]) => {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'form-group';
    
    if (fieldConfig.label) {
      const label = document.createElement('label');
      const fieldId = createDocumentElementId(fieldName, documentId);
      label.setAttribute('for', fieldId);
      label.textContent = fieldConfig.label;
      fieldContainer.appendChild(label);
    }
    
    const field = createDocumentElement(fieldConfig.type || 'input', fieldName, moduleSource, documentId);
    if (fieldConfig.placeholder) field.placeholder = fieldConfig.placeholder;
    if (fieldConfig.value) field.value = fieldConfig.value;
    if (fieldConfig.options && field.tagName === 'SELECT') {
      fieldConfig.options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        field.appendChild(optionElement);
      });
    }
    
    fieldContainer.appendChild(field);
    form.appendChild(fieldContainer);
  });
  
  return form;
}

/**
 * Debugging helper - List all registered elements for current document
 */
export function debugListRegisteredElements() {
  const documentId = getCurrentDocumentId();
  if (!documentId || !window.documentManager) {
    console.log('No active document or DocumentManager not available');
    return;
  }
  
  const elements = window.documentManager.constructor.getRegisteredElements(documentId);
  console.log(`📋 Registered elements for document ${documentId}:`, elements);
  
  elements.forEach(({ elementId, moduleSource }) => {
    const element = document.getElementById(elementId);
    console.log(`  - ${elementId} (${moduleSource}): ${element ? 'EXISTS' : 'MISSING'}`);
  });
} 