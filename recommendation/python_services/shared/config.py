from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Shared application settings loaded from environment or .env file."""

    # Shared Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/dealflow360"
    DB_MIN_CONNECTIONS: int = 1
    DB_MAX_CONNECTIONS: int = 10
    DB_COMMAND_TIMEOUT: float = 10.0

    # Recommendation Engine
    MARGIN_THRESHOLD_PCT: float = 20.0
    TOP_K: int = 10
    MIN_SUPPORT: int = 3

    # AI Salesman
    BACKEND_BASE_URL: str = "http://localhost:8080"
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o"
    LLM_API_KEY: str = "your_openai_api_key_here"
    SERVICE_ACCOUNT_JWT: str = "your_internal_service_account_jwt_here"
    SESSION_TTL_SECONDS: int = 3600

    # Shared runtime
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
