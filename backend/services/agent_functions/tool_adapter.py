from backend.models.agent_function import AgentFunction

_JSON_TYPES = {
    "string": "string",
    "integer": "integer",
    "number": "number",
    "boolean": "boolean",
}


def to_llm_tool(row: AgentFunction) -> dict:
    properties = {}
    required = []
    for spec in row.params or []:
        if spec.get("source", "ask") != "ask":
            continue
        name = spec.get("name")
        if not name:
            continue
        properties[name] = {
            "type": _JSON_TYPES.get(spec.get("type"), "string"),
            "description": spec.get("description") or name,
        }
        if spec.get("required", True):
            required.append(name)
    description = row.when_to_use.strip()
    if row.when_not_to_use:
        description += f"\nלא להשתמש כש: {row.when_not_to_use.strip()}"
    if row.response_instructions:
        description += f"\nאחרי תוצאה: {row.response_instructions.strip()}"
    schema: dict = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return {
        "name": row.name,
        "description": description,
        "input_schema": schema,
    }
