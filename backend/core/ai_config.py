"""AI configuration - tools and system prompts."""

# Tools available to the AI
USER_TOOLS = [
    {
        "name": "update_user_info",
        "description": "עדכן מידע על המשתמש כשאתה לומד פרטים חדשים עליו.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "שם המשתמש"},
                "gender": {"type": "string", "enum": ["male", "female"], "description": "מגדר"},
                "business_type": {"type": "string", "description": "תחום העסק"},
                "notes": {"type": "string", "description": "הערות חשובות"}
            }
        }
    },
    {
        "name": "search_knowledge",
        "description": "חפש מידע במאגר המסמכים והידע העסקי.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "שאילתת החיפוש"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "query_products",
        "description": "חפש מוצר או בצע שאילתה על טבלת מוצרים/שירותים.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "טקסט חיפוש חופשי"},
                "filters": {
                    "type": "object",
                    "description": "פילטרים - למשל {\"price\": {\"op\": \"lt\", \"value\": 100}}"
                }
            }
        }
    },
    {
        "name": "check_availability",
        "description": "בדוק זמנים פנויים ביומן לתיאום פגישה.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "תאריך התחלה (YYYY-MM-DD)"},
                "end_date": {"type": "string", "description": "תאריך סיום (YYYY-MM-DD)"},
                "duration_minutes": {"type": "integer", "description": "משך הפגישה בדקות (אופציונלי)"}
            },
            "required": ["start_date", "end_date"]
        }
    },
    {
        "name": "book_appointment",
        "description": "קבע פגישה בפועל ביומן לאחר שהלקוח אישר. חובה להשתמש בכלי זה כדי לקבוע את הפגישה בפועל!",
        "input_schema": {
            "type": "object",
            "properties": {
                "datetime": {"type": "string", "description": "תאריך ושעה (ISO format: YYYY-MM-DDTHH:MM)"},
                "duration_minutes": {"type": "integer", "description": "משך הפגישה בדקות (לדוגמה: 30)"},
                "title": {"type": "string", "description": "כותרת הפגישה"},
                "description": {"type": "string", "description": "תיאור/הערות (אופציונלי)"}
            },
            "required": ["datetime", "duration_minutes", "title"]
        }
    },
    {
        "name": "get_my_appointments",
        "description": "הצג את הפגישות הקרובות של המשתמש.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "cancel_appointment",
        "description": "בטל פגישה קיימת.",
        "input_schema": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "integer", "description": "מזהה הפגישה לביטול"}
            },
            "required": ["appointment_id"]
        }
    },
    {
        "name": "reschedule_appointment",
        "description": "שנה זמן של פגישה קיימת.",
        "input_schema": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "integer", "description": "מזהה הפגישה"},
                "new_datetime": {"type": "string", "description": "תאריך ושעה חדשים (ISO format)"},
                "new_duration_minutes": {"type": "integer", "description": "משך חדש בדקות (אופציונלי)"}
            },
            "required": ["appointment_id", "new_datetime"]
        }
    },
    {
        "name": "send_media",
        "description": "שלח תמונה, וידאו או קובץ ללקוח. השתמש בכלי זה כשהלקוח מבקש לראות תמונה, דוגמה, קטלוג, מחירון, חוזה, מסמך או כשרלוונטי לשלוח קובץ.",
        "input_schema": {
            "type": "object",
            "properties": {
                "media_id": {"type": "integer", "description": "מזהה המדיה/קובץ לשליחה (מהרשימה שקיבלת)"},
                "caption": {"type": "string", "description": "כיתוב (אופציונלי - אם לא צוין ישתמש בברירת מחדל)"}
            },
            "required": ["media_id"]
        }
    },
    {
        "name": "search_media",
        "description": "חפש תמונה, וידאו או קובץ במאגר המדיה לפי תיאור. השתמש כשיש הרבה פריטים ואתה צריך למצוא משהו ספציפי.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "תיאור מה אתה מחפש"}
            },
            "required": ["query"]
        }
    }
]

# System suffix added to all agent prompts
SYSTEM_SUFFIX = """

---
הנחיות מערכת:
- כשאתה לומד מידע חדש על המשתמש (שם, מגדר, תחום עסק, הערות), השתמש בכלי update_user_info - חובה לעדכן אם זכר/נקבה או לא ידוע לפי השם שלו.
- כשנשאל על מסמכים, הסכמים, קבצים או מידע שלא מופיע ישירות למעלה - חובה להשתמש בכלי search_knowledge.
- כשנשאל על טבלאות, לידים, מוצרים, מחירים, כמויות או נתונים מספריים - חובה להשתמש בכלי query_products.
- אל תמציא מידע. אם אתה לא יודע משהו ויש לך כלי חיפוש, השתמש בו קודם.

כלי יומן (אם מוגדר) - חובה להשתמש בהם:
- check_availability: בדוק זמנים פנויים (דורש start_date ו-end_date בפורמט YYYY-MM-DD)
- book_appointment: קבע פגישה בפועל ביומן! (דורש datetime בפורמט YYYY-MM-DDTHH:MM, duration_minutes, title)
- get_my_appointments: הצג פגישות קרובות של המשתמש
- cancel_appointment: בטל פגישה (דורש appointment_id)
- reschedule_appointment: שנה זמן של פגישה

אזהרות קריטיות לגבי פגישות:
- אסור לך להגיד ללקוח שפגישה נקבעה בלי לקרוא קודם ל-book_appointment!
- רק אחרי שתקבל אישור מ-book_appointment (עם מזהה פגישה) - אפשר להגיד ללקוח שהפגישה נקבעה.
- אם לא קראת ל-book_appointment - הפגישה לא נקבעה בפועל!
- אחרי כל שימוש בכלי (check_availability, book_appointment וכו') - חובה לענות ללקוח! אסור להשאיר אותו בלי תשובה.
- אם בדקת זמינות - חובה להציג ללקוח את הזמנים הפנויים ולשאול מה מתאים לו.
- אחרי שפגישה נקבעה בהצלחה והלקוח אישר/אמר תודה - אל תעשה בדיקות זמינות נוספות! השיחה על קביעת הפגישה הסתיימה.
- אל תשתמש בכלי check_availability בלי שהלקוח ביקש לקבוע/לשנות פגישה.

כלי מדיה וקבצים (אם יש מדיה זמינה):
- send_media: שלח תמונה, וידאו או קובץ ללקוח (דורש media_id מהרשימה)
- search_media: חפש מדיה/קבצים לפי תיאור (רק כשיש הרבה פריטים ואתה צריך למצוא משהו ספציפי)
- כשהלקוח מבקש לראות תמונה, דוגמה, קטלוג - שלח עם send_media!
- כשהלקוח מבקש מחירון, חוזה, מסמך, קובץ PDF - שלח עם send_media!
- אל תתאר תמונה במילים - שלח אותה. אל תתאר תוכן קובץ - שלח אותו.
"""
