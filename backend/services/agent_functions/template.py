import json
import re
from typing import Any, Literal
from urllib.parse import quote

VAR_RE = re.compile(r"\{\{([a-zA-Z0-9_.]+)\}\}")

RenderContext = Literal["json", "url", "header", "query", "plain"]


class MissingVariableError(ValueError):
    def __init__(self, name: str):
        super().__init__(name)
        self.name = name


def extract_placeholders(template: str) -> list[str]:
    return VAR_RE.findall(template or "")


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
