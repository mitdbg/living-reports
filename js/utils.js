// Utility Functions Module

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function truncateContent(content, inVariableMode = false) {
  if (!content) return '';
  // Don't truncate content when in variable mode
  if (inVariableMode) return content;
  return content.length > 100 ? content.substring(0, 97) + '...' : content;
}

// Format timestamp for display
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  
  const timeOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };

  // Show date and time for other days: "Dec 15, 2:34 PM"
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    ...timeOptions
  });
}

// Positioning utilities for comment boxes
export function calculateSafePosition(initialLeft, initialTop, boxWidth = 220, boxHeight = 120) {
  // Get the content panel bounds instead of viewport for more accurate positioning
  const contentPanel = document.querySelector('.content-panel');
  const viewportWidth = contentPanel ? contentPanel.clientWidth : window.innerWidth;
  const viewportHeight = contentPanel ? contentPanel.clientHeight : window.innerHeight;
  
  let left = initialLeft;
  let top = initialTop;
  
  // Try the initial position first
  if (left >= 20 && left + boxWidth <= viewportWidth - 20 && 
      top >= 20 && top + boxHeight <= viewportHeight - 20) {
    return { left, top }; // Initial position is fine
  }
  
  // If initial position doesn't work, try different positions around the cursor
  const positions = [
    // Right of cursor
    { left: initialLeft + 20, top: initialTop - boxHeight / 2 },
    // Left of cursor  
    { left: initialLeft - boxWidth - 20, top: initialTop - boxHeight / 2 },
    // Above cursor
    { left: initialLeft - boxWidth / 2, top: initialTop - boxHeight - 20 },
    // Below cursor (original)
    { left: initialLeft - boxWidth / 2, top: initialTop + 20 },
  ];
  
  // Try each position and use the first one that fits
  for (const pos of positions) {
    if (pos.left >= 20 && pos.left + boxWidth <= viewportWidth - 20 && 
        pos.top >= 20 && pos.top + boxHeight <= viewportHeight - 20) {
      return { left: pos.left, top: pos.top };
    }
  }
  
  // If none of the preferred positions work, clamp to viewport bounds
  left = Math.max(20, Math.min(initialLeft, viewportWidth - boxWidth - 20));
  top = Math.max(20, Math.min(initialTop, viewportHeight - boxHeight - 20));
  
  return { left, top };
}

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Generate unique IDs
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract text content from contenteditable elements while preserving line breaks
 * Converts <br>, <div>, <p> and other block elements to \n characters
 * @param {HTMLElement} element - The contenteditable element
 * @returns {string} - Text content with proper line breaks
 */
export function getTextContentWithLineBreaks(element) {
  if (!element) return '';
  
  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true);
  
  // Convert various line break elements to \n
  // Handle <br> tags
  const brElements = clone.querySelectorAll('br');
  brElements.forEach(br => {
    br.replaceWith('\n');
  });
  
  // Handle block elements that should create line breaks
  const blockElements = clone.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, li, blockquote');
  blockElements.forEach((block, index) => {
    // Add line break before block element (except for the first one)
    if (index > 0 || block.previousSibling) {
      block.insertAdjacentText('beforebegin', '\n');
    }
    
    // Add line break after block element (except for the last one)
    if (block.nextSibling) {
      block.insertAdjacentText('afterend', '\n');
    }
  });
  
  // Get the text content and clean up multiple consecutive newlines
  let textContent = clone.textContent || '';
  
  // Clean up: remove excessive newlines but preserve intentional ones
  textContent = textContent
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/^\n+/, '') // Remove leading newlines
    .replace(/\n+$/, ''); // Remove trailing newlines
  
  return textContent;
} 