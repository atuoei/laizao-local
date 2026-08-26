from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    auth_enabled: bool = True
    database_url: str
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    auth_secret: str = "change-this-before-production"
    auth_token_ttl_seconds: int = 60 * 60 * 24 * 7
    sms_mode: str = "local"
    local_sms_code: str = "123456"
    admin_username: str = "admin"
    admin_initial_password: str = ""
    upload_dir: str = "/app/uploads"
    public_api_base_url: str = "http://localhost:8001"
    max_upload_bytes: int = 100 * 1024 * 1024
    max_cover_bytes: int = 5 * 1024 * 1024
    ai_provider: str = "mock"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
