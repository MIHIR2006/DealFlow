from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables or .env file."""

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/dealflow360"
    MARGIN_THRESHOLD_PCT: float = 20.0
    TOP_K: int = 10
    MIN_SUPPORT: int = 3

    HOST: str = "0.0.0.0"
    PORT: int = 8001
    ENVIRONMENT: str = "development"

    DB_MIN_CONNECTIONS: int = 1
    DB_MAX_CONNECTIONS: int = 10
    DB_COMMAND_TIMEOUT: float = 10.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
