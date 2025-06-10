from typing import Dict, Any, Optional, List
import re
import json
from dataclasses import dataclass
from enum import Enum

@dataclass
class CommentContext:
    """Context information for a comment"""
    comment_text: str
    selected_text: str
    mode: str  # 'preview', 'template', 'source'
    template_content: str
    preview_content: str
    source_content: str
    variables: Dict[str, Any]
    
class CommentIntent(Enum):
    """Classification of comment intent"""
    CHANGE_CONTENT = "change_content"  # User wants to change the text/content
    CHANGE_VARIABLE = "change_variable"  # User wants to modify a variable
    ADD_CONTENT = "add_content"  # User wants to add new content
    REMOVE_CONTENT = "remove_content"  # User wants to remove content
    CHANGE_LOGIC = "change_logic"  # User wants to modify template logic
    CLARIFICATION = "clarification"  # User wants explanation/clarification
    FORMAT_CHANGE = "format_change"  # User wants formatting changes

@dataclass
class CommentAnalysis:
    """Result of comment analysis"""
    intent: CommentIntent
    confidence: float
    keywords: List[str]
    suggested_action: str
    context_relevance: float

@dataclass
class TemplateEditSuggestion:
    """Suggested edit for template content"""
    original_comment: str
    selected_text: str
    suggested_change: str
    explanation: str
    confidence: float
    change_type: str
    original_text: str

