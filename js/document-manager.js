// Document Manager Module
import { state, elements, updateState, windowId } from './state.js';
import { initModes, resetModesInitialization, switchToTemplate, switchToPreview, switchToSource } from './modes.js';
import { initTemplateExecution, resetTemplateExecutionInitialization } from './template-execution.js';
import { initSourceExecution, resetSourceExecutionInitialization } from './source-execution.js';
import { initChat, initAskLLMButton, resetChatInitialization } from './chat.js';
import { initTextSelection, initCommentButtons, resetTextSelectionInitialization, resetCommentButtonsInitialization } from './comments.js';
import { initFileOperations, resetFileOperationsInitialization } from './file-operations.js';
import { initSharing, resetSharingInitialization } from './sharing.js';
import { initContentMapping, resetContentMappingInitialization } from './content-mapping.js';
import { variablesManager } from './variables.js';
import { hideAllAnnotations, clearAnnotationsForDocument, updateAnnotationsVisibility, refreshAnnotationElements } from './annotations.js';
import { clearAllComments } from './comments.js';
import { addMessageToUI } from './chat.js';
import { getCurrentUser } from './auth.js';
import { getTextContentWithLineBreaks } from './utils.js';
import { setCurrentDocument } from './data-lake.js';

// Export the class instead of singleton instance
export class DocumentManager {
  constructor() {
    this.documents = new Map();
    this.activeDocumentId = null;
    this.documentCounter = 0;
    this.tabList = null;
    this.newDocumentBtn = null;
    this.createDocumentBtn = null;
    this.documentList = null;
    this.mainPage = null;
    this.contentPanel = null;
    this.documentTitleInput = null;
    this.newDocumentDialog = null;
    this.recentDocuments = null;
    
    // Auto-save functionality
    this.autoSaveInterval = null;
    this.hasUnsavedChanges = false;
    this.saveStatusElement = null;
    
    // Comment change tracking
    this.commentChangeCheckInterval = null;
    this.lastCommentSnapshot = null;
    
    // Comment restoration tracking
    this.isRestoringComments = null;
    this.lastCommentRestorationTime = null;
    
    // Track if event delegation is set up
    this.documentListDelegationSetup = false;
    
    this.init();
  }

