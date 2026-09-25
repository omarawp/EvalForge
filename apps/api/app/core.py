from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./evalforge.sqlite3"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    evalforge_max_concurrency: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
