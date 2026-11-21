from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Marca visible (panel y /como-funciona). Único lugar donde vive el nombre: cámbialo aquí o con BRAND_NAME.
    brand_name: str = "Sello"
    brand_tagline: str = "triaje de solicitudes de TI"
    database_url: str = "sqlite:///./triaje.db"
    llm_provider: str = "mock"  # "mock" (sin costo) | "gemini" (Google AI Studio) | "anthropic"
    anthropic_api_key: str = ""
    google_api_key: str = ""  # clave de Google AI Studio (https://aistudio.google.com/apikey)
    gemini_model: str = "gemini-3.5-flash"  # verifica el nombre vigente en la documentación de Google
    llm_model: str = "claude-haiku-5-5"  # verifica el nombre vigente en la documentación del proveedor
    confidence_threshold: float = 0.75
    sla_hours: str = "alta=4,media=24,baja=72"  # plazo para resolver, según la prioridad vigente
    # Ruteo: equipo que atiende cada categoría (la vigente, así que una corrección cambia de equipo).
    team_routes: str = (
        "acceso_cuentas=Accesos,hardware=Equipos,software=Software,red_conectividad=Redes,"
        "nuevo_servicio=Servicios,otro=Mesa general"
    )
    always_review_priorities: str = "alta"  # prioridades que SIEMPRE pasan por una persona
    cors_origins: str = "http://localhost:5173"
    # Demo pública: sin texto libre de visitantes, límite por IP y tope de filas.
    demo_mode: bool = False
    demo_rate_per_minute: int = 10
    preview_rate_per_minute: int = 6  # «Prueba tu solicitud»: por IP, también fuera de la demo
    demo_max_requests: int = 300
    client_ip_header: str = ""  # en Render: True-Client-IP
    # Avisos al cambiar de estado: webhook saliente firmado con HMAC-SHA256 (cabecera X-Sello-Signature).
    # Sin URL, o en la demo pública, se registran como «simulado» y no salen del servidor.
    notify_url: str = ""
    notify_secret: str = ""
    static_dir: str = "../frontend/dist"  # panel compilado; si no existe, la API no lo sirve


settings = Settings()
