DRAFT = "draft"
RUNNING = "running"
PAUSED = "paused"
FINISHED = "finished"

PAUSE_MANUAL = "manual"
PAUSE_FLAG = "flag_off"
PAUSE_SESSION = "session"
PAUSE_CHANNEL = "channel_refused"
PAUSE_AGENT = "agent_off"

PENDING = "pending"
SENDING = "sending"
SENT = "sent"
FAILED = "failed"
SKIPPED = "skipped"
BLOCKED = "blocked"
INVALID = "invalid"
UNCERTAIN = "uncertain"

OPEN_STATUSES = (RUNNING, PAUSED)
TERMINAL = (FAILED, SKIPPED, BLOCKED, INVALID, UNCERTAIN, SENT)
RETRYABLE = FAILED

LEASE_SECONDS = 120
HTTP_TIMEOUT = 15
LOCK_TTL = 30
LIVE_TTL = 150
HOLD_LIMIT_SECONDS = 15 * 60
ROW_CAP = 20000
FIELD_CAP = 500
MAX_STEPS = 10
PAGE = 50
ZIP_UNCOMPRESSED_CAP = 20 * 1024 * 1024
UPLOAD_CAP = 8 * 1024 * 1024

DELIVERY_RANK = {
    None: 0,
    "pending": 1,
    "sent": 2,
    "delivered": 3,
    "read": 4,
    "played": 5,
    "error": 1,
}

SESSION_DOWN = ("disconnected", "logged_out", "expired", "need_scan", "need_passkey")
ERROR_BURST = 5
