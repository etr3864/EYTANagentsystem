"""WhatsApp template management — CRUD + sync with Meta API."""
import httpx
from sqlalchemy.orm import Session

from backend.models.whatsapp_template import WhatsAppTemplate
from backend.models.agent import Agent
from backend.core.logger import log, log_error

_API_URL = "https://graph.facebook.com/v22.0"


def _get_waba_id(agent: Agent) -> str | None:
    config = agent.provider_config or {}
    return config.get("waba_id")


def _headers(agent: Agent) -> dict:
    return {
        "Authorization": f"Bearer {agent.access_token}",
        "Content-Type": "application/json"
    }


# ============ Read ============

def get_by_agent(db: Session, agent_id: int) -> list[WhatsAppTemplate]:
    return db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.agent_id == agent_id
    ).order_by(WhatsAppTemplate.created_at.desc()).all()


def get_by_id(db: Session, template_id: int) -> WhatsAppTemplate | None:
    return db.query(WhatsAppTemplate).filter(WhatsAppTemplate.id == template_id).first()


# ============ Sync from Meta ============

async def sync_from_meta(db: Session, agent: Agent) -> int:
    """Fetch all templates from Meta and upsert into DB. Returns count synced."""
    waba_id = _get_waba_id(agent)
    if not waba_id:
        raise ValueError("WABA ID not configured")

    templates_data = await _fetch_all_templates(agent, waba_id)
    synced = 0

    meta_ids = set()
    for t in templates_data:
        meta_id = t.get("id", "")
        meta_ids.add(meta_id)
        _upsert_template(db, agent.id, t)
        synced += 1

    # Remove templates that no longer exist in Meta
    existing = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.agent_id == agent.id
    ).all()
    for tmpl in existing:
        if tmpl.meta_template_id not in meta_ids:
            db.delete(tmpl)

    db.commit()
    log("templates", msg=f"synced {synced} templates for agent {agent.id}")
    return synced


async def _fetch_all_templates(agent: Agent, waba_id: str) -> list[dict]:
    """Fetch all templates with pagination."""
    url = f"{_API_URL}/{waba_id}/message_templates?limit=100"
    all_templates = []

    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            response = await client.get(url, headers=_headers(agent))
            if response.status_code != 200:
                log_error("templates", f"fetch failed: {response.status_code}")
                break

            data = response.json()
            all_templates.extend(data.get("data", []))

            paging = data.get("paging", {})
            url = paging.get("next")

    return all_templates


def _upsert_template(db: Session, agent_id: int, meta_data: dict) -> WhatsAppTemplate:
    """Insert or update a template from Meta API data."""
    meta_id = meta_data["id"]
    name = meta_data["name"]
    language = meta_data.get("language", "")
    category = meta_data.get("category", "UTILITY")
    status = meta_data.get("status", "PENDING")
    components = meta_data.get("components", [])
    reject_reason = meta_data.get("rejected_reason") or meta_data.get("quality_score", {}).get("reasons")

    tmpl = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.agent_id == agent_id,
        WhatsAppTemplate.meta_template_id == meta_id
    ).first()

    if tmpl:
        tmpl.status = status
        tmpl.components = components
        tmpl.category = category
        tmpl.reject_reason = str(reject_reason) if reject_reason else None
    else:
        tmpl = WhatsAppTemplate(
            agent_id=agent_id,
            meta_template_id=meta_id,
            name=name,
            language=language,
            category=category,
            status=status,
            components=components,
            reject_reason=str(reject_reason) if reject_reason else None,
        )
        db.add(tmpl)

    return tmpl


# ============ Create ============

async def create_template(
    db: Session,
    agent: Agent,
    name: str,
    language: str,
    category: str,
    components: list[dict],
    header_media_url: str | None = None
) -> WhatsAppTemplate:
    """Create a template in Meta and save to DB."""
    waba_id = _get_waba_id(agent)
    if not waba_id:
        raise ValueError("WABA ID not configured")

    payload = {
        "name": name,
        "language": language,
        "category": category,
        "components": components,
    }

    url = f"{_API_URL}/{waba_id}/message_templates"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=_headers(agent), json=payload)

    if response.status_code != 200:
        error = _extract_error(response)
        raise ValueError(f"Meta API error: {error}")

    result = response.json()
    meta_id = result.get("id", "")
    status = result.get("status", "PENDING")

    tmpl = WhatsAppTemplate(
        agent_id=agent.id,
        meta_template_id=meta_id,
        name=name,
        language=language,
        category=category,
        status=status,
        components=components,
        header_media_url=header_media_url,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)

    log("templates", msg=f"created '{name}' ({category}) status={status}")
    return tmpl


# ============ Update ============

async def update_template(
    db: Session,
    agent: Agent,
    template: WhatsAppTemplate,
    components: list[dict],
    header_media_url: str | None = None
) -> WhatsAppTemplate:
    """Update an existing template in Meta and DB."""
    if template.status == "PENDING":
        raise ValueError("Cannot edit a template that is pending review")

    url = f"{_API_URL}/{template.meta_template_id}"
    payload = {"components": components}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=_headers(agent), json=payload)

    if response.status_code != 200:
        error = _extract_error(response)
        raise ValueError(f"Meta API error: {error}")

    template.components = components
    template.status = "PENDING"
    if header_media_url:
        template.header_media_url = header_media_url
    template.reject_reason = None

    db.commit()
    db.refresh(template)

    log("templates", msg=f"updated '{template.name}' → PENDING")
    return template


# ============ Delete ============

async def delete_template(db: Session, agent: Agent, template: WhatsAppTemplate) -> bool:
    """Delete a template from Meta and DB."""
    waba_id = _get_waba_id(agent)
    if not waba_id:
        raise ValueError("WABA ID not configured")

    url = f"{_API_URL}/{waba_id}/message_templates?name={template.name}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.delete(url, headers=_headers(agent))

    if response.status_code != 200:
        error = _extract_error(response)
        raise ValueError(f"Meta API error: {error}")

    db.delete(template)
    db.commit()

    log("templates", msg=f"deleted '{template.name}'")
    return True


# ============ Helpers ============

def _extract_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        err = data.get("error", {})
        return err.get("message", f"HTTP {response.status_code}")
    except Exception:
        return f"HTTP {response.status_code}"


def template_to_dict(t: WhatsAppTemplate) -> dict:
    """Convert template to API response dict."""
    return {
        "id": t.id,
        "agent_id": t.agent_id,
        "meta_template_id": t.meta_template_id,
        "name": t.name,
        "language": t.language,
        "category": t.category,
        "status": t.status,
        "reject_reason": t.reject_reason,
        "components": t.components,
        "header_media_url": t.header_media_url,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
