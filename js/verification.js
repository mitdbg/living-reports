// Verification Module
import { getCurrentUser } from './auth.js';
import { state, windowId } from './state.js';

// Create window-specific storage for verification functionality
const VERIFICATION_KEY = `verification_${windowId}`;
if (!window[VERIFICATION_KEY]) {
  window[VERIFICATION_KEY] = {
    verificationInitialized: false,
    eventDelegationSetup: false,
    currentVerifications: [] // Store verification history
  };
}

const verificationData = window[VERIFICATION_KEY];

// Setup event delegation for verify button
function setupVerifyButtonEventDelegation() {
  if (verificationData.eventDelegationSetup) {
    return;
  }
  
  // Add global event delegation for verify button
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('verify-template-btn')) {
      handleVerifyClick();
    }
  });
  
  verificationData.eventDelegationSetup = true;
  window[VERIFICATION_KEY] = verificationData;
}

// Save verification to backend
async function saveVerificationToBackend(verificationData) {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/verify-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: state.sessionId,
        user_id: verificationData.userId,
        user_name: verificationData.userName,
        user_emoji: verificationData.userEmoji,
        verified_at: verificationData.verifiedAt,
        document_content: verificationData.documentContent
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Verification saved to backend:', result);
    return result;
  } catch (error) {
    console.error('Error saving verification to backend:', error);
    throw error;
  }
}