  async init() {
    // Clear old localStorage data on startup
    this.clearOldLocalStorageData();
    
    // Initialize DOM elements
    this.mainPage = document.getElementById('main-page');
    this.contentPanel = document.getElementById('content-panel');
    this.createDocumentBtn = document.getElementById('create-document-btn');
    this.documentList = document.getElementById('document-list');
    this.documentTitleInput = document.getElementById('document-title');
    this.newDocumentDialog = document.getElementById('new-document-dialog');
    this.tabList = document.getElementById('tab-list');
    this.newDocumentBtn = document.getElementById('new-document-btn');
    
    // Set up event listeners
    if (this.createDocumentBtn) {
      this.createDocumentBtn.addEventListener('click', () => {
        this.createNewDocument();
      });
    } else {
      console.error('Create document button not found!');
    }
    
    // Set up tab navigation
    if (this.tabList) {
      this.tabList.addEventListener('click', (e) => {
        this.handleTabClick(e);
      });
    }
    
    // Set up new document button in tab navigation
    if (this.newDocumentBtn) {
      this.newDocumentBtn.addEventListener('click', () => {
        this.createNewDocument();
      });
    }
    
    // Close dialog when clicking outside
    if (this.newDocumentDialog) {
      this.newDocumentDialog.addEventListener('click', (e) => {
        if (e.target === this.newDocumentDialog) {
          this.hideNewDocumentDialog();
        }
      });
    }
    
    // Handle Enter key in title input
    if (this.documentTitleInput) {
      this.documentTitleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.createNewDocument();
        }
      });
    }
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+S for manual save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.manualSave();
      }
    });
    
    // Set up event delegation for document list ONCE
    this.setupDocumentListEventDelegation();
    
    // Update document list display
    this.updateDocumentList();
  }

  /**
   * Set up event delegation for document list actions
   * This should only be called once to prevent event listener accumulation
   */
  setupDocumentListEventDelegation() {
    if (this.documentListDelegationSetup || !this.documentList) {
      return;
    }
    
    // Use event delegation on the document list container
    this.documentList.addEventListener('click', (e) => {
      const documentId = e.target.getAttribute('data-document-id');
      const action = e.target.getAttribute('data-action');
      
      if (action === 'open' && documentId) {
        this.openExistingDocument(documentId);
      } else if (action === 'delete' && documentId) {
        this.deleteDocument(documentId);
      } else if (action === 'share' && documentId) {
        this.shareDocument(documentId);
      } else if (e.target.closest('.document-item') && !action) {
        // Click on document item itself
        const item = e.target.closest('.document-item');
        const docId = item.getAttribute('data-document-id');
        if (docId) {
          this.openExistingDocument(docId);
        }
      }
    });
    
    this.documentListDelegationSetup = true;
    console.log('Document list event delegation set up');
  }

  /**
   * Clear old localStorage data related to documents
   * This removes any cached document data from previous sessions
   * while keeping user authentication data intact
   */
  clearOldLocalStorageData() {
    const keysToRemove = [];
    
    // Find all localStorage keys related to documents
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('easypipe_documents_')) {
        keysToRemove.push(key);
      }
    }
    
    // Remove old document data
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  }

  generateSessionId() {
    return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  showNewDocumentDialog() {
    if (this.newDocumentDialog) {
      this.newDocumentDialog.style.display = 'flex';
      if (this.documentTitleInput) {
        this.documentTitleInput.focus();
        this.documentTitleInput.value = '';
      }
    }
  }

  hideNewDocumentDialog() {
    if (this.newDocumentDialog) {
      this.newDocumentDialog.style.display = 'none';
    }
  }

  createNewDocument(title = null) {
    // Hide dialog if it was open
    this.hideNewDocumentDialog();
    
    // Get current user for ownership
    const currentUser = getCurrentUser();
    if (!currentUser) {
      console.error('No current user found, cannot create document');
      return null;
    }
    
    this.documentCounter++;
    // Generate globally unique document ID by including user ID
    const documentId = `${currentUser.id}-doc-${this.documentCounter}`;
    const sessionId = this.generateSessionId();
    const documentTitle = title || this.documentTitleInput?.value?.trim() || `Document ${this.documentCounter}`;
    
    const doc = {
      id: documentId,
      sessionId: sessionId,
      title: documentTitle,
      source_content: '',  // Content in code mode
      template_content: '',  // Content in template mode
      preview_content: '', // Content in preview mode
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      chatHistory: [],
      variables: {},
      contextFiles: [],
      author: currentUser.id, // Document author (creator)
      authorName: currentUser.name, // Author display name
      editors: [], // List of user IDs who can edit this document
      viewers: [], // List of user IDs who can view this document
      isShared: false, // Whether document is shared with others
      comments: {} // Unified comment structure: commentId -> comment object
    };
    
    // Store document
    this.documents.set(documentId, doc);
    
    // Create tab
    this.createTab(doc);
    
    // Create document content area
    this.createDocumentContent(doc);
    
    // Switch to new document
    this.switchToDocument(documentId);
    
    // Save new document to backend
    this.saveDocumentToBackend(documentId).then(success => {
      if (!success) {
        console.error(`Failed to save new document to backend: ${documentTitle}`);
      }
    });
    
    // Update document list
    this.updateDocumentList();
    
    return doc;
  }

  createTab(doc) {
    if (!this.tabList) {
      console.error('Tab list not found!');
      return;
    }
    
    // Check if tab already exists
    const existingTab = this.tabList.querySelector(`[data-tab="${doc.id}"]`);
    if (existingTab) {
      return;
    }
    
    // Create new tab
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.setAttribute('data-tab', doc.id);
    
    tabItem.innerHTML = `
      <span class="tab-title">📄 ${doc.title}</span>
      <span class="tab-close" data-close="${doc.id}">×</span>
    `;
    
    // Insert before the new document button (which should be after the tab list)
    this.tabList.appendChild(tabItem);
    
    // Set up close button handler
    const closeBtn = tabItem.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent tab click
        this.closeDocument(doc.id);
      });
    }
  }

  createDocumentContent(doc) {
    const template = document.getElementById('document-tab-template');
    if (!template) {
      console.error('Document tab template not found!');
      return;
    }
    
    const documentContent = template.cloneNode(true);
    
    // Update IDs to be unique for this document
    documentContent.id = `document-${doc.id}`;
    documentContent.className = 'tab-content';
    documentContent.style.display = 'none';

    // Update element targeting for this document
    this.updateElementIds(documentContent, doc.id);

    // Insert after the template
    template.parentNode.insertBefore(documentContent, template.nextSibling);

    // // Initialize functionality for this document immediately
    // this.initializeDocumentFunctionality(doc.id);
  }

  updateElementIds(container, documentId) {
    // Since we're using class selectors, we don't need to update IDs
    // But we should ensure the container has proper document-specific IDs for targeting
    // Just add a data attribute for document identification
    container.setAttribute('data-document-id', documentId);
  }

  initializeDocumentFunctionality(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) return;

    // Update state to use this document's session ID
    updateState({ sessionId: doc.sessionId });
    
    // Get document-specific elements
    const container = document.getElementById(`document-${documentId}`);
    if (!container) {
      console.error('Document container not found:', `document-${documentId}`);
      return;
    }
    
    // Import elements state synchronously and update it
    import('./state.js').then(({ elements }) => {
      // Update global elements to point to this document's elements
      elements.sourceModeBtn = container.querySelector('.source-mode-btn');
      elements.templateModeBtn = container.querySelector('.template-mode-btn');
      elements.previewModeBtn = container.querySelector('.preview-mode-btn');
      elements.executeSourceBtn = container.querySelector('.execute-source-btn');
      elements.executeTemplateBtn = container.querySelector('.execute-template-btn');
      elements.executionStatus = container.querySelector('.execution-status');
      elements.sourceExecutionStatus = container.querySelector('.source-execution-status');
      elements.templateExecutionStatus = container.querySelector('.template-execution-status');
      elements.sendButton = container.querySelector('.send-button');
      elements.clearChatBtn = container.querySelector('.clear-chat-btn');
      elements.messageInput = container.querySelector('.message-input');
      elements.chatMessages = container.querySelector('.chat-messages');
      elements.previewContent = container.querySelector('.preview-content');
      elements.sourceEditor = container.querySelector('.source-editor');
      elements.templateEditor = container.querySelector('.template-editor');
      elements.openFileBtn = container.querySelector('.open-file-btn');
      elements.clearContextBtn = container.querySelector('.clear-context-btn');
      elements.shareBtn = container.querySelector('.share-btn');
      elements.floatingComment = container.querySelector('.floating-comment');
      elements.commentText = container.querySelector('.comment-text');
      elements.askLLMBtn = container.querySelector('.ask-llm');
      elements.addCommentBtn = container.querySelector('.add-comment');
      elements.cancelCommentBtn = container.querySelector('.cancel-comment');
      elements.previewPanel = container.querySelector('.preview-panel');
      elements.sourcePanel = container.querySelector('.source-panel');
      elements.templatePanel = container.querySelector('.template-panel');
      elements.diffView = container.querySelector('.diff-view');
      elements.variablesDisplay = container.querySelector('.variables-display');
      elements.variablesList = container.querySelector('.variables-list');
      elements.acceptSuggestionBtn = container.querySelector('.accept-suggestion');
      elements.rejectSuggestionBtn = container.querySelector('.reject-suggestion');
      elements.diffCurrentContent = container.querySelector('.diff-current-content');
      elements.diffSuggestedContent = container.querySelector('.diff-suggested-content');
      elements.clearCommentsBtn = container.querySelector('.clear-comments-btn');
      elements.contextFilesSection = container.querySelector('.context-files-section');
      elements.contextFilesList = container.querySelector('.context-files-list');
      elements.contentTitle = container.querySelector('#content-title') || container.querySelector('.content-title');
      
      // Determine if we need to initialize modules
      // We should always initialize modules when switching to a document
      // to ensure elements are properly connected to the current document's DOM
      const wasPreviouslyActive = this.activeDocumentId !== null;
      const isReopeningDocument = this.activeDocumentId === null && this.documentCounter > 0;
      
      // Track the active document
      this.activeDocumentId = documentId;
      
      // Always initialize modules to ensure proper element binding
      console.log(`🔄 Initializing modules for document: ${doc.title} (switch: ${wasPreviouslyActive}, reopen: ${isReopeningDocument})`);
      
      try {
        // Reset initialization flags first to allow clean reinitialization
        resetModesInitialization();
        resetTemplateExecutionInitialization();
        resetSourceExecutionInitialization();
        resetTextSelectionInitialization();
        resetCommentButtonsInitialization();
        resetChatInitialization();
        resetFileOperationsInitialization();
        resetSharingInitialization();
        resetContentMappingInitialization();

        
        // Now initialize all modules
        initModes();
        initTemplateExecution();
        initSourceExecution();
        initChat();
        initTextSelection();
        initCommentButtons();
        initAskLLMButton();
        initFileOperations();
        initSharing();
        initContentMapping();
        
        // Initialize variables manager once if not already initialized
        if (variablesManager && !variablesManager.initialized) {
          variablesManager.init();
        }
        
      } catch (error) {
        console.error(`Error initializing document functionality:`, error);
      }
      
      // Ensure the document is visible and in source mode by default
      if (elements.templatePanel && elements.previewPanel) {
        elements.sourcePanel.classList.remove('active');
        elements.templatePanel.classList.remove('active');
        elements.previewPanel.classList.remove('active');
        elements.templatePanel.classList.add('active');
        state.currentMode = 'template';
      }
      
    }).catch(error => {
      console.error('Error importing state module:', error);
    });
  }

  // Switch to a document tab
  async switchToDocument(documentId) {
    console.log(`[${windowId}] Switching to document:`, documentId);
    
    if (!this.documents.has(documentId)) {
      console.error(`[${windowId}] Document not found:`, documentId);
      return;
    }
    
    // Update state
    this.activeDocumentId = documentId;
    
    // Set current document for data lake
    await setCurrentDocument(documentId);
    
    // Update UI
    this.updateTabsUI();
    this.showDocumentContent(documentId);
    
    console.log(`[${windowId}] Switched to document:`, documentId);
  }

  // Update tab UI states
  updateTabsUI() {
    // Update tab active states
    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-tab="${this.activeDocumentId}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
    
    // Hide main page
    const mainTab = document.getElementById('main-tab');
    if (mainTab) {
      mainTab.classList.remove('active');
      mainTab.style.display = 'none';
    }
  }

  // Show document content
  showDocumentContent(documentId) {
    // Hide all other document contents
    document.querySelectorAll('.tab-content[data-document-id]').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none';
    });
    
    // Show selected document content
    const documentContent = document.getElementById(`document-${documentId}`);
    if (!documentContent) {
      console.error('Document content not found:', `document-${documentId}`);
      return;
    }
    
    documentContent.classList.add('active');
    documentContent.style.display = 'flex'; // Use flex for the new layout
    
    // Initialize document functionality
    this.initializeDocumentFunctionality(documentId);
    
    // Refresh and show annotations for this document after a short delay
    setTimeout(() => {
      refreshAnnotationElements();
      updateAnnotationsVisibility();
    }, 100);
    
    // Load verification status for this document
    setTimeout(async () => {
      try {
        const { loadDocumentVerification } = await import('./verification.js');
        await loadDocumentVerification();
        console.log(`✅ Verification status loaded for document ${documentId}`);
      } catch (error) {
        console.warn('Could not load verification status:', error);
      }
    }, 150);
    
    // Stop auto-save for previous document
    this.stopAutoSave();
    
    // Start auto-save for the new document (with small delay to ensure elements are ready)
    setTimeout(() => {
      this.startAutoSave();
    }, 500);
  }

  // Save current state
  saveState() {
    // This method can be implemented later if needed for state persistence
    // For now, it's a placeholder to prevent errors
  }

  closeDocument(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) return;
    
    console.log(`🗑️ Closing document: ${doc.title} (${documentId})`);
    
    // Step 1: Complete cleanup for the closing document if it's currently active
    if (this.activeDocumentId === documentId) {
      console.log('Performing complete cleanup for active document...');
      
      // Stop auto-save immediately
      this.stopAutoSave();
      
      // Clear all document-specific state and UI elements
      this.performCompleteDocumentCleanup(documentId).catch(error => {
        console.error('Error during document cleanup:', error);
      });

      // Reset all module initialization flags to ensure clean state
      resetModesInitialization();
      resetTemplateExecutionInitialization();
      resetSourceExecutionInitialization();
      resetTextSelectionInitialization();
      resetCommentButtonsInitialization();
      resetChatInitialization();
      resetFileOperationsInitialization();
      resetSharingInitialization();
      resetContentMappingInitialization();
    }
    
    // Step 2: Clear all annotations and comments specific to this document
    clearAnnotationsForDocument(documentId);
    
    // Step 3: Remove DOM elements
    console.log('Removing DOM elements...');
    
    // Remove tab
    const tab = document.querySelector(`[data-tab="${documentId}"]`);
    if (tab) {
      console.log('Removing tab element');
      tab.remove();
    }
    
    // Remove content container and all its children
    const content = document.getElementById(`document-${documentId}`);
    if (content) {
      console.log('Removing document content container');
      
      // Additional cleanup: remove any lingering event listeners on child elements
      this.removeAllEventListenersFromContainer(content);
      
      // Remove the entire container
      content.remove();
    }
    
    // Step 5: Determine where to switch if this was the active document
    if (this.activeDocumentId === documentId) {
      const remainingDocs = Array.from(this.documents.keys()).filter(id => id !== documentId);
      
      if (remainingDocs.length > 0) {
        console.log(`Switching to remaining document: ${remainingDocs[0]}`);
        // Verify the target document still exists in DOM before switching
        const targetExists = document.getElementById(`document-${remainingDocs[0]}`);
        if (targetExists) {
          this.switchToDocument(remainingDocs[0]);
        } else {
          this.switchToMain();
        }
      } else {
        console.log('No remaining documents, switching to main');
        this.switchToMain();
      }
    }
    
    // Step 6: Update document list (document still exists in backend/map for reopening)
    this.updateDocumentList();
    
    console.log(`✅ Document ${documentId} closed and cleaned up completely`);
  }

  /**
   * Perform complete cleanup of all document-specific state and UI elements
   */
  async performCompleteDocumentCleanup(documentId) {
    try {
      // Clear all comments from global state 
      // (this will be restored when document is reopened)
      const { state } = await import('./state.js');
      if (state.comments) {
        console.log(`Clearing ${Object.keys(state.comments).length} comments from global state`);
        state.comments = {};
        state.commentIdCounter = 0;
      }
      
      // Remove all floating annotation elements from DOM
      const annotations = document.querySelectorAll('.floating-annotation');
      console.log(`Removing ${annotations.length} floating annotations`);
      annotations.forEach(annotation => {
        annotation.remove();
      });
      
      // Remove all comment highlights from DOM
      const highlights = document.querySelectorAll('.text-comment-highlight');
      console.log(`Removing ${highlights.length} text highlights`);
      highlights.forEach(highlight => {
        highlight.replaceWith(document.createTextNode(highlight.textContent));
      });
      
    } catch (error) {
      console.error('Error during document cleanup:', error);
    }
  }

  /**
   * Remove all event listeners from a container and its children
   */
  removeAllEventListenersFromContainer(container) {
    try {
      // Clone and replace the container to remove all event listeners
      // This is the most reliable way to ensure all listeners are removed
      const parent = container.parentNode;
      const newContainer = container.cloneNode(true);
      
      // Don't actually replace - just log that we would clean up listeners
      // The container will be removed entirely anyway
      console.log('Event listeners would be cleaned up by container removal');
      
    } catch (error) {
      console.error('Error cleaning up event listeners:', error);
    }
  }

  switchToMain() {
    // Hide all annotation windows when switching to main page (but don't delete them)
    hideAllAnnotations();
    
    // Stop auto-save when switching to main
    this.stopAutoSave();
    
    // Update tab active states
    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.remove('active');
    });
    
    const mainTabItem = document.querySelector('[data-tab="main"]');
    if (mainTabItem) {
      mainTabItem.classList.add('active');
    }
    
    // Hide all document contents
    document.querySelectorAll('.tab-content[data-document-id]').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none';
    });
    
    // Show main tab content
    const mainTab = document.getElementById('main-tab');
    if (mainTab) {
      mainTab.classList.add('active');
      mainTab.style.display = 'flex'; // Use flex for the new layout
    }
    
    this.activeDocumentId = null;
  }

  handleTabClick(e) {
    const tabItem = e.target.closest('.tab-item');
    if (!tabItem) return;
    
    // Don't handle if clicking on close button
    if (e.target.classList.contains('tab-close')) return;
    
    const tabId = tabItem.getAttribute('data-tab');
    
    if (tabId === 'main') {
      this.switchToMain();
    } else {
      this.switchToDocument(tabId);
    }
  }

  updateDocumentList() {
    if (!this.documentList) return;
    
    const documents = Array.from(this.documents.values());
    const currentUser = getCurrentUser();
    
    if (documents.length === 0) {
      this.documentList.innerHTML = `
        <div class="no-documents">
          <p>No documents yet. Create your first document to get started!</p>
        </div>
      `;
      return;
    }
    
    // Categorize documents based on user relationship
    const myDocuments = documents.filter(doc => doc.author === currentUser?.id);
    const sharedWithMe = documents.filter(doc => 
      doc.author !== currentUser?.id && 
      (doc.editors.includes(currentUser?.id) || doc.viewers.includes(currentUser?.id) || doc.isShared)
    );
    
    let documentsHTML = '';
    
    // Create two-column layout with sections side by side
    documentsHTML += '<div class="documents-container">';
    
    // Left column - Shared Documents
    documentsHTML += '<div class="documents-column">';
    documentsHTML += '<h3 class="column-header">🌐 Shared Documents</h3>';
    
    if (sharedWithMe.length > 0) {
      documentsHTML += '<div class="document-list">';
      documentsHTML += sharedWithMe.map(doc => {
        const preview = doc.template_content ? doc.template_content.substring(0, 100) : 'Empty document';
        const lastModified = new Date(doc.lastModified).toLocaleDateString();
        
        return `
          <div class="document-item shared-document" data-document-id="${doc.id}">
            <h4>🌐 ${doc.title}</h4>
            <div class="document-meta">
              Last modified: ${lastModified} • Author: ${doc.authorName || 'Unknown'}
              ${doc.editors.includes(currentUser?.id) ? ' • <span class="editor-badge">Can Edit</span>' : ''}
              ${doc.viewers.includes(currentUser?.id) && !doc.editors.includes(currentUser?.id) ? ' • <span class="viewer-badge">View Only</span>' : ''}
            </div>
            <div class="document-preview">${preview}${(doc.template_content || '').length > 100 ? '...' : ''}</div>
            <div class="document-actions">
              <button class="document-action-btn open" data-action="open" data-document-id="${doc.id}">
                Open
              </button>
            </div>
          </div>
        `;
      }).join('');
      documentsHTML += '</div>';
    } else {
      documentsHTML += '<div class="no-documents-column"><p>No shared documents available.</p></div>';
    }
    
    documentsHTML += '</div>'; // End left column
    
    // Right column - My Documents
    documentsHTML += '<div class="documents-column">';
    documentsHTML += '<h3 class="column-header">📁 My Documents</h3>';
    
    if (myDocuments.length > 0) {
      documentsHTML += '<div class="document-list">';
      documentsHTML += myDocuments.map(doc => {
        const preview = doc.template_content ? doc.template_content.substring(0, 100) : 'Empty document';
        const lastModified = new Date(doc.lastModified).toLocaleDateString();
        
        return `
          <div class="document-item ${doc.isShared ? 'shared-document' : ''}" data-document-id="${doc.id}">
            <h4>${doc.isShared ? '🌐' : '📄'} ${doc.title}</h4>
            <div class="document-meta">
              Last modified: ${lastModified} • Session: ${doc.sessionId}
              ${doc.isShared ? ` • <span class="shared-indicator">Shared with ${doc.editors.length + doc.viewers.length} user${doc.editors.length + doc.viewers.length !== 1 ? 's' : ''}</span>` : ''}
              ${doc.editors.length > 0 ? ` • <span class="editors-count">${doc.editors.length} editor${doc.editors.length !== 1 ? 's' : ''}</span>` : ''}
              ${doc.viewers.length > 0 ? ` • <span class="viewers-count">${doc.viewers.length} viewer${doc.viewers.length !== 1 ? 's' : ''}</span>` : ''}
            </div>
            <div class="document-preview">${preview}${(doc.template_content || '').length > 100 ? '...' : ''}</div>
            <div class="document-actions">
              <button class="document-action-btn open" data-action="open" data-document-id="${doc.id}">
                Open
              </button>
              <button class="document-action-btn share" data-action="share" data-document-id="${doc.id}">
                ${doc.isShared ? 'Manage Sharing' : 'Share'}
              </button>
              <button class="document-action-btn delete" data-action="delete" data-document-id="${doc.id}">
                Delete
              </button>
            </div>
          </div>
        `;
      }).join('');
      documentsHTML += '</div>';
    } else {
      documentsHTML += '<div class="no-documents-column"><p>No local documents yet.</p></div>';
    }
    
    documentsHTML += '</div>'; // End right column
    documentsHTML += '</div>'; // End documents container
    
    this.documentList.innerHTML = documentsHTML;
  }

  openExistingDocument(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) {
      console.error(`Document ${documentId} not found in documents map`);
      return;
    }
    
    console.log(`📂 Opening document: ${doc.title} (${documentId})`);
    
    // Check if tab already exists
    const existingTab = document.querySelector(`[data-tab="${documentId}"]`);
    if (existingTab) {
      console.log(`Tab already exists for document ${documentId}, switching to it`);
      this.switchToDocument(documentId);
      return;
    }
    
    // Always load fresh data from backend since all documents are saved there
    console.log(`Loading fresh data from backend for document ${documentId}`);
    this.loadDocumentFromBackend(documentId);
  }

  deleteDocument(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) return;
    
    if (confirm(`Delete "${doc.title}"? This action cannot be undone.`)) {
      // Close if currently open
      if (this.activeDocumentId === documentId) {
        this.closeDocument(documentId);
      } else {
        // Delete from backend first, then remove from local storage
        fetch(`http://127.0.0.1:5000/api/documents/${documentId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        }).then(response => {
          if (response.ok) {
            console.log(` Document deleted from backend: ${doc.title}`);
            // Only remove from local storage after successful backend deletion
            this.documents.delete(documentId);
            this.updateDocumentList();
          } else {
            console.error(` Failed to delete document from backend: ${doc.title} (Status: ${response.status})`);
            // Still remove from local storage even if backend deletion fails
            this.documents.delete(documentId);
            this.updateDocumentList();
          }
        }).catch(error => {
          console.error(` Error deleting document from backend:`, error);
          // Still remove from local storage even if backend deletion fails
          this.documents.delete(documentId);
          this.updateDocumentList();
        });
      }
    }
  }

  getActiveDocument() {
    return this.activeDocumentId ? this.documents.get(this.activeDocumentId) : null;
  }

  // Save documents to backend for sharing
  async saveDocumentToBackend(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    try {
      const response = await fetch('http://127.0.0.1:5000/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: doc.id,
          title: doc.title,
          source_content: doc.source_content,
          template_content: doc.template_content,
          preview_content: doc.preview_content,
          sessionId: doc.sessionId,
          createdAt: doc.createdAt,
          lastModified: doc.lastModified,
          chatHistory: doc.chatHistory,
          variables: doc.variables,
          contextFiles: doc.contextFiles,
          author: doc.author,
          authorName: doc.authorName,
          editors: doc.editors || [],
          viewers: doc.viewers || [],
          comments: doc.comments || {}
        })
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error saving document to backend:', error);
      return false;
    }
  }

  // Load all documents from backend that user has access to
  async loadSharedDocuments() {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.log('No current user found, skipping document load');
        return 0;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/documents/user/${currentUser.id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.documents) {
        // Track highest document number for current user to update counter
        let highestUserDocNumber = 0;
        
        // Add all documents that user has access to
        data.documents.forEach(doc => {
          // Add document if user has access and it's not already loaded
          if (!this.documents.has(doc.id)) {
            // Mark as shared if user is not the author
            if (doc.author !== currentUser.id) {
              doc.isShared = true;
            }
            doc.userPermission = doc.userPermission || {};
            this.documents.set(doc.id, doc);
          }
          
          // Check if this is the current user's document and extract the number
          if (doc.author === currentUser.id && doc.id.startsWith(`${currentUser.id}-doc-`)) {
            const docNumberMatch = doc.id.match(new RegExp(`^${currentUser.id}-doc-(\\d+)$`));
            if (docNumberMatch) {
              const docNumber = parseInt(docNumberMatch[1], 10);
              if (docNumber > highestUserDocNumber) {
                highestUserDocNumber = docNumber;
              }
            }
          }
        });
        
        // Update documentCounter to ensure new documents get the next sequential number
        if (highestUserDocNumber > 0) {
          this.documentCounter = Math.max(this.documentCounter, highestUserDocNumber);
        }
        
        this.updateDocumentList();
        
        // Count documents shared with user (not authored by them)
        const sharedCount = data.documents.filter(doc => doc.author !== currentUser.id).length;
        return sharedCount;
      }
      
      return 0;
    } catch (error) {
      console.error('Error loading shared documents:', error);
      return 0;
    }
  }

  // Share a document with other users
  async shareDocument(documentId) {
    const success = await this.saveDocumentToBackend(documentId);
    
    if (success) {
      const doc = this.documents.get(documentId);
      addMessageToUI('system', `📤 Document "${doc.title}" shared successfully! Other users can now access it.`);
      
      // Mark document as shared locally
      doc.isShared = true;
      this.updateDocumentList();
      
      return true;
    } else {
      addMessageToUI('system', '❌ Failed to share document. Make sure the backend is running.');
      return false;
    }
  }

  // Track document viewers
  addDocumentViewer(documentId, userId, userName) {
    const doc = this.documents.get(documentId);
    if (!doc) return;
    
    if (!doc.viewers) {
      doc.viewers = new Map();
    }
    
    doc.viewers.set(userId, {
      name: userName,
      lastSeen: new Date().toISOString()
    });
    
    this.updateDocumentViewerDisplay(documentId);
  }

  removeDocumentViewer(documentId, userId) {
    const doc = this.documents.get(documentId);
    if (!doc || !doc.viewers) return;
    
    doc.viewers.delete(userId);
    this.updateDocumentViewerDisplay(documentId);
  }

  updateDocumentViewerDisplay(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc || !doc.viewers) return;
    
    const container = document.getElementById(`document-${documentId}`);
    if (!container) return;
    
    const header = container.querySelector('.content-header h3');
    if (!header) return;
    
    // Remove existing viewer indicator
    const existingIndicator = header.querySelector('.document-viewers');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Add new viewer indicator if there are other viewers
    const viewers = Array.from(doc.viewers.values());
    if (viewers.length > 0) {
      const viewerIndicator = document.createElement('span');
      viewerIndicator.className = 'document-viewers';
      viewerIndicator.innerHTML = `
        <span class="viewer-count">👥 ${viewers.length} other${viewers.length > 1 ? 's' : ''} viewing</span>
        <div class="viewer-list">
          ${viewers.map(viewer => `<span class="viewer-name">${viewer.name}</span>`).join(', ')}
        </div>
      `;
      header.appendChild(viewerIndicator);
    }
  }

  // Notify when switching to a document (for collaboration)
  notifyDocumentSwitch(documentId) {
    // WebSocket functionality removed - using HTTP polling instead
    console.log(`Switched to document ${documentId}`);
  }

  // Refresh shared documents from backend
  async refreshSharedDocuments() {
    const count = await this.loadSharedDocuments();
    if (count > 0) {
      addMessageToUI('system', `🔄 Loaded ${count} shared document${count > 1 ? 's' : ''} from other users.`);
    }
    return count;
  }

  // Refresh the currently active document from backend for real-time collaboration
  async refreshActiveDocument() {
    if (!this.activeDocumentId) {
      return; // No document is currently open
    }

    const currentDoc = this.documents.get(this.activeDocumentId);
    if (!currentDoc) {
      return; // Document not found locally
    }

    try {
      const response = await fetch(`http://127.0.0.1:5000/api/documents/${this.activeDocumentId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        // Document might not exist in backend, skip refresh
        return;
      }

      const data = await response.json();
      
      if (data.success && data.document) {
        const freshDoc = data.document;
        
        // Check if the document has been modified by someone else
        const currentLastModified = new Date(currentDoc.lastModified || 0).getTime();
        const freshLastModified = new Date(freshDoc.lastModified || 0).getTime();
        
        if (freshLastModified > currentLastModified) {
          // Document has been updated by someone else, refresh the content
          console.log(`Refreshing document content: ${freshDoc.title} (updated by ${freshDoc.authorName})`);
          
          // Update the document in our local map
          this.documents.set(this.activeDocumentId, freshDoc);
          
          // Get the current container
          const container = document.getElementById(`document-${this.activeDocumentId}`);
          if (container) {
            const templateEditor = container.querySelector('.template-editor');
            const previewContent = container.querySelector('.preview-content');
            const sourceEditor = container.querySelector('.source-editor');
            
            // SMART CONTENT UPDATE: Only replace content if it actually changed
            // and restore highlights afterward

            if (sourceEditor && freshDoc.source_content !== undefined) {
              const currentSourceContent = getTextContentWithLineBreaks(sourceEditor);
              if (currentSourceContent !== freshDoc.source_content) {
                console.log('Source content changed, updating...');
                sourceEditor.textContent = freshDoc.source_content;
              }

              await this.restoreHighlightsForMode('source');
            }
            
            // Handle template content
            if (templateEditor && freshDoc.template_content !== undefined) {
              const currentCodeContent = getTextContentWithLineBreaks(templateEditor);
              if (currentCodeContent !== freshDoc.template_content) {
                console.log('Template content changed, updating...');
                templateEditor.innerHTML = freshDoc.template_content;
                
                // Restore highlights for code mode after content replacement
                await this.restoreHighlightsForMode('template');
              }
            }
            
            // Handle preview content
            if (previewContent && freshDoc.preview_content !== undefined) {
              const currentPreviewContent = previewContent.innerHTML;
              if (currentPreviewContent !== freshDoc.preview_content) {
                console.log('Preview content changed, updating...');
                console.log('NEW preview content from backend:', freshDoc.preview_content);
                previewContent.innerHTML = freshDoc.preview_content;
                
                // Restore highlights for preview mode after content replacement
                await this.restoreHighlightsForMode('preview');
              }
            }

            // SYNC COMMENTS: Handle comment additions/deletions from other users
            await this.syncDocumentComments(this.activeDocumentId, freshDoc);
            
          }
          
          // Update document list to show new last modified time
          this.updateDocumentList();
        }
      }
      
    } catch (error) {
      // Silently fail - don't spam console with errors during normal operation
      // console.error('Error refreshing active document:', error);
    }
  }

  /**
   * Restore all highlights for a specific mode (fallback method)
   */
  async restoreHighlightsForMode(mode) {
    try {
      const [{ state }] = await Promise.all([
        import('./state.js')
      ]);

      const commentsForMode = Object.values(state.comments).filter(comment => 
        comment.mode === mode && !comment.isResolved && comment.isActive
      );

      for (const comment of commentsForMode) {
        await this.recreateTextHighlight(comment);
      }
      
    } catch (error) {
      console.error('Error restoring highlights for mode:', error);
    }
  }

  // Auto-refresh shared documents periodically
  startAutoRefresh() {
    // Refresh every 1 second for discovering new shared documents
    setInterval(() => {
      this.loadSharedDocuments();
    }, 10000);
    
    // Refresh currently open document every 1 second for real-time collaboration
    setInterval(() => {
      this.refreshActiveDocument();
    }, 25000);
  }

  // // Clear all user-specific data when switching users
  clearUserData() {
    console.log('Clearing user-specific document data...');
    
    // Clear all annotation windows first
    clearAllComments();
    
    // Stop auto-save
    this.stopAutoSave();
    
    // Close all open documents
    const openDocuments = Array.from(this.documents.keys());
    openDocuments.forEach(docId => {
      // Remove tab and content without confirmation
      const tab = document.querySelector(`[data-tab="${docId}"]`);
      if (tab) {
        tab.remove();
      }
      
      const content = document.getElementById(`document-${docId}`);
      if (content) {
        content.remove();
      }
    });
    
    // Clear documents map
    this.documents.clear();
    
    // Reset counters
    this.documentCounter = 0;
    this.activeDocumentId = null;
    
    // Reset auto-save state
    this.hasUnsavedChanges = false;
    this.saveStatusElement = null;
    
    // IMPORTANT: Reset event delegation flag so it can be set up again for new user
    this.documentListDelegationSetup = false;
    
    // Switch to main page
    this.switchToMain();
    
    // Update document list (will show empty state)
    this.updateDocumentList();
    
    console.log('User data cleared successfully');
  }

  // // Initialize for a new user (called after login/user switch)
  initializeForUser() {
    console.log('Initializing DocumentManager for new user...');
    
    // Clear any existing data first
    this.clearUserData();
    
    // Re-setup event delegation in case it wasn't set up initially
    this.setupDocumentListEventDelegation();
    
    // Load documents from backend (source of truth)
    this.loadSharedDocuments();
    
    // Update document list
    this.updateDocumentList();
    
    const currentUser = getCurrentUser();
    console.log(`DocumentManager initialized for user: ${currentUser?.name || 'Unknown'}`);
  }

  // ===== AUTO-SAVE FUNCTIONALITY =====
  
  /**
   * Start auto-save functionality for the current document
   */
  startAutoSave() {
    // Stop any existing auto-save
    this.stopAutoSave();
    
    if (!this.activeDocumentId) {
      return;
    }
    
    // Create save status indicator
    this.createSaveStatusIndicator();
    
    // Set up auto-save interval (every 5 seconds)
    this.autoSaveInterval = setInterval(() => {
      this.performAutoSave();
    }, 5000);
    
    // Track content changes
    this.setupContentChangeTracking();
  }
  
  /**
   * Stop auto-save functionality
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Remove content change tracking
    this.removeContentChangeTracking();
  }
  
  /**
   * Perform auto-save if there are unsaved changes
   */
  async performAutoSave() {
    if (!this.hasUnsavedChanges || !this.activeDocumentId) {
      return;
    }

    const doc = this.documents.get(this.activeDocumentId);
    if (!doc) {
      return;
    }

    const container = document.getElementById(`document-${this.activeDocumentId}`);
    if (!container) {
      return;
    }

    // Get content from both code editor and preview
    const templateEditor = container.querySelector('.template-editor');
    const previewContent = container.querySelector('.preview-content');
    const sourceEditor = container.querySelector('.source-editor');

    // CRITICAL FIX: Get clean template content, not diff HTML
    const currentTemplateContent = this.getCleanTemplateContent(templateEditor);
    const currentPreviewContent = previewContent ? previewContent.innerHTML : '';
    const currentSourceContent = sourceEditor ? getTextContentWithLineBreaks(sourceEditor) : '';
    
    try {
      // Get current comment state from the global state (use static import)
      const { state } = await import('./state.js');
      
      // Capture current comments with UI state preservation
      const currentComments = this.captureCommentsWithUIState(state.comments || {});

      // Check if either content or comments have changed
      const templateChanged = currentTemplateContent !== (doc.template_content || '');
      const sourceChanged = currentSourceContent !== (doc.source_content || '');
      const previewChanged = currentPreviewContent !== (doc.preview_content || '');
      const commentsChanged = JSON.stringify(currentComments) !== JSON.stringify(doc.comments || {});

      if (templateChanged || sourceChanged || previewChanged || commentsChanged) {
        // Update content fields
        doc.template_content = currentTemplateContent;
        doc.source_content = currentSourceContent;
        doc.preview_content = currentPreviewContent;

        // Update comment fields with UI state preservation
        doc.comments = currentComments;

        doc.lastModified = new Date().toISOString();

        // Save to backend (single source of truth)
        const success = await this.saveDocumentToBackend(this.activeDocumentId);
        
        if (!success) {
          console.error(`Failed to auto-sync document to backend: ${doc.title}`);
        }
        
        // Update tracking
        this.hasUnsavedChanges = false;
        
        // Update save status
        this.updateSaveStatus('saved');
        
        // Remove pending updates indicator if it exists
        if (this.removePendingIndicator) {
          this.removePendingIndicator();
          this.pendingUpdatesIndicator = null;
          this.removePendingIndicator = null;
          
          // Trigger a refresh to get any pending updates now that user stopped typing
          setTimeout(() => {
            this.refreshActiveDocument();
          }, 1000);
        }

        // Update document list (to show new last modified time)
        this.updateDocumentList();
      }
    } catch (error) {
      console.error('Error in performAutoSave:', error);
    }
  }

  /**
   * Get clean template content without inline diff HTML
   * @param {Element} templateEditor - The template editor element
   * @returns {string} Clean template content
   */
  getCleanTemplateContent(templateEditor) {
    if (!templateEditor) {
      return '';
    }

    // Check if there are active inline diffs
    const hasInlineDiffs = templateEditor.querySelector('.inline-diff-delete, .inline-diff-add');
    
    if (hasInlineDiffs) {
      // Check if we have stored original content from comments using window.currentInlineDiffs
      if (window.currentInlineDiffs) {
        const activeDiffIds = Object.keys(window.currentInlineDiffs);
        if (activeDiffIds.length > 0) {
          const firstDiff = window.currentInlineDiffs[activeDiffIds[0]];
          if (firstDiff.commentData && firstDiff.commentData.originalTemplateContent) {
            const cleanContent = firstDiff.commentData.originalTemplateContent;
            console.log('Using stored original template content from currentInlineDiffs:', cleanContent);
            return cleanContent;
          }
        }
      }
      
      // Fallback: try to clean the HTML by removing diff elements
      const tempEditor = templateEditor.cloneNode(true);
      
      // Remove all diff delete elements and replace with their text content
      const deleteElements = tempEditor.querySelectorAll('.inline-diff-delete');
      deleteElements.forEach(el => {
        const textNode = document.createTextNode(el.textContent);
        el.parentNode.replaceChild(textNode, el);
      });
      
      // Remove all diff add elements entirely
      const addElements = tempEditor.querySelectorAll('.inline-diff-add');
      addElements.forEach(el => el.remove());
      
      const cleanedContent = getTextContentWithLineBreaks(tempEditor);
      console.log('Fallback: cleaned diff HTML to get content:', cleanedContent);
      return cleanedContent;
    } else {
      // No inline diffs, check if content contains HTML formatting
      const hasHTMLContent = templateEditor.innerHTML !== templateEditor.textContent;
      
      if (hasHTMLContent) {
        // Preserve HTML content for rich formatting (like PPTX content)
        return templateEditor.innerHTML;
      } else {
        // Plain text content, use text extraction
        return getTextContentWithLineBreaks(templateEditor);
      }
    }
  }

  /**
   * Capture comments with UI state preservation for saving
   */
  captureCommentsWithUIState(stateComments) {
    const commentsToSave = {};
    
    for (const [commentId, comment] of Object.entries(stateComments)) {
      // Create a clean copy of the comment for saving
      const savedComment = {
        id: comment.id,
        selectedText: comment.selectedText,
        commentMessage: comment.commentMessage,
        mode: comment.mode,
        author: comment.author,
        authorName: comment.authorName,
        authorEmoji: comment.authorEmoji,
        authorColor: comment.authorColor,
        createdAt: comment.createdAt,
        selectionRange: comment.selectionRange,
        isResolved: comment.isResolved,
        isActive: comment.isActive,
        
        // Save conversation messages
        messages: comment.messages || []
      };

      // Include detailed range information for precise restoration
      if (comment.detailedRangeInfo) {
        savedComment.detailedRangeInfo = comment.detailedRangeInfo;
      }

      // Save AI suggestion-specific properties
      if (comment.isAISuggestion) {
        savedComment.isAISuggestion = true;
        savedComment.lineDiffs = comment.lineDiffs;
        savedComment.currentTemplate = comment.currentTemplate;
        savedComment.suggestedTemplate = comment.suggestedTemplate;
        savedComment.aiMessage = comment.aiMessage;
        savedComment.requestedBy = comment.requestedBy;
      }

      // Save template suggestion-specific properties
      if (comment.isTemplateSuggestion) {
        savedComment.isTemplateSuggestion = true;
        savedComment.originalComment = comment.originalComment;
        savedComment.aiSuggestion = comment.aiSuggestion;
        savedComment.confidence = comment.confidence;
        savedComment.inlineDiffData = comment.inlineDiffData;
        savedComment.inlineDiffState = comment.inlineDiffState;
      }

      // Store UI state separately for restoration (but don't save DOM elements to backend)
      if (comment.ui) {
        savedComment.uiState = {
          position: comment.ui.position,
          isVisible: comment.ui.isVisible,
          isDragging: false // Don't save dragging state
        };
      }

      commentsToSave[commentId] = savedComment;
    }

    return commentsToSave;
  }
  
  /**
   * Set up content change tracking for the active document
   */
  setupContentChangeTracking() {
    if (!this.activeDocumentId) {
      return;
    }

    const container = document.getElementById(`document-${this.activeDocumentId}`);
    if (!container) {
      return;
    }

    const templateEditor = container.querySelector('.template-editor');
    const previewContent = container.querySelector('.preview-content');
    const sourceEditor = container.querySelector('.source-editor');

    this.hasUnsavedChanges = false;

    // Remove existing listeners if any
    this.removeContentChangeTracking();

    if (sourceEditor) {
      this.sourceContentChangeHandler = () => {
        this.onContentChange();
      };
      sourceEditor.addEventListener('input', this.sourceContentChangeHandler);
    }

    // Set up code editor tracking
    if (templateEditor) {
      this.templateEditorChangeHandler = () => {
        this.onContentChange();
      };
      templateEditor.addEventListener('input', this.templateEditorChangeHandler);
    }

    // Set up preview content tracking (using MutationObserver for DOM changes)
    if (previewContent) {
      this.previewObserver = new MutationObserver(() => {
        this.onContentChange();
      });

      this.previewObserver.observe(previewContent, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }

  }
  
  /**
   * Remove content change tracking
   */
  removeContentChangeTracking() {
    if (this.templateEditorChangeHandler && this.activeDocumentId) {
      const container = document.getElementById(`document-${this.activeDocumentId}`);
      if (container) {
        const templateEditor = container.querySelector('.template-editor');
        if (templateEditor) {
          templateEditor.removeEventListener('input', this.templateEditorChangeHandler);
        }
      }
    }
    this.templateEditorChangeHandler = null;
    
    if (this.previewObserver && this.activeDocumentId) {
      this.previewObserver.disconnect();
      this.previewObserver = null;
    }

    // Clean up comment change tracking
    if (this.commentChangeCheckInterval) {
      clearInterval(this.commentChangeCheckInterval);
      this.commentChangeCheckInterval = null;
    }

    this.lastCommentSnapshot = null;
  }
  
  /**
   * Handle content change events
   */
  onContentChange() {
    this.hasUnsavedChanges = true;
    this.updateSaveStatus('unsaved');
  }
  
  /**
   * Track when comments change to trigger auto-save
   */
  onCommentChange() {
    this.hasUnsavedChanges = true;
    this.updateSaveStatus('unsaved');
  }
  
  /**
   * Create save status indicator in the document header
   */
  createSaveStatusIndicator() {
    if (!this.activeDocumentId) {
      return;
    }
    
    const container = document.getElementById(`document-${this.activeDocumentId}`);
    if (!container) {
      return;
    }
    
    // Find or create the content header
    let contentHeader = container.querySelector('.content-header');
    if (!contentHeader) {
      // Create content header if it doesn't exist
      contentHeader = document.createElement('div');
      contentHeader.className = 'content-header';
      container.insertBefore(contentHeader, container.firstChild);
    }
    
    // Remove existing save status
    const existingStatus = contentHeader.querySelector('.save-status');
    if (existingStatus) {
      existingStatus.remove();
    }
    
    // Create save status element
    this.saveStatusElement = document.createElement('div');
    this.saveStatusElement.className = 'save-status';
    this.saveStatusElement.innerHTML = `
      <span class="save-icon">💾</span>
      <span class="save-text">Saved</span>
    `;
    
    contentHeader.appendChild(this.saveStatusElement);
  }
  
  /**
   * Update save status display
   */
  updateSaveStatus(status) {
    if (!this.saveStatusElement) {
      return;
    }
    
    const icon = this.saveStatusElement.querySelector('.save-icon');
    const text = this.saveStatusElement.querySelector('.save-text');
    
    if (!icon || !text) {
      return;
    }
    
    switch (status) {
      case 'saved':
        icon.textContent = '💾';
        text.textContent = 'Saved';
        this.saveStatusElement.className = 'save-status saved';
        break;
      case 'unsaved':
        icon.textContent = '📝';
        text.textContent = 'Unsaved changes';
        this.saveStatusElement.className = 'save-status unsaved';
        break;
      case 'saving':
        icon.textContent = '⏳';
        text.textContent = 'Saving...';
        this.saveStatusElement.className = 'save-status saving';
        break;
    }
  }
  
  /**
   * Manual save function (can be called by Ctrl+S)
   */
  manualSave() {
    if (!this.activeDocumentId) {
      return;
    }
    
    this.updateSaveStatus('saving');
    
    // Perform save immediately
    setTimeout(() => {
      this.performAutoSave();
    }, 100);
  }

  // Load a document fresh from backend before opening
  async loadDocumentFromBackend(documentId) {
    console.log(`🔄 Loading document ${documentId} from backend...`);
    
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/documents/${documentId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.document) {
        // Update local document with fresh data from backend
        const freshDoc = data.document;
        console.log(`✅ Successfully loaded document from backend: ${freshDoc.title}`);
        
        // Update the document in our local map
        this.documents.set(documentId, freshDoc);
        
        // Now proceed with opening the document with fresh data
        console.log(`Creating tab and content for document ${documentId}`);
        this.createTab(freshDoc);
        this.createDocumentContent(freshDoc);
        
        // Switch to the document FIRST, then load content
        console.log(`Switching to document ${documentId}`);
        this.switchToDocument(documentId);
        
        // Load content into editor AFTER switching with proper verification
        console.log(`Loading content for document ${documentId}`);
        await this.loadDocumentContentWithRetry(documentId, freshDoc, 1);
        
        console.log(`✅ Document ${documentId} opened successfully`);
        
      } else {
        console.error('Failed to load document from backend');
        addMessageToUI('system', '❌ Failed to load latest version of document');
        
        // Fallback to opening local version
        await this.loadLocalDocumentAsFallback(documentId);
      }
      
    } catch (error) {
      console.error('Error loading document from backend:', error);
      addMessageToUI('system', '❌ Could not connect to backend. Opening local version.');
      
      // Fallback to opening local version
      await this.loadLocalDocumentAsFallback(documentId);
    }
  }

  /**
   * Load document content with retry mechanism to ensure content is properly loaded
   */
  async loadDocumentContentWithRetry(documentId, freshDoc, maxRetries = 1) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const container = document.getElementById(`document-${documentId}`);
      if (!container) {
        await this.delay(200);
        continue;
      }

      const templateEditor = container.querySelector('.template-editor');
      const previewContent = container.querySelector('.preview-content');
      const sourceEditor = container.querySelector('.source-editor');
      
      if (!templateEditor) {
        await this.delay(200);
        continue;
      }

      if (sourceEditor && freshDoc.source_content !== undefined) {
        sourceEditor.innerHTML = '';
        sourceEditor.textContent = freshDoc.source_content;
      }

      // Load preview content first (less critical)
      if (previewContent && freshDoc.preview_content !== undefined) {
        previewContent.innerHTML = freshDoc.preview_content;
      }

      // Now handle template content and comments together
      if (freshDoc.template_content !== undefined) {
        // Clear any existing content first
        templateEditor.innerHTML = '';
        
        // Set the content
        templateEditor.innerHTML = freshDoc.template_content;
        
        // Wait for DOM to update
        await this.delay(100);
        
        // Verify content was actually loaded and is still there
        const verification = this.verifyContentStillThere(templateEditor, freshDoc.template_content);
        if (!verification.success) {
          if (attempt < maxRetries) {
            await this.delay(300 * attempt);
            continue;
          } else {
            break;
          }
        }

        // NOW immediately restore comments while content is confirmed to be there
        console.log('=== RESTORING COMMENTS ===');
        console.log('Template editor content length:', templateEditor.textContent?.length || 0);
        console.log('Preview content length:', previewContent?.innerHTML?.length || 0);
        console.log('Preview content contains highlights:', previewContent?.innerHTML?.includes('data-comment-id') || false);
        await this.restoreDocumentComments(documentId, freshDoc);
        
        // Load verification status after content and comments are loaded
        try {
          const { loadDocumentVerification } = await import('./verification.js');
          await loadDocumentVerification();
          console.log(`✅ Verification status loaded for document ${documentId}`);
        } catch (error) {
          console.warn('Could not load verification status:', error);
        }
        
        // Load variables for this document
        try {
          const { variablesManager } = await import('./variables.js');
          await variablesManager.loadVariables();
          console.log(`✅ Variables loaded for document ${documentId}`);
        } catch (error) {
          console.warn('Could not load variables:', error);
        }
        
        return true; // Success, exit retry loop
        
      } else {
        // Still try to restore comments even if no content
        await this.restoreDocumentComments(documentId, freshDoc);
        
        // Load verification status
        try {
          const { loadDocumentVerification } = await import('./verification.js');
          await loadDocumentVerification();
          console.log(`✅ Verification status loaded for document ${documentId}`);
        } catch (error) {
          console.warn('Could not load verification status:', error);
        }
        
        // Load variables for this document
        try {
          const { variablesManager } = await import('./variables.js');
          await variablesManager.loadVariables();
          console.log(`✅ Variables loaded for document ${documentId}`);
        } catch (error) {
          console.warn('Could not load variables:', error);
        }
        
        return true;
      }
    }
    
    addMessageToUI('system', '⚠️ Document content may not have loaded properly');
    return false;
  }

  /**
   * Verify content is still present and hasn't been cleared
   */
  verifyContentStillThere(templateEditor, expectedContent) {
    const childCount = templateEditor.childNodes.length;
    const textContent = templateEditor.textContent || '';
    const expectedLength = expectedContent ? expectedContent.length : 0;
    
    if (childCount === 0 && expectedLength > 0) {
      return { success: false, reason: 'No child nodes but content expected' };
    }
    
    if (textContent.length === 0 && expectedLength > 0) {
      return { success: false, reason: 'No text content but content expected' };
    }
    
    if (expectedLength > 0 && textContent.length < expectedLength * 0.8) {
      return { success: false, reason: 'Content significantly shorter than expected' };
    }
    
    // Extra check: verify first 50 characters match
    if (expectedLength > 0) {
      const expectedPrefix = expectedContent.substring(0, 50);
      const actualPrefix = textContent.substring(0, 50);
      
      if (expectedPrefix !== actualPrefix) {
        return { success: false, reason: 'Content prefix mismatch' };
      }
    }
    
    return { success: true, reason: 'Content verified as stable' };
  }

  /**
   * Fallback method to load local document version
   */
  async loadLocalDocumentAsFallback(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) return;
    
    this.createTab(doc);
    this.createDocumentContent(doc);
    
    // Switch to document first
    this.switchToDocument(documentId);
    
    // Load content with retry mechanism
    await this.loadDocumentContentWithRetry(documentId, doc, 1);
  }

  /**
   * Utility method for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Restore comments for a document
  async restoreDocumentComments(documentId, documentData) {
    if (!documentData.comments || Object.keys(documentData.comments).length === 0) {
      return;
    }

    if (this.isRestoringComments === documentId) {
      return;
    }
    
    // Additional check: if we just restored comments recently, skip
    if (this.lastCommentRestorationTime && (Date.now() - this.lastCommentRestorationTime) < 500) {
      return;
    }
    
    this.isRestoringComments = documentId;
    this.lastCommentRestorationTime = Date.now();

    try {
      // Verify document container and content are ready
      const container = document.getElementById(`document-${documentId}`);
      if (!container) {
        return;
      }

      const templateEditor = container.querySelector('.template-editor');
      if (!templateEditor) {
        return;
      }

      // Import required modules
      const [{ state }, { createFloatingAnnotation, refreshAnnotationElements, removeFloatingAnnotation }, { refreshHighlightEventListeners, clearAllComments }] = await Promise.all([
        import('./state.js'),
        import('./annotations.js'),
        import('./comments.js')
      ]);

      // Clear the global comments state FIRST
      state.comments = {};

      // Remove all existing annotation elements from DOM
      const existingAnnotations = document.querySelectorAll('.floating-annotation');
      existingAnnotations.forEach(annotation => {
        annotation.remove();
      });
      
      // For preview mode, don't remove highlights that are already correctly loaded from backend
      // Only remove highlights from template/source editors since those need to be recreated
      const tempEditor = container.querySelector('.template-editor');
      const srcEditor = container.querySelector('.source-editor');
      
      if (tempEditor) {
        const templateHighlights = tempEditor.querySelectorAll('.text-comment-highlight');
        templateHighlights.forEach(highlight => {
          highlight.replaceWith(document.createTextNode(highlight.textContent));
        });
      }
      
      if (srcEditor) {
        const sourceHighlights = srcEditor.querySelectorAll('.text-comment-highlight');
        sourceHighlights.forEach(highlight => {
          highlight.replaceWith(document.createTextNode(highlight.textContent));
        });
      }
      
      // DON'T remove preview highlights - they're already correct from backend HTML!

      // NOW restore comments to global state
      if (documentData.comments) {
        // Restore each comment with proper structure
        for (const [commentId, savedComment] of Object.entries(documentData.comments)) {
          const restoredComment = {
            id: savedComment.id,
            selectedText: savedComment.selectedText,
            commentMessage: savedComment.commentMessage,
            mode: savedComment.mode,
            author: savedComment.author,
            authorName: savedComment.authorName,
            authorEmoji: savedComment.authorEmoji,
            authorColor: savedComment.authorColor,
            createdAt: savedComment.createdAt,
            selectionRange: savedComment.selectionRange,
            isResolved: savedComment.isResolved || false,
            isActive: savedComment.isActive !== false,
            
            // Restore conversation messages
            messages: savedComment.messages || [],
            
            // CRITICAL: Preserve detailedRangeInfo for accurate text highlighting
            detailedRangeInfo: savedComment.detailedRangeInfo,
            
            // Restore AI suggestion-specific properties for syncing
            isAISuggestion: savedComment.isAISuggestion || false,
            lineDiffs: savedComment.lineDiffs,
            currentTemplate: savedComment.currentTemplate,
            suggestedTemplate: savedComment.suggestedTemplate,
            aiMessage: savedComment.aiMessage,
            requestedBy: savedComment.requestedBy,
            
            // Restore template suggestion-specific properties for syncing
            isTemplateSuggestion: savedComment.isTemplateSuggestion || false,
            originalComment: savedComment.originalComment,
            aiSuggestion: savedComment.aiSuggestion,
            confidence: savedComment.confidence,
            inlineDiffData: savedComment.inlineDiffData,
            inlineDiffState: savedComment.inlineDiffState,
            
            ui: {
              position: savedComment.uiState?.position || null,
              element: null,
              isVisible: savedComment.uiState?.isVisible !== false,
              isDragging: false
            }
          };

          state.comments[commentId] = restoredComment;
        }

        // Immediately recreate UI elements
        await this.recreateCommentUIElements(documentData.comments, state, documentId);
      }

      // Update comment counters to prevent ID conflicts
      const maxCommentId = Math.max(0, ...Object.keys(state.comments).map(c => {
        const match = c.match(/comment-(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }));

      state.commentIdCounter = Math.max(state.commentIdCounter || 0, maxCommentId);

    } catch (error) {
      console.error('Error restoring document comments:', error);
    } finally {
      // Clear the restoration flag after a delay
      setTimeout(() => {
        this.isRestoringComments = null;
      }, 1500);
    }
  }

  /**
   * Recreate UI elements for restored comments (highlights and annotation windows)
   */
  async recreateCommentUIElements(savedComments, state, documentId) {
    try {
      const { createFloatingAnnotation, createAISuggestionAnnotation, updateAnnotationsVisibility } = await import('./annotations.js');
      const { refreshHighlightEventListeners } = await import('./comments.js');

      // Track created annotations to prevent duplicates
      const createdAnnotations = new Set();

      // Recreate highlights and annotations for each comment
      for (const [commentId, savedComment] of Object.entries(savedComments)) {
        if (savedComment.isResolved) {
          continue; // Skip resolved comments
        }

        // Get the current comment from state (which has been updated)
        const currentComment = state.comments[commentId];
        if (!currentComment) {
          continue;
        }

        console.log(`Processing comment ${commentId}:`, {
          isAISuggestion: savedComment.isAISuggestion,
          isTemplateSuggestion: savedComment.isTemplateSuggestion,
          hasLineDiffs: !!savedComment.lineDiffs,
          hasInlineDiffData: !!savedComment.inlineDiffData
        });

        // Handle template suggestion comments first (they take priority over AI suggestions)
        if (savedComment.isTemplateSuggestion && savedComment.inlineDiffData) {
          console.log(`Restoring template suggestion comment: ${commentId}`);
          
          // Recreate inline diff for template suggestions
          const diffCreated = await this.recreateTemplateSuggestionDiff(savedComment, documentId);
          
          // Check if annotation already exists
          const existingAnnotation = document.getElementById(commentId);
          
          if (!existingAnnotation && !createdAnnotations.has(commentId)) {
            try {
              // Create template suggestion annotation with Apply/Reject buttons
              const { createTemplateSuggestionAnnotation } = await import('./annotations.js');
              createTemplateSuggestionAnnotation(currentComment);
              createdAnnotations.add(commentId);
              
              // Apply saved position if available
              const annotation = document.getElementById(commentId);
              if (annotation && savedComment.uiState?.position) {
                const { top, left } = savedComment.uiState.position;
                annotation.style.top = `${top}px`;
                annotation.style.left = `${left}px`;
              }
              
            } catch (error) {
              console.error(`Error creating template suggestion annotation for ${commentId}:`, error);
            }
          }
          
        } else if (savedComment.isAISuggestion && savedComment.lineDiffs) {
          console.log(`Restoring AI suggestion comment: ${commentId}`);
          
          // Recreate inline diff highlighting
          const diffCreated = await this.recreateAISuggestionDiff(savedComment, documentId);
          
          // Check if annotation already exists
          const existingAnnotation = document.getElementById(commentId);
          
          if (!existingAnnotation && !createdAnnotations.has(commentId)) {
            try {
              // Create AI suggestion annotation with Accept/Reject buttons
              createAISuggestionAnnotation(currentComment);
              createdAnnotations.add(commentId);
              
              // Apply saved position if available
              const annotation = document.getElementById(commentId);
              if (annotation && savedComment.uiState?.position) {
                const { top, left } = savedComment.uiState.position;
                annotation.style.top = `${top}px`;
                annotation.style.left = `${left}px`;
              }
              
            } catch (error) {
              console.error(`Error creating AI suggestion annotation for ${commentId}:`, error);
            }
          }
          
        } else {
          console.log(`Processing regular comment: ${commentId}`);
          // Handle regular comments
          
          let highlightCreated = true; // Assume success by default
          
          // For preview mode, check if highlights already exist, otherwise recreate them
          if (savedComment.mode === 'preview') {
            const container = document.getElementById(`document-${documentId}`);
            const targetElement = container?.querySelector('.preview-content');
            const existingHighlight = targetElement?.querySelector(`.text-comment-highlight[data-comment-id="${savedComment.id}"]`);
            
            if (existingHighlight) {
              // Just ensure event listeners are attached to existing highlights
              if (!existingHighlight.hasAttribute('data-listener-attached')) {
                const { showAnnotationForText } = await import('./annotations.js');
                existingHighlight.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showAnnotationForText(savedComment.selectedText);
                });
                existingHighlight.setAttribute('data-listener-attached', 'true');
              }
            } else {
              // Highlight doesn't exist, recreate it
              highlightCreated = await this.recreateTextHighlight(savedComment, documentId);
            }
          } else {
            // For template/source mode, recreate text highlighting
            highlightCreated = await this.recreateTextHighlight(savedComment, documentId);
          }
          
          // Check if annotation already exists
          const existingAnnotation = document.getElementById(commentId);
          
          if (existingAnnotation) {
            // Update position if UI state indicates it should be different
            if (savedComment.uiState?.position) {
              const { top, left } = savedComment.uiState.position;
              existingAnnotation.style.top = `${top}px`;
              existingAnnotation.style.left = `${left}px`;
            }
            continue;
          }

          if (createdAnnotations.has(commentId)) {
            continue;
          }

          // Only create annotation if highlight was successfully created and should be visible
          if (highlightCreated && savedComment.uiState?.isVisible !== false) {
            try {
              createFloatingAnnotation(savedComment.selectedText, savedComment.commentMessage, currentComment);
              createdAnnotations.add(commentId);
              
              // Verify annotation was created and apply position immediately
              const annotation = document.getElementById(commentId);
              if (annotation && savedComment.uiState?.position) {
                const { top, left } = savedComment.uiState.position;
                annotation.style.top = `${top}px`;
                annotation.style.left = `${left}px`;
              }
              
            } catch (error) {
              console.error(`Error creating annotation for ${commentId}:`, error);
            }
          }
        }
      }

      // Refresh highlight event listeners to ensure interactions work
      refreshHighlightEventListeners(true); // Skip annotation refresh since we just created them

      // CRITICAL: Ensure only current mode comments are visible after recreation
      updateAnnotationsVisibility();

    } catch (error) {
      console.error('Error recreating comment UI elements:', error);
    }
  }

  /**
   * Recreate text highlighting for a restored comment
   */
  async recreateTextHighlight(savedComment, documentId) {
    if (!savedComment.selectedText || !savedComment.mode) {
      return false;
    }

    try {
      // Get the document container using the specific documentId
      const container = document.getElementById(`document-${documentId}`);
      if (!container) {
        return false;
      }

      // Get the appropriate content element based on mode
      let targetElement;
      if (savedComment.mode === 'preview') {
        targetElement = container.querySelector('.preview-content');
        
        // For preview mode, check if highlights already exist in HTML
        if (targetElement && targetElement.innerHTML.includes(`data-comment-id="${savedComment.id}"`)) {
          // Just ensure event listeners are attached
          const existingHighlight = targetElement.querySelector(`.text-comment-highlight[data-comment-id="${savedComment.id}"]`);
          if (existingHighlight && !existingHighlight.hasAttribute('data-listener-attached')) {
            const { showAnnotationForText } = await import('./annotations.js');
            existingHighlight.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              showAnnotationForText(savedComment.selectedText);
            });
            existingHighlight.setAttribute('data-listener-attached', 'true');
          }
          
          return true; // Highlight exists, no need to recreate
        }
        
      } else if (savedComment.mode === 'template') {
        targetElement = container.querySelector('.template-editor');
      } else if (savedComment.mode === 'source') {
        targetElement = container.querySelector('.source-editor');
      }

      if (!targetElement) {
        console.warn(`Target element not found for mode: ${savedComment.mode}`);
        return false;
      }

      // Remove any existing highlight for this comment first
      const existingHighlight = targetElement.querySelector(`.text-comment-highlight[data-comment-id="${savedComment.id}"]`);
      if (existingHighlight) {
        existingHighlight.outerHTML = existingHighlight.innerHTML;
      }

      // Use the unified highlighting function from comments.js
      const { createTextHighlight } = await import('./comments.js');
      
      const result = createTextHighlight({
        selectedText: savedComment.selectedText,
        commentId: savedComment.id,
        detailedRangeInfo: savedComment.detailedRangeInfo,
        mode: savedComment.mode,
        targetElement: targetElement
      });

      if (result) {
        console.log(`Successfully restored highlight for comment: ${savedComment.id}`);
      } else {
        console.warn(`Failed to restore highlight for comment: ${savedComment.id} - Text: "${savedComment.selectedText.substring(0, 50)}${savedComment.selectedText.length > 50 ? '...' : ''}"`);
      }

      return result;

    } catch (error) {
      console.error('Error recreating highlight:', error);
      return false;
    }
  }

  /**
   * Recreate inline diff highlighting for a restored AI suggestion comment
   */
  async recreateAISuggestionDiff(savedComment, documentId) {
    if (!savedComment.lineDiffs || !Array.isArray(savedComment.lineDiffs)) {
      return false;
    }

    try {
      // Get the document container using the specific documentId
      const container = document.getElementById(`document-${documentId}`);
      if (!container) {
        return false;
      }

      const templateEditor = container.querySelector('.template-editor');
      if (!templateEditor) {
        return false;
      }

      // Apply the same inline diff highlighting logic as in template-execution.js
      const lineDiffs = savedComment.lineDiffs;
      const commentId = savedComment.id;
      
      const lines = templateEditor.textContent.split('\n');
      
      // Clear the editor first
      templateEditor.innerHTML = '';
      
      // Create a map for faster lookup of diffs by line index
      const diffMap = new Map();
      lineDiffs.forEach(diff => {
        diffMap.set(diff.lineIndex, diff);
      });
      
      // Process the content line by line - use the maximum of lines or highest diff index
      const maxDiffIndex = lineDiffs.length > 0 ? Math.max(...lineDiffs.map(d => d.lineIndex)) : -1;
      const maxLines = Math.max(lines.length, maxDiffIndex + 1);
      
      for (let i = 0; i < maxLines; i++) {
        const diff = diffMap.get(i);
        
        if (diff) {
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

      console.log(`Successfully restored inline diff highlighting for AI suggestion: ${commentId}`);
      return true;

    } catch (error) {
      console.error('Error recreating AI suggestion diff:', error);
      return false;
    }
  }

  /**
   * Recreate inline diff highlighting for a restored template suggestion comment
   */
  async recreateTemplateSuggestionDiff(savedComment, documentId) {
    if (!savedComment.inlineDiffData || !savedComment.inlineDiffState) {
      console.warn('Missing inline diff data for template suggestion:', savedComment.id);
      return false;
    }

    try {
      // Get the document container using the specific documentId
      const container = document.getElementById(`document-${documentId}`);
      if (!container) {
        console.warn(`Document container not found: document-${documentId}`);
        return false;
      }

      const templateEditor = container.querySelector('.template-editor');
      if (!templateEditor) {
        console.warn(`Template editor not found in container document-${documentId}`);
        return false;
      }

      console.log('Restoring template suggestion inline diff:', savedComment.id);
      
      const commentId = savedComment.id;
      const diffData = savedComment.inlineDiffData;
      const diffState = savedComment.inlineDiffState;
      
      // Check if the diff is still active (not applied)
      if (diffState.isActive) {
        // Use contentWithDiff if available (debug version), otherwise appliedHtml (production version)
        const diffHtml = diffState.contentWithDiff || diffState.appliedHtml;
        
        if (diffHtml) {
          templateEditor.innerHTML = diffHtml;
          
          // Wait a moment for DOM to update
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Restore the window.currentInlineDiffs data for immediate use
          if (!window.currentInlineDiffs) {
            window.currentInlineDiffs = {};
          }
          window.currentInlineDiffs[commentId] = {
            suggestion: savedComment.aiSuggestion,
            commentData: savedComment,
            originalText: diffData.targetText,
            newText: diffData.newText,
            changeType: diffData.changeType,
            characterStart: diffData.characterStart,
            characterEnd: diffData.characterEnd,
            lineNumber: diffData.lineNumber
          };
          
          // Reattach event listeners for accept/reject actions using the specific documentId
          const { addInlineDiffEventListeners } = await import('./comment-translation.js');
          addInlineDiffEventListeners(commentId, documentId, true); // Force reattach during restoration
          
          console.log(`Successfully restored inline diff for template suggestion: ${commentId}`);
          return true;
          
        } else {
          console.warn('No diff HTML found in saved state for:', commentId);
          
          // Try to recreate the diff from scratch using the original logic
          if (diffState.originalContent && diffData.targetText && diffData.newText) {
            const originalContent = diffState.originalContent;
            const targetText = diffData.targetText;
            const newText = diffData.newText;
            
            if (originalContent.includes(targetText)) {
              const inlineDiffHtml = `<span class="inline-diff-delete" data-comment-id="${commentId}" title="Click to accept/reject">${targetText}</span><span class="inline-diff-add" data-comment-id="${commentId}" title="Click to accept/reject">${newText}</span>`;
              const contentWithDiff = originalContent.replace(targetText, inlineDiffHtml);
              
              templateEditor.innerHTML = contentWithDiff;
              
              // Wait a moment for DOM to update
              await new Promise(resolve => setTimeout(resolve, 10));
              
              // Update the saved state with the recreated HTML
              savedComment.inlineDiffState.contentWithDiff = contentWithDiff;
              
              // Restore currentInlineDiffs
              if (!window.currentInlineDiffs) {
                window.currentInlineDiffs = {};
              }
              window.currentInlineDiffs[commentId] = {
                suggestion: savedComment.aiSuggestion,
                commentData: savedComment,
                originalText: targetText,
                newText: newText,
                changeType: diffData.changeType
              };
              
              // Reattach event listeners using the specific documentId
              const { addInlineDiffEventListeners } = await import('./comment-translation.js');
              addInlineDiffEventListeners(commentId, documentId, true); // Force reattach during restoration
              
              console.log(`Successfully recreated inline diff for: ${commentId}`);
              return true;
            } else {
              console.warn('Target text not found in original content during recreation');
              return false;
            }
          }
          
          return false;
        }
        
      } else {
        console.log(`Template suggestion ${commentId} was already applied, skipping diff restoration`);
        return false;
      }

    } catch (error) {
      console.error('Error recreating template suggestion diff:', error);
      return false;
    }
  }

  // Sync comments between windows - properly handle additions and deletions
  async syncDocumentComments(documentId, freshDoc) {
    try {
      // Import required modules
      const [{ state }, { removeFloatingAnnotation }, { refreshHighlightEventListeners }] = await Promise.all([
        import('./state.js'),
        import('./annotations.js'),
        import('./comments.js')
      ]);

      // Get current comments in local state
      const currentComments = { ...state.comments };
      const freshComments = freshDoc.comments || {};

      // Find comments that were deleted (exist locally but not in fresh data)
      for (const commentId in currentComments) {
        if (!(commentId in freshComments)) {
          console.log(`Comment ${commentId} was deleted by another user, removing locally`);
          
          // Remove highlight for this comment
          const highlights = document.querySelectorAll(`.text-comment-highlight[data-comment-id="${commentId}"]`);
          highlights.forEach(highlight => {
            highlight.replaceWith(document.createTextNode(highlight.textContent));
          });
          
          // Remove annotation window
          removeFloatingAnnotation(commentId);
          
          // Don't trigger auto-save here since this is sync from backend
        }
      }

      // Find comments that were added (exist in fresh data but not locally)
      for (const commentId in freshComments) {
        if (!(commentId in currentComments)) {
          console.log(`Comment ${commentId} was added by another user, adding locally`);
          
          // Add the new comment to local state
          const savedComment = freshComments[commentId];
          const restoredComment = {
            id: savedComment.id,
            selectedText: savedComment.selectedText,
            commentMessage: savedComment.commentMessage,
            mode: savedComment.mode,
            author: savedComment.author,
            authorName: savedComment.authorName,
            authorEmoji: savedComment.authorEmoji,
            authorColor: savedComment.authorColor,
            createdAt: savedComment.createdAt,
            selectionRange: savedComment.selectionRange,
            isResolved: savedComment.isResolved || false,
            isActive: savedComment.isActive !== false,
            detailedRangeInfo: savedComment.detailedRangeInfo,
            
            // Restore conversation messages
            messages: savedComment.messages || [],
            
            // Restore AI suggestion-specific properties for syncing
            isAISuggestion: savedComment.isAISuggestion || false,
            lineDiffs: savedComment.lineDiffs,
            currentTemplate: savedComment.currentTemplate,
            suggestedTemplate: savedComment.suggestedTemplate,
            aiMessage: savedComment.aiMessage,
            requestedBy: savedComment.requestedBy,
            
            ui: {
              position: savedComment.uiState?.position || null,
              element: null,
              isVisible: savedComment.uiState?.isVisible !== false,
              isDragging: false
            }
          };

          state.comments[commentId] = restoredComment;
          
          // Recreate UI for this specific comment
          await this.recreateCommentUIElements({ [commentId]: savedComment }, state, documentId);
        } else {
          // Comment exists, but check if messages have been updated
          const savedComment = freshComments[commentId];
          const currentComment = currentComments[commentId];
          
          const freshMessages = savedComment.messages || [];
          const currentMessages = currentComment.messages || [];
          
          if (freshMessages.length > currentMessages.length) {
            console.log(`Comment ${commentId} has new messages from other users, syncing...`);
            
            // Update messages in local state
            currentComment.messages = freshMessages;
            
            // Update the UI if the annotation window is visible
            const { updateAnnotationMessagesUI } = await import('./annotations.js');
            const element = document.getElementById(commentId);
            if (element && element.style.display !== 'none') {
              updateAnnotationMessagesUI(commentId);
            }
          }
        }
      }

      // Refresh highlight event listeners to ensure interactions work
      refreshHighlightEventListeners(true);

    } catch (error) {
      console.error('Error syncing document comments:', error);
    }
  }
}

// Create global instance for easy access
window.documentManager = new DocumentManager(); 
