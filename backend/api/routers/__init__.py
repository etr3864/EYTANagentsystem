from backend.api.routers.agents import router as agents_router
from backend.api.routers.users import router as users_router
from backend.api.routers.conversations import router as conversations_router
from backend.api.routers.database import router as database_router
from backend.api.routers.webhook import router as webhook_router
from backend.api.routers.webhook_wasender import router as webhook_wasender_router
from backend.api.routers.knowledge import router as knowledge_router
from backend.api.routers.calendar import router as calendar_router
from backend.api.routers.summaries import router as summaries_router
from backend.api.routers.media import router as media_router
from backend.api.routers.templates import router as templates_router

__all__ = [
    'agents_router', 'users_router', 'conversations_router', 
    'database_router', 'webhook_router', 'webhook_wasender_router', 
    'knowledge_router', 'calendar_router', 'summaries_router', 'media_router',
    'templates_router'
]