// Load verification history from backend
async function loadVerificationFromBackend() {
  try {
    const response = await fetch(`http://127.0.0.1:5000/api/get-verification/${state.sessionId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No verification found, this is normal for new documents
        return { verifications: [] };
      }
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();
    
    // Map backend property names to frontend expected names
    const mappedVerifications = (result.verifications || []).map(v => ({
      userId: v.user_id,
      userName: v.user_name,
      userEmoji: v.user_emoji,
      verifiedAt: v.verified_at,
      displayTime: new Date(v.verified_at).toLocaleString(),
      documentContent: v.document_content || ''
    }));
    
    verificationData.currentVerifications = mappedVerifications;
    window[VERIFICATION_KEY] = verificationData;
    
    console.log('Verification loaded from backend:', { 
      count: mappedVerifications.length,
      latest: mappedVerifications[0] 
    });
    return { verifications: mappedVerifications };
  } catch (error) {
    console.error('Error loading verification from backend:', error);
    // Don't throw error, just return empty verifications
    return { verifications: [] };
  }
}

// Get current document content for verification
function getCurrentDocumentContent() {
  const activeContainer = getActiveDocumentContainer();
  if (!activeContainer) {
    return '';
  }
  
  // Try to get content from preview panel first, then template editor
  const previewContent = activeContainer.querySelector('.preview-content');
  const templateEditor = activeContainer.querySelector('.template-editor');
  
  if (previewContent && previewContent.textContent.trim()) {
    return previewContent.textContent.trim();
  } else if (templateEditor && templateEditor.textContent.trim()) {
    return templateEditor.textContent.trim();
  }
  
  return '';
}

// Handle verify button click
async function handleVerifyClick() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.log('No user authenticated');
    return;
  }
  
  // Get the active document container
  const activeContainer = getActiveDocumentContainer();
  if (!activeContainer) {
    console.log('No active document container found');
    return;
  }
  
  // Get current document content
  const documentContent = getCurrentDocumentContent();
  
  // Create verification data
  const now = new Date();
  const verification = {
    userId: currentUser.id,
    userName: currentUser.name,
    userEmoji: currentUser.emoji,
    verifiedAt: now.toISOString(),
    displayTime: now.toLocaleString(),
    documentContent: documentContent
  };
  
  try {
    // Save to backend first
    await saveVerificationToBackend(verification);
    
    // Add to local storage
    verificationData.currentVerifications.push(verification);
    window[VERIFICATION_KEY] = verificationData;
    
    // Update UI
    updateVerificationDisplay(activeContainer);
    
    console.log(`Document verified by ${currentUser.name} at ${verification.displayTime}`);
  } catch (error) {
    console.error('Failed to save verification:', error);
    // Still update UI even if backend save failed
    verificationData.currentVerifications.push(verification);
    window[VERIFICATION_KEY] = verificationData;
    updateVerificationDisplay(activeContainer);
  }
}

// Update verification display with all verifications
function updateVerificationDisplay(container) {
  const verificationStatus = container.querySelector('.verification-status');
  const verificationMessage = container.querySelector('.verification-message');
  
  if (!verificationStatus || !verificationMessage) {
    console.log('Verification status elements not found');
    return;
  }
  
  const verifications = verificationData.currentVerifications || [];
  
  if (verifications.length === 0) {
    verificationStatus.style.display = 'none';
    return;
  }
  
  // Show the most recent verification prominently
  const latestVerification = verifications[verifications.length - 1];
  
  // Validate verification data to prevent undefined values
  const userName = latestVerification.userName || 'Unknown User';
  const userEmoji = latestVerification.userEmoji || '👤';
  const displayTime = latestVerification.displayTime || 'Unknown time';
  
  console.log('Displaying verification:', { userName, userEmoji, displayTime });
  
  // Create verification display
  let displayHtml = `
    <div class="latest-verification">
      <span class="verification-text">✅ Verified by ${userName} ${userEmoji} at ${displayTime}</span>
    </div>
  `;
  
  // If there are multiple verifications, show a summary
  if (verifications.length > 1) {
    displayHtml += `
      <div class="verification-history">
        <details class="verification-details">
          <summary class="verification-summary">View verification history (${verifications.length} total)</summary>
          <div class="verification-list">
    `;
    
    // Show all verifications in reverse chronological order
    for (let i = verifications.length - 1; i >= 0; i--) {
      const v = verifications[i];
      const isLatest = i === verifications.length - 1;
      
      // Validate each verification item
      const vUserName = v.userName || 'Unknown User';
      const vUserEmoji = v.userEmoji || '👤';
      const vDisplayTime = v.displayTime || 'Unknown time';
      
      displayHtml += `
        <div class="verification-item ${isLatest ? 'latest' : ''}">
          <span class="verification-user">${vUserEmoji} ${vUserName}</span>
          <span class="verification-time">${vDisplayTime}</span>
        </div>
      `;
    }
    
    displayHtml += `
          </div>
        </details>
      </div>
    `;
  }
  
  verificationMessage.innerHTML = displayHtml;
  
  // Show the verification status with animation
  verificationStatus.style.display = 'block';
  verificationStatus.classList.add('fade-in');
  
  // Remove animation class after animation completes
  setTimeout(() => {
    verificationStatus.classList.remove('fade-in');
  }, 500);
}

// Helper function to get the active document container
function getActiveDocumentContainer() {
  // Find the active document tab content (not the template)
  const activeContent = document.querySelector('.tab-content.active:not(.document-tab-template)');
  if (activeContent) {
    return activeContent;
  }
  
  // Fallback: find any visible tab content that's not the template
  const visibleContent = document.querySelector('.tab-content[style*="flex"]:not(.document-tab-template), .tab-content:not([style*="none"]):not(.document-tab-template)');
  if (visibleContent) {
    return visibleContent;
  }
  
  return null;
}

// Load and display existing verification on document load
export async function loadDocumentVerification() {
  console.log('Loading document verification for session:', state.sessionId);
  
  try {
    const result = await loadVerificationFromBackend();
    
    // Update UI if we have verifications
    if (result.verifications && result.verifications.length > 0) {
      console.log('Found verifications, updating UI:', result.verifications.length);
      const activeContainer = getActiveDocumentContainer();
      if (activeContainer) {
        updateVerificationDisplay(activeContainer);
        console.log('✅ Verification display updated');
      } else {
        console.warn('No active container found for verification display');
      }
    } else {
      console.log('No verifications found for this document');
    }
  } catch (error) {
    console.error('Error loading document verification:', error);
  }
}

// Clear verification status
export function clearVerificationStatus() {
  const activeContainer = getActiveDocumentContainer();
  if (!activeContainer) {
    return;
  }
  
  const verificationStatus = activeContainer.querySelector('.verification-status');
  if (verificationStatus) {
    verificationStatus.style.display = 'none';
  }
  
  // Clear local data
  verificationData.currentVerifications = [];
  window[VERIFICATION_KEY] = verificationData;
}

// Check if document is verified
export function isDocumentVerified() {
  return verificationData.currentVerifications && verificationData.currentVerifications.length > 0;
}

// Get verification history
export function getVerificationHistory() {
  return verificationData.currentVerifications || [];
}

// Get latest verification
export function getLatestVerification() {
  const verifications = verificationData.currentVerifications || [];
  return verifications.length > 0 ? verifications[verifications.length - 1] : null;
}

// Initialize verification functionality
export function initVerification() {
  if (verificationData.verificationInitialized) {
    return;
  }
  
  console.log(`[${windowId}] Initializing verification functionality...`);
  
  setupVerifyButtonEventDelegation();
  
  verificationData.verificationInitialized = true;
  window[VERIFICATION_KEY] = verificationData;
  
  console.log(`[${windowId}] Verification functionality initialized`);
}

// Reset verification initialization (for testing/debugging)
export function resetVerificationInitialization() {
  verificationData.verificationInitialized = false;
  verificationData.eventDelegationSetup = false;
  verificationData.currentVerifications = [];
  window[VERIFICATION_KEY] = verificationData;
} 