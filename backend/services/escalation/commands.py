from sqlalchemy.orm.attributes import flag_modified

from backend.models.escalation import AgentEscalationReason
from backend.services.escalation import repo, validate
from backend.services.escalation.keys import slugify_name


def _next_slug(db, agent_id: int, name: str, exclude_id: int | None = None) -> str:
    base = slugify_name(name, "reason")
    slug = base
    index = 2
    while repo.slug_taken(db, agent_id, slug, exclude_id):
        suffix = f"_{index}"
        slug = f"{base[: 64 - len(suffix)]}{suffix}"
        index += 1
    return slug


def create_reason(db, agent_id: int, name: str) -> AgentEscalationReason:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValueError("שם הסיבה חובה")
    if repo.at_capacity(db, agent_id):
        raise ValueError("מקסימום 8 סיבות לסוכן")
    row = AgentEscalationReason(
        agent_id=agent_id,
        name=cleaned[:80],
        slug=_next_slug(db, agent_id, cleaned),
        enabled=False,
        when_to_use="",
        payload_hint="",
        fields=[],
        phones=[],
        webhook_url=None,
        sort_order=repo.count_for_agent(db, agent_id),
    )
    return repo.add(db, row)


def update_reason(db, row: AgentEscalationReason, data) -> AgentEscalationReason:
    if data.name is not None:
        cleaned = data.name.strip()
        if not cleaned:
            raise ValueError("שם הסיבה חובה")
        row.name = cleaned[:80]
    if data.when_to_use is not None:
        row.when_to_use = data.when_to_use.strip()
    if data.payload_hint is not None:
        row.payload_hint = data.payload_hint.strip()
    if data.fields is not None:
        row.fields = validate.normalize_fields(data.fields)
        flag_modified(row, "fields")
    if data.phones is not None:
        row.phones = validate.normalize_phones(data.phones)
        flag_modified(row, "phones")
    if data.webhook_url is not None:
        row.webhook_url = validate.normalize_webhook(data.webhook_url)
    if data.enabled is not None:
        if data.enabled:
            validate.assert_can_enable(list(row.phones or []), row.webhook_url, list(row.fields or []))
        row.enabled = data.enabled
    return repo.save(db, row)


def apply_generated_fields(db, row: AgentEscalationReason, fields: list[dict]) -> AgentEscalationReason:
    row.fields = fields
    flag_modified(row, "fields")
    return repo.save(db, row)
