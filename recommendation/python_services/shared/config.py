from pydantic_settings import BaseSettings, SettingsConfigDict

# Per-provider defaults, chosen for reliable tool calling rather than raw
# capability: the assistant's job is to call the right portal route and report
# what came back, not to reason at length.
DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "google": "gemini-2.5-flash",
}


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
    #
    # BACKEND_BASE_URL must include the API version prefix: the portal routes
    # the assistant calls live at /api/v1/portal/q/{token}.
    BACKEND_BASE_URL: str = "http://localhost:8080/api/v1"
    BACKEND_TIMEOUT_SECONDS: float = 10.0

    # Which chat model backs the assistant: "openai" or "google" (Gemini).
    LLM_PROVIDER: str = "openai"

    # Left empty, each provider gets a sensible tool-calling default. Set it
    # explicitly to pin a model.
    LLM_MODEL: str = ""

    # Empty means the assistant is not configured. The service still starts
    # and reports itself unavailable on /health, so the portal can hide the
    # assistant rather than offering a control that always fails.
    LLM_API_KEY: str = ""

    # Optional staff-role token used to read discount governance. Left empty,
    # the assistant runs without it: it never decides a discount itself, so
    # the ceilings are context it can do without -- and keeping internal
    # thresholds out of a customer-facing prompt is the safer default.
    SERVICE_ACCOUNT_JWT: str = ""

    # Whether the assistant may confirm a quotation on the customer's behalf.
    #
    # Off by default. The portal gates confirmation behind an explicit
    # signatory attestation ("I confirm that I am an authorized purchasing
    # signatory..."), and a chat turn is not that attestation. With this off
    # the assistant explains the step and sends the customer to the confirm
    # button; the backend's own state machine is the boundary either way.
    ALLOW_ASSISTANT_CONFIRM: bool = False

    SESSION_TTL_SECONDS: int = 3600
    AI_SALESMAN_HOST: str = "0.0.0.0"
    AI_SALESMAN_PORT: int = 8002

    # Shared runtime
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def llm_provider(self) -> str:
        """The configured provider, normalised. Aliases fold into "google"."""
        provider = (self.LLM_PROVIDER or "openai").strip().lower()
        if provider in ("google", "gemini", "google-genai", "google_genai"):
            return "google"
        return provider

    @property
    def llm_model(self) -> str:
        """The model to use, falling back to the provider's default."""
        if (self.LLM_MODEL or "").strip():
            return self.LLM_MODEL.strip()
        return DEFAULT_MODELS.get(self.llm_provider, "")

    @property
    def llm_configured(self) -> bool:
        """Whether a usable LLM credential is present."""
        key = (self.LLM_API_KEY or "").strip()
        return bool(key) and not key.startswith("your_") and bool(self.llm_model)

    @property
    def governance_configured(self) -> bool:
        """Whether a service-account token for the governance read is present."""
        jwt = (self.SERVICE_ACCOUNT_JWT or "").strip()
        return bool(jwt) and not jwt.startswith("your_")


settings = Settings()
