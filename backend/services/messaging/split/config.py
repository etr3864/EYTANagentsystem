"""Per-agent split settings. Numeric max is the only count that exists."""
from dataclasses import dataclass

MIN_PARTS = 1
MAX_PARTS = 10
MIN_DELAY_SEC = 0.0
MAX_DELAY_SEC = 4.0
DEFAULT_DELAY_SEC = 1.0

DEFAULT_INSTRUCTION = (
    "פצל רק כשאדם היה שולח שתי הודעות נפרדות — למשל ברכה ואז מידע, או הסבר ואז שאלה. "
    "שאלה רק בהודעה האחרונה. אסור לשאול ואז להמשיך — הלקוח יענה באמצע והשאר יתבטל. "
    "אל תפצל מחירון, תנאים, רשימה או תשובה שהיא רעיון אחד."
)


@dataclass(frozen=True)
class SplitConfig:
    enabled: bool
    max_parts: int
    delay_seconds: float
    instruction: str


def for_agent(agent) -> SplitConfig:
    raw = getattr(agent, "split_config", None) or {}
    max_parts = _clamp(raw.get("max_parts", 2), MIN_PARTS, MAX_PARTS)
    delay = _clamp_float(raw.get("delay_seconds", DEFAULT_DELAY_SEC), MIN_DELAY_SEC, MAX_DELAY_SEC)
    instruction = (raw.get("instruction") or "").strip()
    enabled = bool(raw.get("enabled")) and max_parts > 1
    return SplitConfig(
        enabled=enabled,
        max_parts=max_parts,
        delay_seconds=delay,
        instruction=instruction or DEFAULT_INSTRUCTION,
    )


def sanitize(data: dict | None) -> dict:
    raw = data or {}
    instruction = (raw.get("instruction") or "").strip()
    return {
        "enabled": bool(raw.get("enabled")),
        "max_parts": int(_clamp(raw.get("max_parts", 2), MIN_PARTS, MAX_PARTS)),
        "delay_seconds": float(
            _clamp_float(
                raw.get("delay_seconds", DEFAULT_DELAY_SEC),
                MIN_DELAY_SEC,
                MAX_DELAY_SEC,
            )
        ),
        "instruction": instruction,
    }


def _clamp(value, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = low
    return max(low, min(high, number))


def _clamp_float(value, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = low
    return max(low, min(high, number))
