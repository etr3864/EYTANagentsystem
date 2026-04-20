# WhatsApp AI Agent Platform

פלטפורמה להפעלת סוכני WhatsApp חכמים המנהלים שיחות עם לקוחות 24/7 — מענה, תיאום פגישות, שליחת מידע ועוד, ללא התערבות אנושית.

---

## תוכן עניינים

1. [ארכיטקטורה כללית](#ארכיטקטורה-כללית)
2. [טכנולוגיות](#טכנולוגיות)
3. [משתני סביבה](#משתני-סביבה)
4. [הרצה מקומית](#הרצה-מקומית)
5. [מבנה תיקיות](#מבנה-תיקיות)
6. [Backend — שכבת API](#backend--שכבת-api)
7. [Backend — שכבת שירותים](#backend--שכבת-שירותים)
8. [מודלי DB](#מודלי-db)
9. [Frontend](#frontend)
10. [זרם הודעה מקצה לקצה](#זרם-הודעה-מקצה-לקצה)
11. [יכולות הסוכן — כלים](#יכולות-הסוכן--כלים)
12. [מערכת יומן ופגישות](#מערכת-יומן-ופגישות)
13. [RAG — מאגר ידע](#rag--מאגר-ידע)
14. [מערכת תזכורות](#מערכת-תזכורות)
15. [Follow-ups](#follow-ups)
16. [סיכומי שיחה](#סיכומי-שיחה)
17. [מדיה וקבצים](#מדיה-וקבצים)
18. [ספקי WhatsApp](#ספקי-whatsapp)
19. [ספקי LLM וניהול API Keys](#ספקי-llm-וניהול-api-keys)
20. [Auth והרשאות](#auth-והרשאות)
21. [מעקב שימוש ועלויות](#מעקב-שימוש-ועלויות)
22. [תשתית וסקייל](#תשתית-וסקייל)

---

## ארכיטקטורה כללית

```
WhatsApp (Meta/Wasender)
        │
        ▼ Webhook
  ┌─────────────┐
  │  FastAPI    │  ←── Scheduler (asyncio task, כל 30s)
  │  Backend    │  ←── Celery Worker (context summary)
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
PostgreSQL   Redis
(pgvector)   (locks, buffers, timers)
    │
    └── Cloudflare R2 (קבצים)
         Google Calendar API
         LLM APIs (Anthropic/OpenAI/Gemini)
         Google Speech-to-Text
```

**כניסה ראשית:** `backend/main.py`
- `lifespan`: `init_extensions` (pgvector) → `create_all` → `run_migrations()` → `start_scheduler()` כ-asyncio background task
- Scheduler נעצר gracefully בסגירת השרת

---

## טכנולוגיות

### Backend
| טכנולוגיה | שימוש |
|---|---|
| Python + FastAPI + Uvicorn | שרת API אסינכרוני |
| SQLAlchemy 2 | ORM |
| Alembic + SQL גולמי | מיגרציות DB |
| Pydantic / pydantic-settings | ולידציה + config |
| httpx | קריאות HTTP חיצוניות |
| Redis (redis.asyncio) | locks, buffers, followup timers |
| Celery | משימת context summary ברקע |

### AI / LLM
| ספק | חבילה | שימוש |
|---|---|---|
| Anthropic Claude | `anthropic` | ברירת מחדל לכל שיחה, תמונות, סיכומים |
| OpenAI | `openai` | מודלים `gpt-*`, `o1-*`, `o3-*` |
| Google Gemini | `google-genai` | מודלים `gemini-*` |
| OpenAI Embeddings | `openai` | `text-embedding-3-small` לכל RAG |

### DB ואחסון
| טכנולוגיה | שימוש |
|---|---|
| PostgreSQL 16 + pgvector | DB ראשי + חיפוש וקטורי (cosine distance) |
| Cloudflare R2 (S3-compatible) | קבצי מדיה, מסמכים |

### חיצוני
| שירות | שימוש |
|---|---|
| Google Calendar API + OAuth | קביעת/ביטול/עדכון פגישות |
| Google Cloud Speech-to-Text | תמלול הודעות קוליות |
| WhatsApp Graph API v22.0 | ספק Meta |
| wasenderapi.com | ספק Wasender (חלופה ל-Meta) |

### Frontend
| טכנולוגיה | גרסה |
|---|---|
| Next.js | 16 (App Router) |
| React | 19 |
| TypeScript | מלא |
| Tailwind CSS | 4 |

---

## משתני סביבה

```env
# DB
DATABASE_URL=postgresql://user:pass@host:5432/whatsapp_agents

# LLM — מפתח בודד או רשימה מופרדת בפסיקים (pool)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_API_KEYS=sk-ant-key1,sk-ant-key2   # אופציונלי — pool
OPENAI_API_KEY=sk-...
OPENAI_API_KEYS=sk-key1,sk-key2              # אופציונלי
GOOGLE_API_KEY=AIza...
GOOGLE_API_KEYS=key1,key2                    # אופציונלי

# Google OAuth (Calendar)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_REDIRECT_BASE=https://your-backend-url.com

# Google Speech-to-Text
GOOGLE_CREDENTIALS_JSON=<JSON string or file path>

# JWT — חובה בפרודקשן (RuntimeError בהיעדר)
JWT_SECRET=your-long-secret
JWT_ACCESS_EXPIRE_MINUTES=60      # ברירת מחדל
JWT_REFRESH_EXPIRE_DAYS=7         # ברירת מחדל

# Redis
REDIS_URL=redis://localhost:6379/0

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=whatsapp-media
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Frontend
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## הרצה מקומית

```bash
# Docker Compose (מומלץ)
docker-compose up --build

# ידני
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

**שירותי Docker Compose:** nginx, backend (FastAPI), frontend (Next.js), celery_worker, db (pgvector/pg16), redis:7

---

## מבנה תיקיות

```
whatsappagent/
├── backend/
│   ├── main.py                    # נקודת כניסה FastAPI + lifespan
│   ├── core/
│   │   ├── config.py              # Settings (pydantic-settings, .env)
│   │   ├── database.py            # engine, SessionLocal, init_extensions, run_migrations
│   │   ├── ai_config.py           # USER_TOOLS (כלי LLM) + SYSTEM_SUFFIX
│   │   ├── context_windows.py     # גבולות context window לפי ספק (90%)
│   │   ├── enums.py               # SummaryWebhookStatus, ReminderStatus ועוד
│   │   ├── logger.py              # log, log_error, log_tool, log_message
│   │   └── timezone.py            # UTC, from_utc
│   ├── auth/
│   │   ├── router.py              # login, logout, user mgmt, JWT
│   │   └── models.py              # AuthUser, UserRole
│   ├── models/                    # SQLAlchemy models (ראה טבלת מודלים)
│   ├── api/
│   │   └── routers/               # כל ה-API endpoints
│   ├── services/
│   │   ├── message_processing.py  # זרם שיחה מרכזי
│   │   ├── ai.py                  # build_system_prompt, get_response
│   │   ├── tools.py               # handle_tool_calls (כלי הסוכן)
│   │   ├── appointments.py        # יומן — זמינות, קביעה, ביטול
│   │   ├── calendar.py            # Google Calendar API (OAuth, events)
│   │   ├── reminders.py           # תזכורות לפגישות
│   │   ├── followups.py           # follow-up re-engagement
│   │   ├── followup_evaluator.py  # AI evaluator לfollow-ups
│   │   ├── summaries.py           # סיכום שיחה + webhook חיצוני
│   │   ├── documents.py           # העלאת PDF/DOCX, chunking, RAG
│   │   ├── tables.py              # CSV upload, row embeddings, query
│   │   ├── knowledge.py           # context שמוצג לסוכן על מאגר הידע
│   │   ├── embeddings.py          # get_embedding / get_embeddings_batch
│   │   ├── storage.py             # Cloudflare R2 upload/delete
│   │   ├── agent_media.py         # ספריית מדיה per-agent
│   │   ├── media.py               # הורדת מדיה מ-WhatsApp
│   │   ├── whatsapp.py            # Meta Graph API
│   │   ├── wasender.py            # Wasender API
│   │   ├── providers.py           # אבסטרקציה meta/wasender
│   │   ├── transcription.py       # Google Speech-to-Text
│   │   ├── scheduler.py           # asyncio scheduler (30s cycle)
│   │   ├── usage_tracking.py      # רישום שימוש יומי
│   │   ├── pricing.py             # עלויות per model
│   │   ├── message_buffer.py      # Buffer הודעות נכנסות
│   │   ├── agents.py              # CRUD סוכנים
│   │   ├── users.py               # CRUD משתמשי WhatsApp
│   │   ├── conversations.py       # CRUD שיחות
│   │   ├── messages.py            # CRUD הודעות
│   │   └── llm/
│   │       ├── __init__.py        # get_provider, _resolve_provider_name
│   │       ├── anthropic.py       # AnthropicProvider
│   │       ├── openai_provider.py # OpenAIProvider
│   │       ├── gemini.py          # GeminiProvider
│   │       ├── key_manager.py     # pool, round-robin, cooldown, dead-key
│   │       ├── converters.py      # המרת פורמטים בין ספקים
│   │       └── types.py           # LLMResponse, ToolHandler
│   ├── services/context_summary/
│   │   ├── builder.py             # build_summary_prompt
│   │   ├── config.py              # DEFAULT_CONTEXT_SUMMARY_CONFIG
│   │   ├── history.py             # get_history_with_summary
│   │   ├── runner.py              # run_summary, _save_summary
│   │   └── triggers.py            # should_trigger_summary
│   └── tasks/
│       └── context_summary.py     # Celery task
├── frontend/
│   ├── app/                       # Next.js App Router pages
│   ├── components/
│   │   └── agent/                 # טאבי עריכת סוכן
│   ├── lib/                       # api, auth, types, dates, phone
│   └── contexts/AuthContext.tsx
├── docker-compose.yml
├── Dockerfile                     # Backend
├── frontend/Dockerfile
├── nginx.conf
├── render.yaml                    # Render deployment blueprint
└── requirements.txt
```

---

## Backend — שכבת API

כל ה-routers נרשמים ב-`main.py`:

| Router | Prefix | קובץ | תיאור |
|---|---|---|---|
| auth_router | `/api` | `auth/router.py` | login, logout, refresh, ניהול משתמשים |
| agents_router | `/api/agents` | `routers/agents.py` | CRUD סוכנים |
| users_router | `/api/users` | `routers/users.py` | ניהול אנשי קשר WhatsApp |
| conversations_router | `/api/conversations` | `routers/conversations.py` | שיחות + הודעות |
| knowledge_router | `/api` | `routers/knowledge.py` | מסמכים + טבלאות CSV |
| calendar_router | `/api/calendar` | `routers/calendar.py` | OAuth, config, תזכורות |
| summaries_router | `/api/summaries` | `routers/summaries.py` | סיכום + webhook |
| media_router | `/api` | `routers/media.py` | ספריית מדיה |
| templates_router | `/api` | `routers/templates.py` | תבניות Meta |
| followups_router | `/api/agents` | `routers/followups.py` | follow-up config |
| dashboard_router | `/api` | `routers/dashboard.py` | stats + עלויות (admin) |
| super_admin_dashboard_router | `/api` | `routers/super_admin_dashboard.py` | stats כלל המערכת |
| export_router | `/api` | `routers/export.py` | ייצוא נתונים |
| webhook_router | `/webhook` | `routers/webhook.py` | קבלת הודעות Meta |
| webhook_wasender_router | `/webhook/wasender` | `routers/webhook_wasender.py` | קבלת הודעות Wasender |
| database_router | `/api/db` | `routers/database.py` | ניהול DB |

### CalendarConfigUpdate — שדות שניתן לעדכן דרך PUT `/api/calendar/{id}/config`

`google_calendar_id`, `working_hours`, `default_duration`, `buffer_minutes`, `days_ahead`, `timezone`, `webhook_url`, `appointment_prompt`, `reminders`, `allow_double_booking`

---

## Backend — שכבת שירותים

### זרם הודעה נכנסת (`message_processing.py`)

```
Webhook (Meta/Wasender)
  → dedup check (ProcessedMessage table, TTL 5 min)
  → message_buffer (Redis) — batch הודעות קצרות
  → get/create User + Conversation
  → transcription (אם audio — Google Speech-to-Text)
  → get_history_with_summary (היסטוריה + context summary אם קיים)
  → ai.get_response (LLM + tool loop)
    → tool calls: handle_tool_calls (tools.py)
  → שמירת הודעות ב-DB
  → שליחת תשובה (providers.py → whatsapp/wasender)
  → שליחת מדיה (אם יש media_actions)
  → trigger context summary (אם צריך) → Celery task
  → trigger follow-up timer (Redis sorted set)
```

### ai.py — בניית פרומפט

`build_system_prompt` מחזיר רשימת blocks לAnthropic (עם prompt caching):
1. **Block 1 (CACHED):** base_prompt + SYSTEM_SUFFIX + knowledge_context + media_context + שעות פעילות + appointment_prompt + פגישות קיימות
2. **Block 2 (NOT CACHED):** מידע על המשתמש (שם, טלפון, מגדר, הערות)

**SYSTEM_SUFFIX** (`ai_config.py`) — הנחיות מערכת קבועות לכל הסוכנים: שימוש בכלים, כללי יומן, כללי מדיה, opt-out.

### context_windows.py — גבולות context window

| ספק | גבול בטוח (90%) |
|---|---|
| Anthropic | 180,000 tokens |
| OpenAI | 115,200 tokens |
| Google | 943,718 tokens |

הערכת tokens: `len(text) // 3 + 1` (conservative לעברית+אנגלית)

---

## מודלי DB

| מודל | קובץ | שדות מפתח |
|---|---|---|
| `Agent` | `agent.py` | `name`, `phone_number_id` (unique), `owner_id` FK auth_users, `access_token`, `verify_token`, `system_prompt`, `model`, `is_active`, `provider`, `provider_config` JSON, `calendar_config` JSON, `appointment_prompt`, `summary_config` JSON, `followup_config` JSON, `media_config` JSON, `custom_api_keys` JSON, `context_summary_config` JSON, `usage_stats` JSON, `batching_config` JSON |
| `User` | `user.py` | `phone` (unique per agent), `name`, `gender` enum, `metadata_` JSON |
| `Conversation` | `conversation.py` | `agent_id`, `user_id`, `is_paused`, `opted_out`, `last_customer_message_at`; unique(agent_id, user_id) |
| `Message` | `message.py` | `conversation_id`, `role`, `content`, `message_type`, `media_id` FK, `media_url` |
| `Document` | `knowledge.py` | `agent_id`, `name`, `file_url` |
| `DocumentChunk` | `knowledge.py` | `document_id`, `content`, `embedding` Vector(1536) |
| `DataTable` | `knowledge.py` | `agent_id`, `name`, `columns` JSON |
| `DataRow` | `knowledge.py` | `table_id`, `data` JSON, `embedding` Vector(1536) |
| `Appointment` | `appointment.py` | `agent_id`, `user_id`, `google_event_id`, `start_time`, `end_time`, `title`, `description`, `status` |
| `ScheduledReminder` | `scheduled_reminder.py` | `appointment_id`, `agent_id`, `user_id`, `scheduled_for`, `status`, `content_type`, `template`, `ai_prompt`, `rule_index` |
| `ConversationSummary` | `conversation_summary.py` | `conversation_id`, `agent_id`, `user_id`, `summary_text`, `message_count`, `last_message_at`, `webhook_status` (`SummaryWebhookStatus`), `webhook_attempts`; unique(conversation_id, last_message_at) |
| `ConversationContextSummary` | `conversation_context_summary.py` | `conversation_id` (unique), `summary_text`, `last_message_id_covered`, `incremental_count` |
| `AgentMedia` | `agent_media.py` | `agent_id`, `name`, `description`, `media_type` (image/video/document), `file_url`, `filename`, `default_caption`, `embedding` Vector(1536), `is_active` |
| `ScheduledFollowup` | `scheduled_followup.py` | `conversation_id`, `agent_id`, `step_number`, `scheduled_for`, `status`, `content`, `sent_via`, `template_name`; partial unique index על pending/evaluating per conversation |
| `AgentUsageDaily` | `agent_usage_daily.py` | `agent_id`, `date`, `model`, `source`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`; unique(agent_id, date, model, source) |
| `PricingConfig` | `pricing_config.py` | `key` PK, `value` numeric |
| `WhatsAppTemplate` | `whatsapp_template.py` | `agent_id`, `meta_template_id`, `name`, `language`, `status`, `components` JSON |
| `ProcessedMessage` | `processed_message.py` | `message_id` unique, `processed_at` — dedup להודעות נכנסות |
| `AuthUser` | `auth/models.py` | `email`, `password_hash`, `role` (super_admin/admin/employee), `parent_id` FK |

---

## Frontend

### דפים (`frontend/app/`)

| נתיב | תיאור |
|---|---|
| `/` | רשימת סוכנים |
| `/new` | יצירת סוכן חדש |
| `/agent/[id]` | עריכת סוכן — טאבים |
| `/login` | כניסה |
| `/dashboard` | דשבורד admin |
| `/users` | ניהול אנשי קשר |
| `/database` | ניהול DB |

### טאבי עריכת סוכן (`/agent/[id]`)

| טאב | קובץ | זמינות |
|---|---|---|
| `prompt` | `PromptTab.tsx` | כולם |
| `conversations` | `ConversationsTab.tsx` | כולם |
| `knowledge` | `KnowledgeTab.tsx` | כולם |
| `media` | `MediaTab.tsx` | כולם |
| `templates` | `TemplatesTab.tsx` | Meta + waba_id בלבד |
| `calendar` | `CalendarTab.tsx` | כולם |
| `followups` | `FollowUpTab.tsx` | כולם |
| `summaries` | `SummaryTab.tsx` | כולם |
| `settings` | `SettingsTab.tsx` | admin/super_admin |

---

## זרם הודעה מקצה לקצה

```
1. לקוח שולח הודעה ב-WhatsApp
2. Meta/Wasender שולחים POST /webhook
3. אימות webhook (verify_token / HMAC)
4. dedup — ProcessedMessage table
5. message_buffer — ממתין לbatch (אם הגדרות batching)
6. טרנסקריפציה (audio בלבד) — Google Speech-to-Text
7. get_history_with_summary — היסטוריה + summary injection
8. build_system_prompt — blocks עם prompt caching
9. LLM call (Anthropic/OpenAI/Gemini) — tool loop עד 5 סיבובים
10. tool calls: check_availability, book_appointment, search_knowledge וכו'
11. שמירת הודעה ב-DB
12. שליחת תשובה טקסט + מדיה (אם יש)
13. trigger context summary (Celery, אם threshold)
14. trigger follow-up timer (Redis sorted set)
```

---

## יכולות הסוכן — כלים

מוגדרים ב-`backend/core/ai_config.py` → מבוצעים ב-`backend/services/tools.py`

| כלי | תיאור |
|---|---|
| `update_user_info` | שמירת שם/מגדר/תחום עסק/הערות על הלקוח |
| `search_knowledge` | חיפוש סמנטי במסמכים שהועלו (PDF/DOCX) |
| `query_products` | שאילתה על טבלאות CSV — חיפוש, סינון, aggregation |
| `check_availability` | זמנים פנויים ביומן Google Calendar — מחזיר 10 ראשונים |
| `book_appointment` | קביעת פגישה בפועל (5–480 דקות) |
| `get_my_appointments` | פגישות קרובות של הלקוח |
| `cancel_appointment` | ביטול פגישה לפי ID |
| `reschedule_appointment` | שינוי זמן פגישה לפי ID |
| `send_media` | שליחת תמונה/וידאו/קובץ לפי media_id |
| `search_media` | חיפוש סמנטי בספריית המדיה |
| `opt_out_conversation` | הסרת לקוח מהודעות יזומות |

---

## מערכת יומן ופגישות

**קובץ:** `backend/services/appointments.py`

### הגדרות per-agent (`calendar_config` JSON)

| שדה | ברירת מחדל | תיאור |
|---|---|---|
| `google_tokens` | — | OAuth tokens ל-Google |
| `google_calendar_id` | `"primary"` | יומן יעד |
| `working_hours` | א-ה 09:00–17:00 | שעות פעילות per יום (0=ראשון) |
| `default_duration` | `30` | משך ברירת מחדל בדקות |
| `buffer_minutes` | `10` | buffer בין פגישות |
| `days_ahead` | `14` | טווח חיפוש זמינות |
| `timezone` | `"Asia/Jerusalem"` | אזור זמן |
| `webhook_url` | — | URL לאירועי פגישות |
| `reminders` | — | חוקי תזכורות |
| `allow_double_booking` | `false` | אפשר פגישות מרובות על אותו זמן |

### זרם קביעת פגישה

```
check_availability:
  ← שעות עבודה (working_hours)
  ← busy מ-Google Calendar
  ← busy מ-DB (appointments)
  → מחזיר slots פנויים (10 ראשונים)

book_appointment:
  → בדיקת התנגשות ב-DB (מבוטל אם allow_double_booking=true)
  → יצירת event ב-Google Calendar
  → שמירת Appointment ב-DB
  → send_webhook "appointment.created" (כולל סיכום שיחה אם summaries פעיל)
  → create_reminders_for_appointment
```

### double_booking
Flag `allow_double_booking` per-agent — כשפעיל, מדלג על בדיקות conflict ב-`check_availability`, `book_appointment`, ו-`reschedule_appointment`. מתאים לעסקים עם כמה נותני שירות במקביל.

---

## RAG — מאגר ידע

**קבצים:** `backend/services/documents.py`, `tables.py`, `embeddings.py`, `knowledge.py`

### מסמכים (PDF / DOCX)
```
העלאה → חילוץ טקסט (PyMuPDF / python-docx)
  → chunking: CHUNK_SIZE=1000, CHUNK_OVERLAP=200
  → embedding batch: OpenAI text-embedding-3-small (1536 dim)
  → שמירה: DocumentChunk.embedding (pgvector Vector(1536))

חיפוש:
  → embedding לשאילתה
  → cosine_distance מול כל chunks של הסוכן
  → 5 chunks הכי קרובים
```

### טבלאות CSV
```
העלאה → pandas → inference סוג עמודות
  → embedding per row (_row_to_text → JSON string)
  → שמירה: DataRow.embedding

חיפוש:
  → search_rows: embedding cosine distance
  → query_table: סינון לפי filters (op: lt/gt/eq/contains)
  → aggregate_table: sum/avg/count/min/max
```

### שימוש בשיחה
`knowledge.get_context` מחזיר רק **רשימת שמות** מקורות — לא את התוכן עצמו. התוכן נשלף on-demand דרך הכלים `search_knowledge` / `query_products`.

**חשוב:** embeddings משתמשים ב-`settings.openai_api_key` ישירות — **לא** ב-key_manager pool.

---

## מערכת תזכורות

**קובץ:** `backend/services/reminders.py`

### יצירה
אוטומטית ב-`book_appointment` → `create_reminders_for_appointment` לפי `calendar_config.reminders.rules`.

כל חוק מכיל: `minutes_before`, `content_type`, תוכן.

### סוגי תוכן

| סוג | תיאור | ספק נדרש |
|---|---|---|
| `template` | טקסט קבוע עם משתנים: `{customer_name}`, `{title}`, `{date}`, `{time}`, `{day}`, `{duration}`, `{agent_name}` | Meta + Wasender |
| `ai` | Claude מנסח תזכורת לפי הקשר השיחה האחרונה | Wasender בלבד |
| `meta_template` | תבנית WhatsApp Business מאושרת עם parameter mapping | Meta בלבד |

**מגבלה חשובה:** תזכורות טקסט חופשי (`template`, `ai`) דורשות Wasender. Meta מחייב תבניות מאושרות בלבד.

### שליחה
- Scheduler רץ כל 30 שניות
- Batch 50, delay 1s בין אצוות
- opt-out check — אם `Conversation.opted_out`, תזכורת מבוטלת

---

## Follow-ups

**קבצים:** `backend/services/followups.py`, `followup_evaluator.py`

### ארכיטקטורה
```
סוכן מגיב → ZADD Redis sorted set "followup:timers" (timestamp)
  → scheduler רץ כל 30s → check_followup_timers
  → eligibility check:
    - מינימום הודעות
    - שעות פעילות
    - לא בהתנגשות עם תזכורת ממתינה
    - opted_out check
  → AI evaluator (followup_evaluator) — מחליט אם לשלוח ומה לכתוב
  → יצירת ScheduledFollowup → process_pending_followups
```

### מצבי ScheduledFollowup
`pending` → `evaluating` → `sent` / `skipped` / `failed`

partial unique index — לא ייתכן שני follow-ups pending/evaluating על אותה שיחה.

---

## סיכומי שיחה

שני מנגנונים **נפרדים לחלוטין**:

### א) Context Summary — זיכרון פנימי ל-LLM

**מטרה:** מניעת גלישה מ-context window בשיחות ארוכות

**הגדרות** (`context_summary_config`):

| שדה | ברירת מחדל |
|---|---|
| `enabled` | `false` |
| `message_threshold` | `20` |
| `messages_after_summary` | `20` |
| `full_summary_every` | `5` (incremental cycles) |

**זרם:**
```
should_trigger_summary → True
  → Celery task: run_context_summary_task
  → Redis lock "context_summary:lock:{conv_id}"
  → LLM call (מודל הסוכן, max_tokens=2000)
  → שמירה ב-ConversationContextSummary
  → get_history_with_summary מזריק "[סיכום שיחה קודמת]" + הודעות אחרי הסיכום
```

**טריגר:** מספר הודעות חדשות מאז הסיכום האחרון ≥ `message_threshold`, או התקרבות ל-90% מ-context window.

### ב) Conversation Summary + Webhook חיצוני

**מטרה:** התראה לCRM חיצוני בסיום שיחה

**הגדרות** (`summary_config`):

| שדה | ברירת מחדל |
|---|---|
| `enabled` | `false` |
| `delay_minutes` | `30` |
| `min_messages` | `5` |
| `max_messages` | `100` |
| `webhook_url` | — |
| `summary_prompt` | — |

**מודל קבוע:** `claude-sonnet-4-6` (לא מתחלף לפי מודל הסוכן)

**Webhook payload:**
```json
{
  "event": "conversation_summary",
  "summary": "...",
  "customer": { "name": "...", "phone": "..." },
  "agent": { "id": 1, "name": "..." }
}
```

**retry:** `retry_pending_webhooks` — ניסיונות חוזרים על webhooks שנכשלו.

---

## מדיה וקבצים

**קבצים:** `backend/services/storage.py`, `agent_media.py`, `media.py`

### ספריית מדיה per-agent
- אחסון: Cloudflare R2 (`agents/{id}/{type}s/...`)
- embedding per item לחיפוש סמנטי
- עד 15 פריטים → רשימה מלאה בפרומפט; מעל 15 → הסוכן קורא ל-`search_media`
- ניתוח אוטומטי בהעלאה: שם, תיאור, caption — דרך Claude (כפוי, לא לפי מודל הסוכן)

### מדיה נכנסת מלקוח
- Meta: הורדה דרך Graph API + טרנסקריפציה (audio)
- Wasender: `decrypt_media` + הורדה מURL
- תמונות: Claude מנתח ועונה (fallback מ-Gemini אם יש תמונות)

---

## ספקי WhatsApp

### Meta (WhatsApp Business API)
- **Webhook:** `GET /webhook` לאימות + `POST /webhook` להודעות
- **אימות:** `verify_token` מ-Agent config
- **שליחה:** `phone_number_id` + `access_token` → Graph API v22.0
- **תבניות:** `send_template` לפתיחת שיחות

### Wasender
- **Webhook:** `/webhook/wasender` + אימות HMAC
- **שליחה:** `api_key` + `session` → wasenderapi.com
- **יתרון:** תזכורות וfollow-ups טקסט חופשי (לא רק תבניות)

**provider_config** על Agent — מכיל הגדרות ספציפיות לסוכן (api_key, session, webhook_secret עבור Wasender).

---

## ספקי LLM וניהול API Keys

### בחירת ספק (`services/llm/__init__.py`)

```python
"gpt-*" / "o1-*" / "o3-*"  →  OpenAIProvider
"gemini-*"                  →  GeminiProvider
כל שאר                      →  AnthropicProvider
```

### key_manager

- **Pool גלובלי:** `ANTHROPIC_API_KEYS`, `OPENAI_API_KEYS`, `GOOGLE_API_KEYS` (comma-separated)
- **Round-robin** בין מפתחות
- **Cooldown:** על 429 (RateLimitError) — מפתח נכנס ל-cooldown עם retry-after
- **Dead:** על auth error — מפתח מוסר לצמיתות
- **Override per-agent:** `Agent.custom_api_keys` JSON — מפתח פרטי לסוכן, עדיפות על pool
- **Cache:** provider instances נשמרים לפי `provider:key_prefix[:12]`

### Provider capabilities

| יכולת | Anthropic | OpenAI | Gemini |
|---|---|---|---|
| שיחה + כלים | ✓ | ✓ | ✓ |
| תמונות נכנסות | ✓ | ✓ | ✗ (fallback ל-Claude) |
| Prompt caching | ✓ | ✗ | ✗ |
| describe_image | Claude בלבד (כפוי) | — | — |

### Context window limits (90% safe)

| ספק | גבול בטוח |
|---|---|
| Anthropic | 180,000 tokens |
| OpenAI | 115,200 tokens |
| Google | 943,718 tokens |

---

## Auth והרשאות

**קבצים:** `backend/auth/`

### תפקידים

| תפקיד | גישה |
|---|---|
| `super_admin` | כל המערכת, כל הסוכנים, super_admin dashboard |
| `admin` | סוכנים שלו + employees שלו |
| `employee` | סוכנים ספציפיים שהוקצו לו (parent_id → admin) |

### JWT
- Access token: 60 דקות (ברירת מחדל)
- Refresh token: 7 ימים
- `JWT_SECRET` חובה בפרודקשן — `RuntimeError` בהיעדרו

### Rate limiting
5 ניסיונות login ב-300 שניות לפי IP (in-memory)

---

## מעקב שימוש ועלויות

**קבצים:** `backend/services/usage_tracking.py`, `pricing.py`

### מצטבר (`Agent.usage_stats`)
JSON per model — input/output/cache_read/cache_creation tokens. מתעדכן אחרי כל קריאה ל-LLM.

### יומי (`AgentUsageDaily`)
שורה unique per `(agent_id, date, model, source)`.

מקורות (`source`): `conversation`, `reminder`, `summary`, `context_summary`

### תמחור (`PricingConfig`)
מחיר per model per 1M tokens + `usd_to_ils`.

---

## תשתית וסקייל

### Docker Compose (local/production)

| שירות | image |
|---|---|
| nginx | nginx:alpine |
| backend | Dockerfile (FastAPI, port 8000) |
| frontend | frontend/Dockerfile (Next.js, port 3000) |
| celery_worker | concurrency=4 |
| db | pgvector/pgvector:pg16 |
| redis | redis:7-alpine (appendonly) |

### PostgreSQL tuning (docker-compose)
```
max_connections=300
shared_buffers=256MB
work_mem=16MB
```

### SQLAlchemy pool
```
pool_size=20
max_overflow=30
pool_recycle=300
```

### Scheduler (asyncio, בתוך FastAPI process)
- cycle: 30s
- Redis lock `scheduler:lock` TTL 180s — מונע ריצה כפולה ב-multi-instance
- fallback: ריצה ללא lock אם Redis לא זמין

### Celery
- broker: Redis
- concurrency: 4 workers
- task: `backend.tasks.context_summary` בלבד
- lock per-conversation: `context_summary:lock:{conversation_id}`

### גבולות ומגבלות

| פרמטר | ערך |
|---|---|
| Slots זמינות שמוחזרים לסוכן | 10 ראשונים |
| מדיה בפרומפט (ללא search) | עד 15 פריטים |
| Batch תזכורות/סיכומים | 50 per cycle |
| טקסט מקסימלי לסיכום webhook | 30,000 תווים |
| משך פגישה | 5–480 דקות |
| Max tool rounds per response | 5 |
| Dedup TTL הודעות | 5 דקות |
| Login rate limit | 5 ניסיונות / 300s / IP |
| Embedding dimensions | 1,536 (text-embedding-3-small) |

### Render Blueprint
- Backend: `standard` plan (~$25/mo)
- Frontend: `starter` plan
- Region: Frankfurt (קרוב לישראל)
- Health check: `GET /health`
