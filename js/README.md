# 📋 Complete Guide to document-manager.js
*For Collaborators Adding New Modules*

## 🔑 Core Concepts

### 1. Multi-Document Architecture
The system supports multiple open documents simultaneously with complete isolation:
- Each document gets a unique documentId (e.g., alice-doc-1, bob-doc-2)
- Documents are managed in a Map: documentId → documentObject
- Only one document is "active" at a time (this.activeDocumentId)

### 2. Document-Specific Element Prefixing
**CRITICAL**: All DOM elements are prefixed with docId to avoid conflicts:
```javascript
// Original template element ID: 'template-editor' 
// Document-specific ID: 'alice-doc-1-template-editor'
// Another document's ID: 'bob-doc-2-template-editor'
```

### 3. Module Lifecycle Management
All modules are reset and reinitialized when switching documents to ensure clean state.

## 🔧 Key Methods for Module Developers

```javascript
// Get document-specific element ID
getDocumentElementId(docId, elementName)
// Example: getDocumentElementId('alice-doc-1', 'template-editor') 
// Returns: 'alice-doc-1-template-editor'

// Get document-specific element
getDocumentElement(docId, elementName)
// Example: getDocumentElement('alice-doc-1', 'template-editor')
// Returns: document.getElementById('alice-doc-1-template-editor')
```

### Dynamic Element Registration
```javascript
// Register elements created by your module
DocumentManager.registerDynamicElement(docId, elementId, moduleSource)
// Example: DocumentManager.registerDynamicElement('alice-doc-1', 'my-custom-dialog', 'myModule')

// Unregister when cleaning up
DocumentManager.unregisterDynamicElement(docId, elementId)
```

## 🚀 Adding a New Module: Step-by-Step Guide

### Step 1: Create Your Module File
### Step 2: Add Elements to Document Template in index.html (optional, as you can create dynamic elements)
### Step 3: Update ID Mapping in DocumentManager (optional, as you may don't want to add docID specific ID to the embedded elements)
### Step 4: Add Module to Initialization Chain
```javascript
// Add your reset function
resetMyModuleInitialization();

// Add your init function
initMyModule();
```

### Step 5: Import in DocumentManager
At the top of document-manager.js:
```javascript
import { initMyModule, resetMyModuleInitialization } from './my-new-module.js';
```

### Step 6: Handle Dynamic Elements (If Needed)
```javascript
// In your module, when creating dynamic elements:
function createCustomDialog(docId) {
  const dialog = document.createElement('div');
  dialog.id = `${docId}-my-custom-dialog`;
  
  // Register the element
  DocumentManager.registerDynamicElement(docId, dialog.id, 'myModule');
  
  document.body.appendChild(dialog);
  return dialog;
}
```

## ⚠️ Critical Best Practices

### 1. Always Use Document-Specific IDs for your TOP level DOM containers in your module. 
```javascript
import { getDocumentElement } from './element-id-manager.js';
my_container = getDocumentElement(...)
```

### 2. Always Implement Reset Functions
```javascript
// Required for clean module reinitialization
export function resetMyModuleInitialization() {
  initialized = false;
  // Clear any module-specific state
  moduleState = {};
  // Remove any global event listeners specific to your module
}
```

### 3. Handle Multiple Documents Gracefully
```javascript
// Store state per document
const moduleState = new Map(); // docId → state

export function initMyModule() {
  // Get current document ID
  const { state } = await import('./state.js');
  const currentDocId = documentManager.activeDocumentId;
  
  // Initialize state for this document if needed
  if (!moduleState.has(currentDocId)) {
    moduleState.set(currentDocId, {
      // Your document-specific state
    });
  }
}
```

### 4. Always register elements you create dynamically
```javascript
function createPopup(docId) {
  const popup = document.createElement('div');
  popup.id = `${docId}-my-popup`;
  
  // Register so it gets cleaned up automatically
  DocumentManager.registerDynamicElement(docId, popup.id, 'myModule');
  
  return popup;
}
```

### 5. Clean Event Listeners
```javascript
// Use event delegation or store references for cleanup
const eventListeners = new Map(); // docId → [listeners]

function addDocumentEventListener(docId, element, event, handler) {
  element.addEventListener(event, handler);
  
  if (!eventListeners.has(docId)) {
    eventListeners.set(docId, []);
  }
  eventListeners.get(docId).push({ element, event, handler });
}

export function resetMyModuleInitialization() {
  // Clean up event listeners for all documents
  eventListeners.forEach((listeners, docId) => {
    listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
  });
  eventListeners.clear();
}
```

## 🔄 Document Lifecycle Hooks

The DocumentManager provides several lifecycle methods you can hook into:

### Document Creation
- `createNewDocument()` → Creates new document and initializes all modules

### Document Switching
- `switchToDocument(docId)` → Deactivates current, activates target document
- `initializeDocumentFunctionality(docId)` → Resets and initializes all modules

### Document Closing
- `closeDocument(docId)` → Hides document but keeps in memory
- `hideAllElement(docId)` → Hides all document elements

### Document Deletion
- `deleteDocument(docId)` → Permanently removes document
- `cleanAllElement(docId)` → Removes all DOM elements and cleans up

# Variable System
Currently there are 3 palces to edit variables:

- Directly set values in Variable dialog
- Set operator/code for a variable in Variable diaglog
- In Operator page, add tools and operator for one or more variables.

No matter where you edit the variable, the interface will save the relevant data into backend, and when you load again, they will load from backend, so that they're consistent.