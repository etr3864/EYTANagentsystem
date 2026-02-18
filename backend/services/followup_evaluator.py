"""AI evaluation and prompt building for follow-up decisions.

Responsible for:
- Building context-aware prompts (free-text and Meta template)
- Calling the AI model for evaluation
- Parsing AI JSON responses
"""
import json

from sqlalchemy.orm import Session

from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.whatsapp_template import WhatsAppTemplate
from backend.models.agent import Agent
from backend.models.message import Message
from backend.models.user import User
from backend.services.llm import get_provider
from backend.core.logger import log_error
from backend.core.enums import FollowupStatus


async def evaluate(
    db: Session, fu: ScheduledFollowup,
    agent: Agent, user: User, config: dict, needs_template: bool,
    conversation_id: int,
) -> dict:
    """Ask AI whether to send follow-up and what content. Returns decision dict."""
    history = _build_history_context(db, conversation_id)
    prev_followups = _build_prev_followups(db, conversation_id)
    personality = _get_personality(agent)
    sequence = config.get("sequence", [])
    total_steps = len(sequence)
    general_instruction = config.get("general_instruction", "")

    if needs_template:
        prompt = _build_template_prompt(
            history, prev_followups, personality,
            fu.followup_number, total_steps, fu.step_instruction,
            general_instruction, agent, db, config,
        )
    else:
        prompt = _build_freetext_prompt(
            history, prev_followups, personality,
            fu.followup_number, total_steps, fu.step_instruction,
            general_instruction, user,
        )

    model = config.get("model", "claude-sonnet-4-5")
    try:
        provider = get_provider(model, agent=agent)
        response = await provider.generate_simple_response(prompt)
        return _parse_ai_decision(response)
    except Exception as e:
        log_error("followup_ai", f"AI call failed: {str(e)[:50]}")
        return {"send": False, "reason": f"AI error: {str(e)[:100]}"}


# ──────────────────────────────────────────
# Context builders
# ──────────────────────────────────────────

def _build_history_context(db: Session, conversation_id: int, limit: int = 20) -> str:
    recent = db.query(Message).filter(
        Message.conversation_id == conversation_id,
    ).order_by(Message.created_at.desc()).limit(limit).all()

    if not recent:
        return "(אין היסטוריה)"

    lines = []
    for msg in reversed(recent):
        role = "לקוח" if msg.role == "user" else "סוכן"
        mtype = msg.message_type or "text"
        prefix = f"[{mtype}] " if mtype != "text" else ""
        raw = msg.content or ""
        content = raw[:200] + "..." if len(raw) > 200 else raw
        lines.append(f"{role}: {prefix}{content}")

    return "\n".join(lines)


def _build_prev_followups(db: Session, conversation_id: int) -> str:
    prev = db.query(ScheduledFollowup).filter(
        ScheduledFollowup.conversation_id == conversation_id,
        ScheduledFollowup.status == FollowupStatus.SENT,
    ).order_by(ScheduledFollowup.sent_at).all()

    if not prev:
        return ""

    lines = [f"Follow-up #{fu.followup_number}: {fu.content[:150]}" for fu in prev if fu.content]
    return "\n".join(lines)


def _get_personality(agent: Agent, max_chars: int = 500) -> str:
    if not agent.system_prompt:
        return ""
    prompt = agent.system_prompt.strip()
    if len(prompt) <= max_chars:
        return prompt
    cut = prompt[:max_chars]
    last_period = cut.rfind(".")
    if last_period > max_chars // 2:
        return cut[:last_period + 1]
    return cut + "..."


# ──────────────────────────────────────────
# Prompt builders
# ──────────────────────────────────────────