class CommentTranslationService:
    """Service for translating user comments into template edit suggestions"""
    
    def __init__(self, llm_client):
        self.llm_client = llm_client
        
    def analyze_comment_intent(self, comment_context: CommentContext) -> CommentAnalysis:
        """
        Analyze the intent behind a user comment using simple NLP patterns.
        For this phase, we use pattern matching rather than advanced NLP.
        """
        comment_text = comment_context.comment_text.lower().strip()
        selected_text = comment_context.selected_text.lower().strip()
        
        # Define intent patterns
        intent_patterns = {
            CommentIntent.CHANGE_CONTENT: [
                r'\b(change|replace|update|modify|edit|fix|correct)\b',
                r'\bshould be\b', r'\binstead of\b', r'\brather than\b',
                r'\bwrong\b', r'\bincorrect\b', r'\bbetter\b'
            ],
            CommentIntent.CHANGE_VARIABLE: [
                r'\bvariable\b', r'\bvalue\b', r'\bparameter\b',
                r'\$\w+', r'\{\{.*\}\}', r'\bset.*to\b',
                r'\bassign\b', r'\bdefine\b'
            ],
            CommentIntent.ADD_CONTENT: [
                r'\badd\b', r'\binclude\b', r'\binsert\b', r'\bappend\b',
                r'\bneed more\b', r'\bmissing\b', r'\balso\b',
                r'\badditionally\b', r'\bplus\b'
            ],
            CommentIntent.REMOVE_CONTENT: [
                r'\bremove\b', r'\bdelete\b', r'\btake out\b', r'\bdrop\b',
                r'\bunnecessary\b', r'\bredundant\b', r'\btoo much\b',
                r'\bexcess\b'
            ],
            CommentIntent.CHANGE_LOGIC: [
                r'\blogic\b', r'\bif\b', r'\bloop\b', r'\bcondition\b',
                r'\bfunction\b', r'\bmethod\b', r'\bcalculation\b',
                r'\bformula\b', r'\balgorithm\b'
            ],
            CommentIntent.FORMAT_CHANGE: [
                r'\bformat\b', r'\bstyle\b', r'\blayout\b', r'\bappearance\b',
                r'\bbold\b', r'\bitalic\b', r'\bcolor\b', r'\bsize\b',
                r'\bindent\b', r'\bspacing\b'
            ],
            CommentIntent.CLARIFICATION: [
                r'\bwhat\b', r'\bhow\b', r'\bwhy\b', r'\bexplain\b',
                r'\bclarify\b', r'\bunderstand\b', r'\bmean\b',
                r'\bconfused\b', r'\bhelp\b'
            ]
        }
        
        # Calculate scores for each intent
        intent_scores = {}
        for intent, patterns in intent_patterns.items():
            score = 0
            matched_keywords = []
            
            for pattern in patterns:
                matches = re.findall(pattern, comment_text)
                if matches:
                    score += len(matches) * 2  # Base score for pattern match
                    matched_keywords.extend(matches)
            
            # Boost score based on context
            if intent == CommentIntent.CHANGE_VARIABLE and ('$' in selected_text or '{{' in selected_text):
                score += 3
            elif intent == CommentIntent.CHANGE_CONTENT and len(selected_text) > 0:
                score += 2
            elif intent == CommentIntent.ADD_CONTENT and 'need' in comment_text:
                score += 2
                
            intent_scores[intent] = {
                'score': score,
                'keywords': matched_keywords
            }
        
        # Find the intent with highest score
        best_intent = max(intent_scores.keys(), key=lambda k: intent_scores[k]['score'])
        best_score = intent_scores[best_intent]['score']
        keywords = intent_scores[best_intent]['keywords']
        
        # Calculate confidence (0-1)
        confidence = min(1.0, best_score / 10.0) if best_score > 0 else 0.3
        
        # Calculate context relevance
        context_relevance = 0.8 if len(selected_text) > 0 else 0.5
        
        # Generate suggested action
        suggested_action = self._generate_suggested_action(best_intent, comment_context)
        
        return CommentAnalysis(
            intent=best_intent,
            confidence=confidence,
            keywords=keywords,
            suggested_action=suggested_action,
            context_relevance=context_relevance
        )
    
    def _generate_suggested_action(self, intent: CommentIntent, context: CommentContext) -> str:
        """Generate a suggested action based on intent"""
        actions = {
            CommentIntent.CHANGE_CONTENT: f"Modify the text '{context.selected_text[:50]}...' in the template",
            CommentIntent.CHANGE_VARIABLE: f"Update variable definition or reference in template",
            CommentIntent.ADD_CONTENT: f"Add new content near '{context.selected_text[:50]}...'",
            CommentIntent.REMOVE_CONTENT: f"Remove or reduce content around '{context.selected_text[:50]}...'",
            CommentIntent.CHANGE_LOGIC: f"Modify template logic or calculations",
            CommentIntent.FORMAT_CHANGE: f"Update formatting for '{context.selected_text[:50]}...'",
            CommentIntent.CLARIFICATION: f"Provide explanation or documentation"
        }
        
        return actions.get(intent, "Analyze and suggest template improvements")
    
    def translate_comment_to_template_edit(self, comment_context: CommentContext) -> TemplateEditSuggestion:
        """
        Main function to translate a user comment into a template edit suggestion
        """
        if not self.llm_client:
            return self._fallback_suggestion(comment_context)
        
        # Analyze comment intent
        analysis = self.analyze_comment_intent(comment_context)
        
        # Generate LLM prompt based on intent and context
        prompt = self._create_llm_prompt(comment_context, analysis)
        
        try:
            # Call LLM for suggestion
            response = self._call_llm(prompt)
            suggestion_text = response.choices[0].message.content.strip()
            
            print(f"_____Original LLM response: {suggestion_text}")
            # Parse LLM response
            parsed_suggestion = self._parse_llm_response(suggestion_text, comment_context, analysis)
            
            return parsed_suggestion
            
        except Exception as e:
            print(f"Error calling LLM: {e}")
            return self._fallback_suggestion(comment_context, analysis)
    
    def _create_llm_prompt(self, context: CommentContext, analysis: CommentAnalysis) -> str:
        """Create a detailed prompt for the LLM based on context and analysis"""
        return context.comment_text
    
    def _call_llm(self, prompt: str):
        """Call the LLM with the given prompt"""
        from together import Together
        
        if isinstance(self.llm_client, Together):
            return self.llm_client.chat.completions.create(
                model="Qwen/Qwen2.5-Coder-32B-Instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,  # Lower temperature for more focused responses
            )
        else:
            return self.llm_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
    
    def _parse_llm_response(self, response_text: str, context: CommentContext, analysis: CommentAnalysis) -> TemplateEditSuggestion:
        """Parse the LLM response into a structured suggestion"""
        try:
            # Try to extract JSON from the response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                response_data = json.loads(json_match.group())
            else:
                # Fallback: treat entire response as explanation
                response_data = {
                    "suggested_change": response_text[:200] + "...",
                    "explanation": response_text,
                    "change_type": "modify",
                    "confidence": 0.6
                }
            
            return TemplateEditSuggestion(
                original_comment=context.comment_text,
                selected_text=context.selected_text,
                suggested_change=response_data.get("new_text", ""),
                explanation=response_data.get("explanation", ""),
                confidence=response_data.get("confidence", 0.7),
                change_type=response_data.get("change_type", "modify"),
                original_text=response_data.get("original_text")
            )
            
        except json.JSONDecodeError:
            # Fallback for malformed JSON
            return TemplateEditSuggestion(
                original_comment=context.comment_text,
                selected_text=context.selected_text,
                suggested_change=response_text[:200],
                explanation=f"AI suggested: {response_text}",
                confidence=0.6,
                change_type="modify"
            )
    
    def _fallback_suggestion(self, context: CommentContext, analysis: Optional[CommentAnalysis] = None) -> TemplateEditSuggestion:
        """Generate a fallback suggestion when LLM is not available"""
        if analysis:
            intent = analysis.intent
            confidence = analysis.confidence
        else:
            intent = CommentIntent.CHANGE_CONTENT
            confidence = 0.5
        
        # Generate simple rule-based suggestions
        if intent == CommentIntent.CHANGE_CONTENT:
            suggested_change = f"Consider updating the text '{context.selected_text}' based on the comment: '{context.comment_text}'"
            explanation = "The user has requested a change to this content. Review the comment and update the template accordingly."
        elif intent == CommentIntent.CHANGE_VARIABLE:
            suggested_change = f"Review variable definitions and update based on: '{context.comment_text}'"
            explanation = "The user has commented on variable usage. Check variable assignments and references."
        elif intent == CommentIntent.ADD_CONTENT:
            suggested_change = f"Add new content near '{context.selected_text}' addressing: '{context.comment_text}'"
            explanation = "The user wants additional content added to this section."
        else:
            suggested_change = f"Review and modify template based on: '{context.comment_text}'"
            explanation = "The user has provided feedback on this section. Consider their comment when updating the template."
        
        return TemplateEditSuggestion(
            original_comment=context.comment_text,
            selected_text=context.selected_text,
            suggested_change=suggested_change,
            explanation=explanation,
            confidence=confidence,
            change_type="modify"
        )
