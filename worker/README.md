# Worker IA En Ligne

Ce dossier contient le Worker Cloudflare a deployer pour le mode `online`.

## Endpoints

- `POST /session` — renvoie aussi `capabilities: { rerank, embed_query }` selon la configuration.
- `POST /analysis`
- `POST /rerank` — reranking de scrutins candidats via OpenRouter (optionnel, voir plus bas).
- `POST /embed-query` — embedding d'une requete utilisateur via OpenRouter (optionnel).

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

### Reranking / embedding distant (optionnel)

- `OPENROUTER_API_KEY` — **secret** (`wrangler secret put OPENROUTER_API_KEY`), jamais
  dans `wrangler.toml`. Sans cette cle, `/rerank` et `/embed-query` repondent
  `FEATURE_DISABLED` et le front retombe sur le classement local : rien ne casse.
  Utiliser une cle distincte de celle du cron GitHub Actions pour ne pas partager
  le quota quotidien du tier gratuit.
- `OPENROUTER_BASE_URL` (optionnel, defaut `https://openrouter.ai/api/v1`)
- `RERANK_MODEL` (optionnel, defaut `nvidia/llama-nemotron-rerank-vl-1b-v2:free`)
- `EMBED_MODEL` (optionnel, defaut `nvidia/llama-nemotron-embed-vl-1b-v2:free`)
- `OPENROUTER_DAILY_LIMIT` (optionnel, defaut 45) — budget quotidien global partage
  entre `/rerank` et `/embed-query` (le tier gratuit OpenRouter est limite par cle) ;
  une fois epuise le Worker repond `REMOTE_QUOTA_EXHAUSTED` sans appeler l'amont.
- `RERANK_MAX_REQUESTS` / `RERANK_WINDOW_SECONDS` (optionnels, defauts 10/600)
- `EMBED_MAX_REQUESTS` / `EMBED_WINDOW_SECONDS` (optionnels, defauts 10/600)
- `RERANK_UPSTREAM_TIMEOUT_MS` (optionnel, defaut 6000)
- `RERANK_DISABLED` / `EMBED_DISABLED` (optionnels, `"true"` pour couper une
  fonctionnalite sans retirer la cle)

Schemas : `/rerank` accepte `{ query, documents[], top_n? }` (max 40 documents de
500 caracteres) et renvoie `{ results: [{ index, score }], model }`. `/embed-query`
accepte `{ input }` (max 800 caracteres) et renvoie le vecteur **brut non tronque**
`{ embedding, dimension, model }` — la troncature Matryoshka et la re-normalisation
sont faites cote front d'apres la dimension publiee dans le manifest RAG.
Tests : `npm run test:worker-rag`.

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

## Streaming

`POST /analysis` accepte `"stream": true` dans le corps : le Worker demande
alors un flux SSE a l'AI Gateway et le pipe tel quel au navigateur
(`Content-Type: text/event-stream`). Les metadonnees (fournisseur, modele,
route, nombre de bascules) sont exposees dans les en-tetes
`x-deputegpt-provider`, `x-deputegpt-model`, `x-deputegpt-route` et
`x-deputegpt-fallback-count`. Sans `stream`, la reponse JSON historique est
inchangee. Si l'amont ne renvoie pas de SSE, le Worker retombe sur la reponse
JSON classique.

## Notes

- Le Worker suppose que la route dynamique `dynamic/deputegpt-analysis` existe deja dans AI Gateway.
- Le front doit renseigner `api_base_url` avec l URL publique de ce Worker dans `public/data/model-catalog.json`.
- Si `TURNSTILE_SECRET_KEY` n est pas defini, la creation de session reste autorisee sans verification Turnstile.
