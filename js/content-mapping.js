// Content-to-Template Mapping Module
import { state, elements } from './state.js';
import { switchToTemplate } from './modes.js';

let initialized = false;

/**
 * Initialize content-to-template mapping functionality
 */
export function initContentMapping() {
  if (initialized) {
    console.log('Content mapping already initialized, skipping...');
    return;
  }
  
  console.log('Initializing content-to-template mapping...');
  
  // Set up click handlers for variable references
  setupVariableReferenceHandlers();
  
  // Set up hover handlers for template highlighting
  setupTemplateHighlighting();
  
  initialized = true;
}

/**
 * Reset initialization state to allow re-initialization
 */
export function resetContentMappingInitialization() {
  console.log('Resetting content mapping initialization...');
  initialized = false;
  
  // Remove existing event listeners
  if (elements.previewContent) {
    elements.previewContent.removeEventListener('click', handleVariableClick);
    elements.previewContent.removeEventListener('mouseover', handleVariableHover);
    elements.previewContent.removeEventListener('mouseout', handleVariableMouseOut);
  }
}

/**
 * Set up click handlers for variable references in preview content
 */
function setupVariableReferenceHandlers() {
  if (!elements.previewContent) {
    console.warn('Preview content element not found for content mapping');
    return;
  }
  
  // Add event listener for clicks on variable references
  elements.previewContent.addEventListener('click', handleVariableClick);
}

/**
 * Handle clicks on variable references
 */
function handleVariableClick(event) {
  const varRef = event.target.closest('.var-ref');
  if (!varRef) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  const varName = varRef.getAttribute('data-var');
  const instance = varRef.getAttribute('data-instance');
  const value = varRef.getAttribute('data-value');
  
  console.log(`🎯 Clicked on variable reference: ${varName} (instance: ${instance}, value: ${value})`);
  
  // Switch to template mode
  switchToTemplate();
  
  // Find and highlight the variable in template
  highlightVariableInTemplate(varName, instance);
  
}

/**
 * Set up hover handlers for template highlighting
 */
function setupTemplateHighlighting() {
  if (!elements.previewContent) {
    console.warn('Preview content element not found for template highlighting');
    return;
  }
  
  // Add hover event listeners
  elements.previewContent.addEventListener('mouseover', handleVariableHover);
  elements.previewContent.addEventListener('mouseout', handleVariableMouseOut);
}

/**
 * Handle mouse hover over variable references
 */
function handleVariableHover(event) {
  const varRef = event.target.closest('.var-ref');
  if (!varRef) return;
  
  const varName = varRef.getAttribute('data-var');
  
  // Highlight corresponding template variable
  highlightTemplateVariable(varName, true);
}

/**
 * Handle mouse out from variable references
 */
function handleVariableMouseOut(event) {
  const varRef = event.target.closest('.var-ref');
  if (!varRef) return;
  
  const varName = varRef.getAttribute('data-var');
  
  // Remove highlight from template variable
  highlightTemplateVariable(varName, false);
}

/**
 * Highlight a variable in the template editor
 */
function highlightVariableInTemplate(varName, instance) {
  if (!elements.templateEditor) {
    console.warn('Template editor not found for highlighting');
    return;
  }
  
  // Get template content
  const templateContent = elements.templateEditor.textContent || elements.templateEditor.value || '';
  
  // Find variable definition pattern: {{varName:=...}}
  const definitionPattern = new RegExp(`\\{\\{\\s*${varName}\\s*:=.*?\\}\\}`, 'g');
  // Find variable usage pattern: $varName
  const usagePattern = new RegExp(`\\$${varName}\\b`, 'g');
  
  let matches = [];
  let match;
  
  // Find all definition matches
  while ((match = definitionPattern.exec(templateContent)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'definition'
    });
  }
  
  // Find all usage matches
  usagePattern.lastIndex = 0; // Reset regex
  while ((match = usagePattern.exec(templateContent)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'usage'
    });
  }
  
  if (matches.length === 0) {
    console.warn(`Variable ${varName} not found in template`);
    return;
  }
  
  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);
  
  // Determine which match to focus on based on instance
  let targetMatch;
  if (instance && parseInt(instance) <= matches.filter(m => m.type === 'usage').length) {
    // Find the specific usage instance
    const usageMatches = matches.filter(m => m.type === 'usage');
    targetMatch = usageMatches[parseInt(instance) - 1];
  } else {
    // Default to first definition, or first usage if no definition
    targetMatch = matches.find(m => m.type === 'definition') || matches[0];
  }
  
  // Scroll to and highlight the target match
  if (targetMatch) {
    scrollToPositionInTemplate(targetMatch.start, targetMatch.end);
  }
}

/**
 * Highlight/unhighlight template variable on hover
 */
function highlightTemplateVariable(varName, highlight) {
  if (!elements.templateEditor) return;
  
  // This is a simple implementation - in a more sophisticated editor,
  // you might want to use a code editor library that supports syntax highlighting
  if (highlight) {
    elements.templateEditor.setAttribute('data-highlight-var', varName);
  } else {
    elements.templateEditor.removeAttribute('data-highlight-var');
  }
}

