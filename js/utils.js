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