// Verification Module
import { getCurrentUser } from './auth.js';
import { state, windowId } from './state.js';

// Create window-specific storage for verification functionality
const VERIFICATION_KEY = `verification_${windowId}`;
if (!window[VERIFICATION_KEY]) {
  window[VERIFICATION_KEY] = {
    verificationInitialized: false,
    eventDelegationSetup: false,
    verificationsByUser: {} // Store organized structure by user
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
    
    console.log("loaded verification result", result);
    
    verificationData.verificationsByUser = result.verifications; // Store organized structure
    window[VERIFICATION_KEY] = verificationData;

    console.log('Verification loaded from backend:', { 
      count: result.verifications.length,
      organized: result.verifications,
      users: Object.keys(result.verifications)
    });
    return result.verifications;
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

// Helper function to format timestamp like Python's datetime.now().isoformat()
function formatTimestampLikePython(date) {
  // Python's isoformat() returns: "2025-06-10T16:47:50.035463"
  // JavaScript toISOString() returns: "2025-06-10T08:47:50.030Z"
  
  // Get local time components (not UTC)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const microseconds = String(date.getMilliseconds() * 1000).padStart(6, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${microseconds}`;
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
    verifiedAt: formatTimestampLikePython(now),
    displayTime: now.toLocaleString(),
    documentContent: documentContent
  };
  
  try {
    // Save to backend first
    await saveVerificationToBackend(verification);
    
    // Reload verification data from backend to ensure we have latest
    await loadDocumentVerification();
    
    console.log(`Document verified by ${currentUser.name} at ${verification.displayTime}`);
  } catch (error) {
    console.error('Failed to save verification:', error);
    // Still reload data even if backend save failed
    await loadDocumentVerification();
  }
}

// Update verification display with all verifications
function updateVerificationDisplay(container) {
  const verificationStatus = container.querySelector('.verification-status');
  const verificationMessage = container.querySelector('.verification-message');
  
  if (!verificationStatus || !verificationMessage) {
    console.log('Verification status elements not found in container:', container);
    return;
  }
  
  const verifications = verificationData.verificationsByUser || {};
  if (Object.keys(verifications).length === 0) {
    console.log('No verifications to display');
    verificationStatus.style.display = 'none';
    return;
  }
  
  // Get the latest verification for each user using the organized structure
  const latestVerifications = [];
  
  for (const userId in verifications) {
    const userVerifications = verifications[userId];
    if (userVerifications && userVerifications.length > 0) {
      // Take the last item (latest chronologically)
      const latest = userVerifications[userVerifications.length - 1];
      latestVerifications.push(latest);
    }
  }
  
  // Sort by verification time (newest first)
  latestVerifications.sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at));

  console.log('Latest verifications by user:', latestVerifications.map(v => ({ 
    user: v.user_name, 
    time: v.verified_at 
  })));
  
  // Always show in multiple users format
  let displayHtml = '<div class="latest-verification">';
  
  latestVerifications.forEach((verification) => {
    const userName = verification.user_name || 'Unknown User';
    const userEmoji = verification.user_emoji || '👤';
    const displayTime = new Date(verification.verified_at).toLocaleString() || 'Unknown time';
    
    displayHtml += `
        <span class="verification-text">✅ Verified by:</span>
        <span class="verification-user">${userEmoji} ${userName}</span>
        <span class="verification-time">${displayTime}</span>
    `;
  });
  
  displayHtml += '</div>';
  
  verificationMessage.innerHTML = displayHtml;
  
  // Show the verification status with animation
  verificationStatus.style.display = 'block';
  verificationStatus.classList.add('fade-in');
  
  console.log('✅ Verification display updated in container');
  
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
    console.log("------------loaded verification result", result);
    
    // Update UI if we have verifications
    if (Object.keys(result).length > 0) {
      console.log('Found verifications, updating UI:', Object.keys(result).length);
      
      // Update verification display for ALL containers (template and preview)
      refreshVerificationForAllContainers();
      
      console.log('✅ Verification display updated for all containers');
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
  verificationData.verificationsByUser = {};
  window[VERIFICATION_KEY] = verificationData;
}

// Check if document is verified
export function isDocumentVerified() {
  return verificationData.verificationsByUser && Object.keys(verificationData.verificationsByUser).length > 0;
}

// Get verification history
export function getVerificationHistory() {
  return verificationData.verificationsByUser || {};
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
  verificationData.verificationsByUser = {};
  window[VERIFICATION_KEY] = verificationData;
}

// Update verification display for ALL containers (template and preview)
export function refreshVerificationForAllContainers() {
  // Find all document containers and update verification display for each
  const allContainers = document.querySelectorAll('.tab-content[data-document-id]');
  
  allContainers.forEach(container => {
    if (container.style.display !== 'none' && verificationData.verificationsByUser && Object.keys(verificationData.verificationsByUser).length > 0) {
      console.log('Refreshing verification display for container:', container.id);
      updateVerificationDisplay(container);
    }
  });
} 