def _build_freetext_prompt(
    history: str, prev_followups: str, personality: str,
    step_number: int, total_steps: int, step_instruction: str | None,
    general_instruction: str, user: User,
) -> str:
    customer_name = user.name or "הלקוח"

    parts = [
        "אתה סוכן מכירות שמחליט אם לשלוח הודעת follow-up ללקוח.",
        "",
        f"שם הלקוח: {customer_name}",
        f"זה שלב {step_number} מתוך {total_steps} ברצף המעקב.",
    ]

    if general_instruction:
        parts.extend(["", f"הנחיות כלליות: {general_instruction}"])

    if step_instruction:
        parts.extend(["", f"הנחיית השלב: {step_instruction}"])

    parts.extend(["", "היסטוריית השיחה:", history])

    if prev_followups:
        parts.extend(["", "הודעות follow-up קודמות שכבר שלחת:", prev_followups])

    if personality:
        parts.extend(["", "אישיות הסוכן:", personality])

    parts.extend([
        "",
        "החלט:",
        '- אם השיחה נגמרה טבעית (הלקוח אמר תודה/ביי) או אמר שלא מעוניין — אל תשלח.',
        '- אם יש סיבה טובה לחזור ללקוח — כתוב הודעה מתאימה.',
        '- ההודעה צריכה להיות קצרה, טבעית, ורלוונטית למה שדובר.',
        "",
        'החזר JSON בלבד:',
        '{"send": true/false, "content": "ההודעה אם send=true", "reason": "למה החלטת"}',
    ])

    return "\n".join(parts)


def _build_template_prompt(
    history: str, prev_followups: str, personality: str,
    step_number: int, total_steps: int, step_instruction: str | None,
    general_instruction: str, agent: Agent, db: Session, config: dict,
) -> str:
    meta_templates = config.get("meta_templates", [])
    templates_info = _fetch_templates_info(db, agent.id, meta_templates)

    if not templates_info:
        return '{"send": false, "reason": "no approved templates available"}'

    parts = [
        "אתה סוכן שמחליט אם לשלוח הודעת follow-up ללקוח דרך WhatsApp Template.",
        f"זה שלב {step_number} מתוך {total_steps} ברצף המעקב.",
    ]

    if general_instruction:
        parts.extend(["", f"הנחיות כלליות: {general_instruction}"])

    if step_instruction:
        parts.extend(["", f"הנחיית השלב: {step_instruction}"])

    parts.extend(["", "היסטוריית השיחה:", history])

    if prev_followups:
        parts.extend(["", "follow-ups קודמים:", prev_followups])

    parts.extend(["", "Templates זמינים:"])
    for t in templates_info:
        params_desc = ", ".join(
            f'{{{{{i+1}}}}} = {p["key"]}'
            for i, p in enumerate(t["params"])
        ) if t["params"] else "(ללא פרמטרים)"
        parts.append(f'- "{t["name"]}" ({t["language"]}): {t["body"]}')
        parts.append(f'  פרמטרים: {params_desc}')

    parts.extend([
        "",
        "החלט איזה template הכי מתאים לקונטקסט של השיחה.",
        "מלא את הפרמטרים בהתאם למידע מהשיחה.",
        "",
        'החזר JSON בלבד:',
        '{"send": true/false, "template_name": "שם", "template_language": "he", "template_params": ["ערך1", "ערך2"], "reason": "למה"}',
    ])

    return "\n".join(parts)


def _fetch_templates_info(db: Session, agent_id: int, meta_templates: list) -> list[dict]:
    results = []
    for tpl_config in meta_templates:
        name = tpl_config.get("name", "") if isinstance(tpl_config, dict) else str(tpl_config)
        lang = tpl_config.get("language", "he") if isinstance(tpl_config, dict) else "he"
        param_mapping = tpl_config.get("params", []) if isinstance(tpl_config, dict) else []

        tpl = db.query(WhatsAppTemplate).filter(
            WhatsAppTemplate.agent_id == agent_id,
            WhatsAppTemplate.name == name,
            WhatsAppTemplate.language == lang,
            WhatsAppTemplate.status == "APPROVED",
        ).first()

        if not tpl:
            continue

        body = ""
        for comp in (tpl.components or []):
            if comp.get("type") == "BODY":
                body = comp.get("text", "")
                break

        results.append({
            "name": name,
            "language": lang,
            "body": body,
            "params": [{"key": p} for p in param_mapping],
        })

    return results


# ──────────────────────────────────────────
# Response parsing
# ──────────────────────────────────────────

def _parse_ai_decision(response: str) -> dict:
    """Parse AI JSON response with safe fallback to skip."""
    text = response.strip()

    if "```" in text:
        parts = text.split("```")
        for part in parts:
            candidate = part.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith("{"):
                text = candidate
                break

    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            text = text[start:end]

    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
        return {"send": False, "reason": "AI returned non-object JSON"}
    except (json.JSONDecodeError, ValueError):
        return {"send": False, "reason": f"failed to parse AI response: {text[:80]}"}
