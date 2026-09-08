"""Quoted WhatsApp replies — LLM-facing format only.

The quoted snippet is stored separately on the message; this helper
injects it into the text the model sees so it treats the referent as context.
"""

QUOTE_MAX = 400


def format_reply_for_llm(content: str, reply_to_text: str | None) -> str:
    if not reply_to_text or not reply_to_text.strip():
        return content
    snippet = " ".join(reply_to_text.split())
    if len(snippet) > QUOTE_MAX:
        snippet = snippet[:QUOTE_MAX] + "…"
    return f'[הלקוח משיב על ההודעה: "{snippet}"]\n{content}'
