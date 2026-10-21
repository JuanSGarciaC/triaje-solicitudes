from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./triaje.db"
    llm_provider: str = "mock"  # "mock" (sin costo) | "gemini" (Google AI Studio) | "anthropic"
    anthropic_api_key: str = ""
    google_api_key: str = ""  # clave de Google AI Studio (https://aistudio.google.com/apikey)
    gemini_model: str = "gemini-3.5-flash"  # verifica el nombre vigente en la documentación de Google
    llm_model: str = "claude-haiku-5-5"  # verifica el nombre vigente en la documentación del proveedor
    confidence_threshold: float = 0.75
    always_review_priorities: str = "alta"  # prioridades que SIEMPRE pasan por una persona
    cors_origins: str = "http://localhost:5173"


settings = Settings()
