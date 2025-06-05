// Sharing Module - Share documents with other users
import { state, elements, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { getCurrentUser } from './auth.js';

// Create window-specific storage for initialization flags and handlers
const SHARING_KEY = `sharing_${windowId}`;
if (!window[SHARING_KEY]) {
  window[SHARING_KEY] = {
    sharingInitialized: false,
    shareHandler: null,
    currentShareBtn: null,
    shareDialog: null,
    selectedUsers: new Set()
  };
}

const sharingData = window[SHARING_KEY];

// Available users in the system
const AVAILABLE_USERS = [
  { id: 'alice', name: 'Alice', emoji: '👩‍💼', color: '#4285f4' },
  { id: 'bob', name: 'Bob', emoji: '👨‍💻', color: '#34a853' },
  { id: 'charlie', name: 'Charlie', emoji: '👨‍🎨', color: '#fbbc04' }
];

// Get online users (mock implementation - in real app this would come from WebSocket)
function getOnlineUsers() {
  const currentUser = getCurrentUser();
  // For demo purposes, assume all users except current are online
  return AVAILABLE_USERS.filter(user => user.id !== currentUser?.id);
}

// Show user selection dialog
function showShareDialog(doc) {
  const dialog = document.getElementById('share-dialog') || createShareDialog();
  
  // Set up event listeners if not already done
  if (!dialog.hasAttribute('data-listeners-setup')) {
    console.log('Setting up event listeners for share dialog');
    setupDialogEventListeners(dialog);
    dialog.setAttribute('data-listeners-setup', 'true');
  }
  
  // Update document info
  const titleEl = dialog.querySelector('#share-document-title');
  const previewEl = dialog.querySelector('#share-document-preview');
  
  titleEl.textContent = doc.title;
  previewEl.textContent = (doc.code_content || '').substring(0, 100) + ((doc.code_content || '').length > 100 ? '...' : '');
  
  // Populate user list
  populateUserList(dialog);
  
  // Show dialog
  dialog.style.display = 'flex';
  
  // Store reference
  sharingData.shareDialog = dialog;
  sharingData.currentDocument = doc;
}

// Create share dialog if it doesn't exist
function createShareDialog() {
  // Use the existing dialog from HTML
  let dialog = document.getElementById('share-dialog');
  if (dialog) {
    console.log('Using existing share dialog from HTML');
    return dialog;
  }
  
  console.log('Creating new share dialog (fallback)');
  
  // Create new dialog as fallback
  dialog = document.createElement('div');
  dialog.id = 'share-dialog';
  dialog.className = 'share-dialog';
  dialog.style.display = 'none';
  
  dialog.innerHTML = `
    <div class="dialog-overlay">
      <div class="dialog-content">
        <h3>📤 Share Document</h3>
        <p>Select users to share this document with:</p>
        
        <div class="document-info">
          <div class="document-title" id="share-document-title">Document Title</div>
          <div class="document-preview" id="share-document-preview">Document preview...</div>
        </div>
        
        <div class="user-selection">
          <h4>Available Users:</h4>
          <div class="user-list" id="share-user-list">
            <!-- Users will be populated here -->
          </div>
        </div>
        
        <div class="dialog-actions">
          <button class="btn-primary" id="confirm-share-btn">Share Document</button>
          <button class="btn-secondary" id="cancel-share-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  return dialog;
}

// Populate user list in the dialog
function populateUserList(dialog) {
  const userList = dialog.querySelector('#share-user-list');
  const onlineUsers = getOnlineUsers();
  
  userList.innerHTML = '';
  
  onlineUsers.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = user.id;
    
    userItem.innerHTML = `
      <input type="checkbox" class="user-checkbox" id="user-${user.id}">
      <div class="user-avatar" style="border-color: ${user.color};">
        ${user.emoji}
      </div>
      <div class="user-info">
        <div class="user-name">${user.name}</div>
        <div class="user-status">
          <span class="status-dot online"></span>
          Online
        </div>
      </div>
    `;
    
    // Add click handler
    userItem.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        const checkbox = userItem.querySelector('.user-checkbox');
        checkbox.checked = !checkbox.checked;
      }
      
      const checkbox = userItem.querySelector('.user-checkbox');
      if (checkbox.checked) {
        userItem.classList.add('selected');
        sharingData.selectedUsers.add(user.id);
      } else {
        userItem.classList.remove('selected');
        sharingData.selectedUsers.delete(user.id);
      }
      
      updateShareButton(dialog);
    });
    
    userList.appendChild(userItem);
  });
}

// Setup dialog event listeners
function setupDialogEventListeners(dialog) {
  console.log('Setting up dialog event listeners for dialog:', dialog);
  console.log('Dialog HTML:', dialog.innerHTML.substring(0, 200) + '...');
  
  // Use event delegation on the dialog itself
  dialog.addEventListener('click', (e) => {
    console.log('=== DIALOG CLICK EVENT ===');
    console.log('Target element:', e.target);
    console.log('Target ID:', e.target.id);
    console.log('Target className:', e.target.className);
    console.log('Target tagName:', e.target.tagName);
    console.log('========================');
    
    if (e.target.id === 'confirm-share-btn') {
      console.log('Confirm button clicked via delegation');
      e.preventDefault();
      e.stopPropagation();
      shareWithSelectedUsers();
    } else if (e.target.id === 'cancel-share-btn') {
      console.log('Cancel button clicked via delegation');
      e.preventDefault();
      e.stopPropagation();
      hideShareDialog();
    } else if (e.target.classList.contains('dialog-overlay')) {
      console.log('Overlay clicked, hiding dialog');
      hideShareDialog();
    } else {
      console.log('Click on unhandled element');
    }
  });
  
  // Also try direct event listeners as backup
  const confirmBtn = dialog.querySelector('#confirm-share-btn');
  const cancelBtn = dialog.querySelector('#cancel-share-btn');
  
  console.log('Direct button references:', {
    confirmBtn: !!confirmBtn,
    cancelBtn: !!cancelBtn,
    confirmBtnId: confirmBtn?.id,
    cancelBtnId: cancelBtn?.id
  });
  
  // Add direct listeners as well
  if (cancelBtn) {
    console.log('Adding direct listener to cancel button');
    cancelBtn.addEventListener('click', (e) => {
      console.log('DIRECT Cancel button clicked');
      e.preventDefault();
      e.stopPropagation();
      hideShareDialog();
    });
  }
  
  if (confirmBtn) {
    console.log('Adding direct listener to confirm button');
    confirmBtn.addEventListener('click', (e) => {
      console.log('DIRECT Confirm button clicked');
      e.preventDefault();
      e.stopPropagation();
      shareWithSelectedUsers();
    });
  }
}

// Update share button state
function updateShareButton(dialog) {
  const confirmBtn = dialog.querySelector('#confirm-share-btn');
  const hasSelection = sharingData.selectedUsers.size > 0;
  
  confirmBtn.disabled = !hasSelection;
  confirmBtn.textContent = hasSelection 
    ? `Share with ${sharingData.selectedUsers.size} user${sharingData.selectedUsers.size > 1 ? 's' : ''}`
    : 'Select users to share';
}

// Hide share dialog
function hideShareDialog() {
  console.log('hideShareDialog called');
  if (sharingData.shareDialog) {
    sharingData.shareDialog.style.display = 'none';
    sharingData.selectedUsers.clear();
    sharingData.currentDocument = null;
    console.log('Dialog hidden successfully');
  } else {
    console.error('No dialog to hide');
  }
}

// Share with selected users
async function shareWithSelectedUsers() {
  console.log('shareWithSelectedUsers called, selected users:', Array.from(sharingData.selectedUsers));
  
  if (sharingData.selectedUsers.size === 0) {
    addMessageToUI('system', 'Please select at least one user to share with.');
    return;
  }
  
  const doc = sharingData.currentDocument;
  const selectedUserNames = Array.from(sharingData.selectedUsers).map(userId => {
    const user = AVAILABLE_USERS.find(u => u.id === userId);
    return user ? user.name : userId;
  });
  
  // Update document with current content
  doc.code_content = elements.codeEditor.textContent;
  doc.preview_content = elements.previewContent.innerHTML;
  doc.lastModified = new Date().toISOString();
  
  // Add sharing metadata - add selected users to editors list
  const selectedUserIds = Array.from(sharingData.selectedUsers);
  
  // Add users as editors (they can edit the document)
  selectedUserIds.forEach(userId => {
    if (!doc.editors.includes(userId)) {
      doc.editors.push(userId);
    }
    // Remove from viewers if they're now editors
    const viewerIndex = doc.viewers.indexOf(userId);
    if (viewerIndex > -1) {
      doc.viewers.splice(viewerIndex, 1);
    }
  });
  
  // Mark document as shared and save
  if (selectedUserIds.length > 0) {
    doc.isShared = true;
  }
  doc.sharedAt = new Date().toISOString();
  doc.sharedBy = getCurrentUser()?.id || windowId;
  
  // Share the document via DocumentManager
  const documentManager = window.documentManager;
  const success = await documentManager.shareDocument(doc.id);
  
  if (success) {
    // Show success message
    addMessageToUI('system', `📤 Document "${doc.title}" shared successfully with: ${selectedUserNames.join(', ')}!`);
    
    // Hide dialog
    hideShareDialog();
    
    // Notify other users via WebSocket if available
    notifySharedUsers(doc, Array.from(sharingData.selectedUsers));
  }
}

// Notify shared users (functionality removed - using HTTP polling instead)
function notifySharedUsers(doc, userIds) {
  // WebSocket functionality removed - documents are shared via backend HTTP API
  console.log(`Document ${doc.title} shared with users:`, userIds);
}

// Share the current document with other users
export async function shareCurrentDocument() {
  // Get the active document from DocumentManager
  const documentManager = window.documentManager;
  if (!documentManager) {
    addMessageToUI('system', 'Document manager not available');
    return;
  }
  
  const activeDoc = documentManager.getActiveDocument();
  if (!activeDoc) {
    addMessageToUI('system', '**No document to share!** Please create or open a document first.');
    return;
  }
  
  // Check if we have content to share
  if (!elements.codeEditor.textContent.trim() && !elements.previewContent.innerHTML.trim()) {
    addMessageToUI('system', '**No content to share!** Please add some content to the document first.');
    return;
  }
  
  // Show user selection dialog
  showShareDialog(activeDoc);
}

// Initialize sharing functionality
export function initSharing() {
  if (!elements.shareBtn) {
    console.error(`[${windowId}] Share button not found!`);
    return;
  }
  
  // Remove existing event listener from the previous button if it exists
  if (sharingData.shareHandler && sharingData.currentShareBtn) {
    console.log(`[${windowId}] Removing event listener from previous share button`);
    sharingData.currentShareBtn.removeEventListener('click', sharingData.shareHandler);
  }
  
  // Create new event handler for document sharing
  sharingData.shareHandler = () => {
    console.log(`[${windowId}] Share document button clicked`);
    shareCurrentDocument();
  };
  
  elements.shareBtn.addEventListener('click', sharingData.shareHandler);
  
  // Track which button currently has the listener
  sharingData.currentShareBtn = elements.shareBtn;
  
  console.log(`[${windowId}] Document sharing initialized`);
  
  // Mark as initialized
  sharingData.sharingInitialized = true;
  window[SHARING_KEY] = sharingData;
}

// Function to reset initialization flag (for DocumentManager)
export function resetSharingInitialization() {
  // Clean up existing event listener before resetting
  if (sharingData.shareHandler && sharingData.currentShareBtn) {
    console.log(`[${windowId}] Cleaning up share event listener during reset`);
    sharingData.currentShareBtn.removeEventListener('click', sharingData.shareHandler);
  }
  
  sharingData.sharingInitialized = false;
  sharingData.shareHandler = null;
  sharingData.currentShareBtn = null;
  window[SHARING_KEY] = sharingData;
} 