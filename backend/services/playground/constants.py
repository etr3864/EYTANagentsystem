CLOSED_MESSAGE = (
    "מטעמי אבטחה הקישור פג תוקף, פנה למנהל התיק שלך "
    "לקבלת קישור חדש לבדיקה. בהצלחה!"
)

TOKEN_PREFIX = "pg_"
ALLOWED_TTL = (3600, 86400, 604800, 2592000)
DEFAULT_TOKEN_LIMIT = 1_000_000
MAX_TESTERS = 5
HIDDEN_MESSAGE_TYPES = frozenset({"function", "escalation", "trigger_data"})
