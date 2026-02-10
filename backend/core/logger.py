"""Clean, readable logging for the WhatsApp agent system."""
import logging
from datetime import datetime

_logger = logging.getLogger("agent")
_logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(message)s"))
if not _logger.handlers:
    _logger.addHandler(_handler)

# ANSI colors
RESET = "\033[0m"
GRAY = "\033[90m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"

# Log level styling (no emojis for clean production logs)
STYLES = {
    # Server
    "SERVER_UP": (GREEN, "[UP]"),
    "SERVER_DOWN": (YELLOW, "[DOWN]"),
    
    # Messages (main flow)
    "MSG": (CYAN, "[MSG]"),
    "PAUSED": (YELLOW, "[PAUSED]"),
    "MANUAL_SEND": (MAGENTA, "[SEND]"),
    
    # AI & Knowledge
    "KB_TOOL": (BLUE, "[KB]"),
    "AI_RESPONSE": (GREEN, "[AI]"),
    
    # Media
    "AUDIO": (MAGENTA, "[AUDIO]"),
    "IMAGE": (MAGENTA, "[IMAGE]"),
    
    # Uploads
    "UPLOAD": (GREEN, "[UPLOAD]"),
    
    # Calendar
    "APPOINTMENT_CREATED": (GREEN, "[APT+]"),
    "APPOINTMENT_CANCELLED": (YELLOW, "[APT-]"),
    "APPOINTMENT_RESCHEDULED": (BLUE, "[APT~]"),
    
    # Reminders
    "REMINDER_SENT": (GREEN, "[REM]"),
    "REMINDER_FAILED": (RED, "[REM!]"),
    
    # Warnings & Errors
    "WARN": (YELLOW, "[WARN]"),
    "ERROR": (RED, "[ERROR]"),
}


def log(event: str, **data):
    """Log an event with optional data."""
    time = datetime.now().strftime("%H:%M:%S")
    
    # Get style
    style = STYLES.get(event, (GRAY, "•"))
    color, icon = style
    
    # Format data
    if data:
        parts = []
        for k, v in data.items():
            if v is not None:
                parts.append(f"{k}={v}")
        data_str = " ".join(parts)
    else:
        data_str = ""
    
    # Build message
    msg = f"{GRAY}{time}{RESET} {icon} {color}{event}{RESET}"
    if data_str:
        msg += f" {data_str}"
    
    _logger.info(msg)


def log_message(agent: str, user: str, text: str, msg_count: int = 1, has_images: bool = False, provider: str = "meta"):
    """Log incoming message - main event."""
    preview = text[:40] + "..." if len(text) > 40 else text
    preview = preview.replace("\n", " ")
    provider_tag = f"[{provider}] " if provider != "meta" else ""
    log("MSG", agent=f"{provider_tag}{agent}", user=user, text=f'"{preview}"')


def log_response(input_tokens: int, output_tokens: int, cache_hit: int = 0):
    """Log AI response with token usage."""
    cache_info = f"cache={cache_hit}" if cache_hit > 0 else ""
    log("AI_RESPONSE", tokens=f"{input_tokens}→{output_tokens}", cache=cache_info if cache_info else None)


def log_tool(tool_name: str, result_len: int):
    """Log knowledge tool usage."""
    log("KB_TOOL", tool=tool_name, results=f"{result_len} chars")


def log_upload(file_type: str, name: str, details: str = ""):
    """Log file upload."""
    log("UPLOAD", type=file_type, name=name, info=details if details else None)


def log_audio(stage: str, provider: str = "meta", **data):
    """Log audio processing stages."""
    provider_tag = f"[{provider}] " if provider != "meta" else ""
    log("AUDIO", stage=f"{provider_tag}{stage}", **data)


def log_image(stage: str, provider: str = "meta", **data):
    """Log image processing stages."""
    provider_tag = f"[{provider}] " if provider != "meta" else ""
    log("IMAGE", stage=f"{provider_tag}{stage}", **data)


def log_error(context: str, msg: str):
    """Log error."""
    log("ERROR", context=context, msg=msg)


def log_warn(msg: str):
    """Log warning."""
    log("WARN", msg=msg)
