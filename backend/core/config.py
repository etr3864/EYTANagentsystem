from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/whatsapp_agents"
    anthropic_api_key: str
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None  # Gemini API
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


settings = Settings()
