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


async def _get_app_id(agent: Agent, db: Session) -> str:
    """Get Meta App ID — cached in provider_config, or fetched via debug_token."""
    config = agent.provider_config or {}
    cached = config.get("app_id")
    if cached:
        return cached

    url = f"{_API_URL}/debug_token"
    params = {"input_token": agent.access_token, "access_token": agent.access_token}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)

    if resp.status_code != 200:
        raise ValueError("Failed to resolve App ID from access token")

    app_id = resp.json().get("data", {}).get("app_id")
    if not app_id:
        raise ValueError("App ID not found in token data")

    config["app_id"] = app_id
    agent.provider_config = config
    db.commit()

    return app_id


def _headers(agent: Agent) -> dict:
    return {
        "Authorization": f"Bearer {agent.access_token}",
        "Content-Type": "application/json"
    }


async def upload_media_to_meta(db: Session, agent: Agent, file_bytes: bytes,
                                filename: str, mime_type: str, file_size: int) -> str:
    """Upload media sample to Meta Resumable Upload API. Returns handle."""
    app_id = await _get_app_id(agent, db)
    auth_header = {"Authorization": f"OAuth {agent.access_token}"}

    async with httpx.AsyncClient(timeout=60) as client:
        # Step 1: Create upload session
        session_resp = await client.post(
            f"{_API_URL}/{app_id}/uploads",
            params={"file_name": filename, "file_length": file_size, "file_type": mime_type},
            headers=auth_header,
        )
        if session_resp.status_code != 200:
            raise ValueError(f"Upload session failed: {_extract_error(session_resp)}")

        session_id = session_resp.json().get("id")
        if not session_id:
            raise ValueError("No upload session ID returned")

        # Step 2: Upload binary
        upload_resp = await client.post(
            f"{_API_URL}/{session_id}",
            headers={**auth_header, "file_offset": "0"},
            content=file_bytes,
        )
        if upload_resp.status_code != 200:
            raise ValueError(f"File upload failed: {_extract_error(upload_resp)}")

        handle = upload_resp.json().get("h")
        if not handle:
            raise ValueError("No file handle returned")

    log("templates", msg=f"uploaded media sample '{filename}' ({mime_type})")
    return handle


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

def _inject_header_handle(components: list[dict], header_handle: str | None) -> list[dict]:
    """If a media header exists and a handle is provided, inject it as example."""
    if not header_handle:
        return components
    for comp in components:
        if comp.get("type") == "HEADER" and comp.get("format") in ("IMAGE", "VIDEO", "DOCUMENT"):
            comp["example"] = {"header_handle": [header_handle]}
    return components


async def create_template(
    db: Session,
    agent: Agent,
    name: str,
    language: str,
    category: str,
    components: list[dict],
    header_handle: str | None = None
) -> WhatsAppTemplate:
    """Create a template in Meta and save to DB."""
    waba_id = _get_waba_id(agent)
    if not waba_id:
        raise ValueError("WABA ID not configured")

    components = _inject_header_handle(components, header_handle)

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
    header_handle: str | None = None
) -> WhatsAppTemplate:
    """Update an existing template in Meta and DB."""
    if template.status == "PENDING":
        raise ValueError("Cannot edit a template that is pending review")

    components = _inject_header_handle(components, header_handle)

    url = f"{_API_URL}/{template.meta_template_id}"
    payload = {"components": components}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=_headers(agent), json=payload)

    if response.status_code != 200:
        error = _extract_error(response)
        raise ValueError(f"Meta API error: {error}")

    template.components = components
    template.reject_reason = None

    db.commit()
    db.refresh(template)

    log("templates", msg=f"updated '{template.name}'")
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
