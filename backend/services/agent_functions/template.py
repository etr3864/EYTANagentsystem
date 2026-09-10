import json
import re
from typing import Any, Literal
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

VAR_RE = re.compile(r"\{\{([a-zA-Z0-9_.]+)\}\}")

RenderContext = Literal["json", "url", "header", "query", "plain"]


class MissingVariableError(ValueError):
    def __init__(self, name: str):
        super().__init__(name)
        self.name = name


def extract_placeholders(template: str) -> list[str]:
    return VAR_RE.findall(template or "")


def append_query_params(url: str, extra: dict[str, Any]) -> str:
    """Add unused values as query string. Does not overwrite keys already on the URL."""
    if not extra:
        return url
    parts = urlsplit(url)
    existing = dict(parse_qsl(parts.query, keep_blank_values=True))
    added = False
    for key, value in extra.items():
        if not key or key in existing or value is None or value == "":
            continue
        existing[key] = str(value)
        added = True
    if not added:
        return url
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(existing), parts.fragment))


def unused_for_query(
    values: dict[str, Any],
    placeholder_keys: set[str],
) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    for key, value in values.items():
        if not key or key in placeholder_keys or value is None or value == "":
            continue
        extra[key] = value
    return extra


def render(template: str, values: dict[str, Any], context: RenderContext) -> str:
    if not template:
        return template

    def replace(match: re.Match) -> str:
        key = match.group(1)
        if key not in values or values[key] is None:
            raise MissingVariableError(key)
        return _encode(values[key], context)

    return VAR_RE.sub(replace, template)


def _encode(value: Any, context: RenderContext) -> str:
    text = "" if value is None else str(value)
    if context == "json":
        encoded = json.dumps(value if not isinstance(value, str) else text, ensure_ascii=False)
        if isinstance(value, str) or value is None:
            return encoded[1:-1]
        return encoded
    if context == "url":
        return quote(text, safe="")
    if context == "query":
        return quote(text, safe="")
    if context == "header":
        cleaned = text.replace("\r", "").replace("\n", "")
        return cleaned
    return text
