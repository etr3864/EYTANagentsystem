from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from backend.models.conversation import Conversation
from backend.models.user import User


def read_saved(
    user: User,
    conversation: Conversation,
    agent_id: int,
    function_name: str,
    source_key: str,
) -> Any:
    fn_name, key = _split_key(source_key, function_name)
    conv_bucket = ((conversation.function_state or {}).get(fn_name) or {})
    if key in conv_bucket:
        return conv_bucket[key]
    user_bucket = (((user.metadata_ or {}).get("af") or {}).get(str(agent_id)) or {}).get(fn_name) or {}
    return user_bucket.get(key)


def save_mapped(
    db: Session,
    user: User,
    conversation: Conversation,
    agent_id: int,
    function_name: str,
    mapped: dict[str, Any],
    output_defs: list[dict],
) -> None:
    scopes = {item.get("save_as"): item.get("scope", "conversation") for item in output_defs or []}
    conv_state = dict(conversation.function_state or {})
    fn_conv = dict(conv_state.get(function_name) or {})
    meta = dict(user.metadata_ or {})
    af = dict(meta.get("af") or {})
    agent_bucket = dict(af.get(str(agent_id)) or {})
    fn_user = dict(agent_bucket.get(function_name) or {})
    changed_conv = False
    changed_user = False
    for key, value in mapped.items():
        if scopes.get(key) == "user":
            fn_user[key] = value
            changed_user = True
        else:
            fn_conv[key] = value
            changed_conv = True
    if changed_conv:
        conv_state[function_name] = fn_conv
        conversation.function_state = conv_state
        flag_modified(conversation, "function_state")
    if changed_user:
        agent_bucket[function_name] = fn_user
        af[str(agent_id)] = agent_bucket
        meta["af"] = af
        user.metadata_ = meta
        flag_modified(user, "metadata_")
    if changed_conv or changed_user:
        db.add(conversation)
        db.add(user)


def expire_loaded(db: Session, user_id: int, conversation_id: int | None) -> None:
    loaded_user = db.get(User, user_id)
    if loaded_user is not None:
        db.expire(loaded_user)
    if conversation_id:
        loaded_conv = db.get(Conversation, conversation_id)
        if loaded_conv is not None:
            db.expire(loaded_conv)


def _split_key(source_key: str, default_fn: str) -> tuple[str, str]:
    cleaned = (source_key or "").strip()
    if "." in cleaned:
        fn_name, key = cleaned.split(".", 1)
        return fn_name, key
    return default_fn, cleaned
