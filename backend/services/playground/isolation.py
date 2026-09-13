"""Prod vs playground: live rows have playground_link_id IS NULL.

SQL sites must include SQL_C_CONV_LIVE. ORM sites filter with conv_is_live().
Playground screens query the base tables directly.
"""

SQL_C_CONV_LIVE = "c.playground_link_id IS NULL"
SQL_CONV_LIVE = "playground_link_id IS NULL"


def is_playground_conversation(conv) -> bool:
    return getattr(conv, "playground_link_id", None) is not None


def is_playground_user(user) -> bool:
    return getattr(user, "playground_link_id", None) is not None


def conv_is_live():
    from backend.models.conversation import Conversation
    return Conversation.playground_link_id.is_(None)


def user_is_live():
    from backend.models.user import User
    return User.playground_link_id.is_(None)
