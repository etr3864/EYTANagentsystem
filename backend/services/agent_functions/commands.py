from copy import deepcopy

from sqlalchemy.orm import Session

from backend.models.agent_function import AgentFunction
from backend.services.agent_functions.constants import METHODS_WITH_BODY
from backend.services.agent_functions.egress import host_from_url
from backend.services.agent_functions.names import validate_name
from backend.services.agent_functions import repo
from backend.services.agent_functions.schemas import FunctionUpsert
from backend.services.agent_functions.secrets import encrypt_headers, decrypt_headers


def create_from_upsert(db: Session, agent_id: int, data: FunctionUpsert) -> AgentFunction:
    name = validate_name(data.name)
    if repo.get_by_name(db, agent_id, name):
        raise ValueError("כבר קיימת פונקציה בשם הזה")
    row = AgentFunction(agent_id=agent_id, name=name)
    _apply(row, data, headers_provided=True)
    return repo.add(db, row)


def update_from_upsert(
    db: Session,
    row: AgentFunction,
    data: FunctionUpsert,
    headers_provided: bool,
) -> AgentFunction:
    before = _snapshot(row)
    new_name = validate_name(data.name)
    if new_name != row.name and repo.get_by_name(db, row.agent_id, new_name):
        raise ValueError("כבר קיימת פונקציה בשם הזה")
    row.name = new_name
    _apply(row, data, headers_provided)
    if repo.material_changed(before, row):
        repo.clear_test(row)
    return repo.save(db, row)


def _apply(row: AgentFunction, data: FunctionUpsert, headers_provided: bool) -> None:
    row.when_to_use = data.when_to_use.strip()
    row.when_not_to_use = data.when_not_to_use.strip()
    row.response_instructions = data.response_instructions.strip()
    row.side_effect = data.side_effect
    row.trigger = data.trigger
    row.event_type = data.event_type
    row.method = data.method
    row.url = data.url.strip()
    row.allowed_host = host_from_url(row.url)
    row.body_template = data.body_template if data.method in METHODS_WITH_BODY else None
    row.params = [p.model_dump() for p in data.params]
    row.outputs = [o.model_dump() for o in data.outputs]
    row.timeout_ms = data.timeout_ms
    row.sort_order = data.sort_order
    if headers_provided:
        current = decrypt_headers(row.headers_encrypted)
        for key, value in data.headers.items():
            if not key.strip():
                continue
            if value.startswith("..."):
                continue
            if not value:
                current.pop(key, None)
            else:
                current[key] = value
        row.headers_encrypted = encrypt_headers(current)


def _snapshot(row: AgentFunction) -> AgentFunction:
    clone = AgentFunction()
    for field in (
        "url",
        "method",
        "body_template",
        "params",
        "headers_encrypted",
    ):
        setattr(clone, field, deepcopy(getattr(row, field)))
    return clone
