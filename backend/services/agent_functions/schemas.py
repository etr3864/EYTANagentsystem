from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from backend.services.agent_functions.constants import (
    ALLOWED_METHODS,
    OUTPUT_SCOPES,
    PARAM_SOURCES,
    SIDE_EFFECTS,
    TRIGGERS,
)


class FunctionParam(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    type: Literal["string", "integer", "number", "boolean"] = "string"
    required: bool = True
    description: str = Field(default="", max_length=500)
    source: str = "ask"
    source_key: Optional[str] = None

    @field_validator("name")
    @classmethod
    def param_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned.replace("_", "").isalnum() or not cleaned[0].isalpha():
            raise ValueError("שם פרמטר באנגלית בלבד")
        return cleaned

    @field_validator("source")
    @classmethod
    def param_source(cls, value: str) -> str:
        if value not in PARAM_SOURCES:
            raise ValueError("מקור פרמטר לא חוקי")
        return value


class FunctionOutput(BaseModel):
    json_path: str = Field(min_length=1, max_length=200)
    save_as: str = Field(min_length=1, max_length=64)
    scope: str = "conversation"

    @field_validator("scope")
    @classmethod
    def output_scope(cls, value: str) -> str:
        if value not in OUTPUT_SCOPES:
            raise ValueError("scope לא חוקי")
        return value


class FunctionUpsert(BaseModel):
    name: str
    when_to_use: str = Field(min_length=8, max_length=2000)
    when_not_to_use: str = Field(default="", max_length=2000)
    response_instructions: str = Field(default="", max_length=2000)
    side_effect: str = "read"
    trigger: str = "conversation"
    event_type: Optional[str] = Field(default=None, max_length=64)
    method: str = "GET"
    url: str = Field(min_length=8, max_length=2000)
    headers: dict[str, str] = Field(default_factory=dict)
    body_template: Optional[str] = Field(default=None, max_length=32000)
    params: list[FunctionParam] = Field(default_factory=list)
    outputs: list[FunctionOutput] = Field(default_factory=list)
    timeout_ms: int = Field(default=8000, ge=1000, le=8000)
    sort_order: int = Field(default=0, ge=0, le=100)

    @field_validator("side_effect")
    @classmethod
    def check_side_effect(cls, value: str) -> str:
        if value not in SIDE_EFFECTS:
            raise ValueError("side_effect חייב read או write")
        return value

    @field_validator("trigger")
    @classmethod
    def check_trigger(cls, value: str) -> str:
        if value not in TRIGGERS:
            raise ValueError("trigger לא חוקי")
        return value

    @field_validator("method")
    @classmethod
    def check_method(cls, value: str) -> str:
        method = value.upper()
        if method not in ALLOWED_METHODS:
            raise ValueError("HTTP method לא נתמך")
        return method


class FunctionPatch(BaseModel):
    enabled: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0, le=100)


class FunctionTestRequest(BaseModel):
    live: bool = False
    sample_values: dict[str, str] = Field(default_factory=dict)
    header_overrides: dict[str, str] = Field(default_factory=dict)


class AttentionResolve(BaseModel):
    action: Literal["done", "retry"]
    outputs: dict[str, Any] = Field(default_factory=dict)
