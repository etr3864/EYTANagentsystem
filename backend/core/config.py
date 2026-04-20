from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/whatsapp_agents"
    anthropic_api_key: str = ""
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None  # Gemini API

    # Multi-key pools (comma-separated). Falls back to singular key above if empty.
    anthropic_api_keys: str = ""
    openai_api_keys: str = ""
    google_api_keys: str = ""
    google_credentials_json: Optional[str] = None
    
    # Frontend URL (for OAuth redirects back to the UI)
    frontend_url: str = "http://localhost:3000"

    # Google Calendar OAuth
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    oauth_redirect_base: Optional[str] = None
    
    # Cloudflare R2 Storage
    r2_account_id: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket_name: str = "whatsapp-media"
    r2_public_url: Optional[str] = None
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # JWT Authentication
    jwt_secret: str = ""  # Must be set in production!
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7

    # ── Meta / Facebook App (Optive central App) ──────────────────────────────
    # Required for Instagram, Messenger, WhatsApp Meta channels.
    # Generate CREDENTIALS_ENCRYPTION_KEY with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Store the key securely — losing it makes all stored tokens unreadable.
    meta_app_id: Optional[str] = None
    meta_app_secret: Optional[str] = None
    meta_verify_token: Optional[str] = None  # Single verify token for /webhook/meta
    credentials_encryption_key: Optional[str] = None  # Fernet key for encrypting channel credentials

    # Alert channel for delivery failures / disconnected channels
    alert_webhook_url: Optional[str] = None  # Slack/Discord/custom webhook URL

    model_config = {"env_file": ".env", "extra": "ignore"}
    
    @property
    def r2_endpoint_url(self) -> str | None:
        """R2 S3-compatible endpoint URL."""
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return None
    
    @property
    def r2_configured(self) -> bool:
        """Check if R2 is properly configured."""
        return all([
            self.r2_account_id,
            self.r2_access_key_id,
            self.r2_secret_access_key,
            self.r2_public_url
        ])

    @property
    def meta_configured(self) -> bool:
        """Check if Meta App is configured for new channels."""
        return all([
            self.meta_app_id,
            self.meta_app_secret,
            self.meta_verify_token,
            self.credentials_encryption_key,
        ])


settings = Settings()

if not settings.jwt_secret:
    raise RuntimeError("JWT_SECRET environment variable must be set")