/**
 * Scroll to a specific position in the template editor
 */
function scrollToPositionInTemplate(start, end) {
  if (!elements.templateEditor) return;
  
  try {
    // For contenteditable divs, use selection API
    if (elements.templateEditor.contentEditable === 'true') {
      const startPos = getTextNodeAtPosition(elements.templateEditor, start);
      const endPos = getTextNodeAtPosition(elements.templateEditor, end);
      
      if (startPos) {
        const range = document.createRange();
        
        // Set start position
        range.setStart(startPos.node, startPos.offset);
        
        // Set end position - handle case where end might be in a different node
        if (endPos && endPos.node === startPos.node) {
          // Same node - make sure we don't exceed node length
          const maxOffset = Math.min(endPos.offset, startPos.node.textContent.length);
          range.setEnd(startPos.node, maxOffset);
        } else if (endPos) {
          // Different nodes
          range.setEnd(endPos.node, endPos.offset);
        } else {
          // End position not found, just select from start to end of start node
          const maxOffset = Math.min(startPos.offset + (end - start), startPos.node.textContent.length);
          range.setEnd(startPos.node, maxOffset);
        }
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Scroll into view
        range.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add temporary highlight
        addTemporaryHighlight(range);
      }
    }
    // For textarea elements
    else if (elements.templateEditor.tagName === 'TEXTAREA') {
      elements.templateEditor.focus();
      elements.templateEditor.setSelectionRange(start, end);
      elements.templateEditor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (error) {
    console.warn('Error scrolling to template position:', error);
    // Fallback: just focus the template editor
    try {
      elements.templateEditor.focus();
    } catch (e) {
      console.warn('Error focusing template editor:', e);
    }
  }
}

/**
 * Get text node at a specific position in a contenteditable element
 */
function getTextNodeAtPosition(element, position) {
  let currentPos = 0;
  
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent.length;
      if (currentPos + length >= position) {
        return {
          node: node,
          offset: position - currentPos
        };
      }
      currentPos += length;
    } else {
      for (let child of node.childNodes) {
        const result = traverse(child);
        if (result) return result;
      }
    }
    return null;
  }
  
  return traverse(element);
}

/**
 * Add temporary highlight to a range
 */
function addTemporaryHighlight(range) {
  try {
    // Validate the range before using it
    if (!range || range.collapsed) {
      console.warn('Invalid or collapsed range for highlighting');
      return;
    }
    
    // Create a temporary highlight span
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'variable-highlight';
    highlightSpan.style.backgroundColor = '#fff3cd';
    highlightSpan.style.border = '1px solid #ffc107';
    highlightSpan.style.borderRadius = '3px';
    highlightSpan.style.padding = '1px 2px';
    
    // Check if the range can be surrounded
    try {
      // Clone the range to avoid modifying the original
      const clonedRange = range.cloneRange();
      clonedRange.surroundContents(highlightSpan);
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        if (highlightSpan.parentNode) {
          const parent = highlightSpan.parentNode;
          while (highlightSpan.firstChild) {
            parent.insertBefore(highlightSpan.firstChild, highlightSpan);
          }
          parent.removeChild(highlightSpan);
        }
      }, 3000);
    } catch (surroundError) {
      console.warn('Cannot surround range contents, using alternative highlight method:', surroundError);
      
      // Alternative: just add background color to the range
      try {
        const contents = range.extractContents();
        highlightSpan.appendChild(contents);
        range.insertNode(highlightSpan);
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
          if (highlightSpan.parentNode) {
            const parent = highlightSpan.parentNode;
            while (highlightSpan.firstChild) {
              parent.insertBefore(highlightSpan.firstChild, highlightSpan);
            }
            parent.removeChild(highlightSpan);
          }
        }, 3000);
      } catch (insertError) {
        console.warn('Alternative highlight method also failed:', insertError);
      }
    }
  } catch (error) {
    console.warn('Error adding temporary highlight:', error);
  }
}

/**
 * Extract variable mapping information from preview content
 */
export function extractVariableMappings() {
  if (!elements.previewContent) return [];
  
  const varRefs = elements.previewContent.querySelectorAll('.var-ref');
  const mappings = [];
  
  varRefs.forEach(varRef => {
    mappings.push({
      varName: varRef.getAttribute('data-var'),
      instance: varRef.getAttribute('data-instance'),
      value: varRef.getAttribute('data-value'),
      element: varRef
    });
  });
  
  return mappings;
}

/**
 * Get variable reference at a specific position in preview content
 */
export function getVariableReferenceAtPosition(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  
  const varRef = element.closest('.var-ref');
  if (!varRef) return null;
  
  return {
    varName: varRef.getAttribute('data-var'),
    instance: varRef.getAttribute('data-instance'),
    value: varRef.getAttribute('data-value'),
    element: varRef
  };
} 