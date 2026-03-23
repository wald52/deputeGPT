# Worker IA En Ligne

Ce dossier contient le Worker Cloudflare a deployer pour le mode `online`.

## Endpoints

- `POST /session`
- `POST /analysis`

## Variables a configurer

- `SESSION_SECRET`
- `AI_GATEWAY_ACCOUNT_ID`
- `AI_GATEWAY_GATEWAY_ID`
- `AI_GATEWAY_TOKEN`
- `AI_GATEWAY_ROUTE`
- `AI_ROUTE_STEP_MAP`
- `ALLOWED_ORIGINS`
- `TURNSTILE_SECRET_KEY` (optionnel mais recommande)
- `SESSION_MAX_REQUESTS` (optionnel)
- `SESSION_WINDOW_SECONDS` (optionnel)
- `ANALYSIS_MAX_REQUESTS` (optionnel)
- `ANALYSIS_WINDOW_SECONDS` (optionnel)

## Exemple minimal

```toml
ALLOWED_ORIGINS = "https://<votre-site>.github.io,http://127.0.0.1:8000"
AI_GATEWAY_ROUTE = "dynamic/deputegpt-analysis"
AI_ROUTE_STEP_MAP = """
[
  { "provider": "google-ai-studio", "model": "gemini-2.5-flash-lite" },
  { "provider": "openrouter", "model": "openrouter/free" },
  { "provider": "groq", "model": "llama-3.1-8b-instant" },
  { "provider": "cerebras", "model": "llama3.1-8b" },
  { "provider": "workers-ai", "model": "@cf/meta/llama-3.1-8b-instruct-fp8-fast" }
]
"""
```

## Notes

- Le Worker suppose que la route dynamique `dynamic/deputegpt-analysis` existe deja dans AI Gateway.
- Le front doit renseigner `api_base_url` avec l URL publique de ce Worker dans `public/data/model-catalog.json`.
- Si `TURNSTILE_SECRET_KEY` n est pas defini, la creation de session reste autorisee sans verification Turnstile.
