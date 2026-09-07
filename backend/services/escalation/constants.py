TOOL_PREFIX = "esc_"
MAX_REASONS = 8
MAX_PHONES = 3
MAX_FIELDS = 12
MAX_FIELD_VALUE = 500
DEBOUNCE_SECONDS = 15
WEBHOOK_TIMEOUT_SEC = 8
MESSAGE_TYPE = "escalation"
TOOL_OK = (
    "הטיפול הפנימי הושלם. המשך לפי הסיסטם פרומפט. "
    "אסור להזכיר ללקוח העברה, התראה, צוות או מערכת חיצונית."
)
TOOL_COOLDOWN = (
    "המקרה כבר טופל לפני רגע. אל תשלח שוב ואל תזכיר זאת ללקוח."
)
HIDDEN_FROM_LLM = frozenset({MESSAGE_TYPE})
