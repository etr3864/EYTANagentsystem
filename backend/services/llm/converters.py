"""Format converters between Anthropic and Gemini.

Anthropic and Gemini use slightly different formats for:
- Tool definitions
- Messages
- System prompts
- Function call responses

This module provides conversion functions to translate between formats.
"""
from google.genai import types


def anthropic_tools_to_gemini(anthropic_tools: list) -> types.Tool:
    """Convert Anthropic tool definitions to Gemini format.
    
    Anthropic format:
        {"name": ..., "description": ..., "input_schema": {...}}
    
    Gemini format:
        FunctionDeclaration with parameters_json_schema
    """
    declarations = []
    for tool in anthropic_tools:
        declarations.append(types.FunctionDeclaration(
            name=tool["name"],
            description=tool["description"],
            parameters_json_schema=tool.get("input_schema", {})
        ))
    return types.Tool(function_declarations=declarations)


def anthropic_system_to_gemini(system_blocks: list) -> str:
    """Convert Anthropic system blocks to Gemini system instruction string.
    
    Anthropic format:
        [{"type": "text", "text": "...", "cache_control": ...}, ...]
    
    Gemini format:
        Single string (system_instruction parameter)
    """
    texts = []
    for block in system_blocks:
        if isinstance(block, dict) and "text" in block:
            texts.append(block["text"])
        elif isinstance(block, str):
            texts.append(block)
    return "\n\n".join(texts)


def gemini_function_call_to_standard(fc) -> dict:
    """Convert Gemini FunctionCall to standard format.
    
    Standard format used internally:
        {"id": ..., "name": ..., "input": {...}}
    """
    return {
        "id": getattr(fc, 'id', None) or fc.name,
        "name": fc.name,
        "input": dict(fc.args) if fc.args else {}
    }
