# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

`AGENTS.md` (in French) is the canonical product/architecture spec. When a rule
here and a rule there ever diverge, `AGENTS.md` wins — and per its own
maintenance note, update `AGENTS.md` *first* when a rule changes. This file is a
practical English digest plus the commands and conventions you need to be
productive quickly.

Key working conventions inherited from `AGENTS.md`:
- **Answer in French.** User-facing output, commit messages, and explanations are expected in French.
- **Explore narrowly.** Search for a symbol/feature before opening files; prefer small specialized modules over the big entry points (`index.html`, `js/app-runtime.js` are last resorts). Use the `tache -> fichiers` routing matrix in `AGENTS.md` to jump straight to the right module.
- **Do not read large data artifacts in full.** Avoid `public/data/votes/**`, `public/data/deputes_photos/**`, `public/data/search_index.json`, `public/data/rag/**` (except `manifest.json`), `js/transformers.min.js`, and `Scrutins/**`. Infer schemas from the repository modules, manifests, or a small sample.

## What this is

DeputeGPT is a **static client-side web app** (vanilla ES modules, no framework)
for querying French MPs' (*députés*) votes. A user selects an MP, explores their
votes, and asks factual or analytical questions. It is hosted on GitHub Pages,
with data prepared nightly by GitHub Actions.

**Cardinal product rule:** *Do not send everything to the LLM.* Exact, tabular,
or filterable questions (lists, counts, date ranges, filters) must be answered
**deterministically in the browser**. The LLM is used only for final synthesis
over a small, already-filtered context. The remote `online` source must never
take over exact lists/counts/periods/filters.

## Commands

Dependencies: `npm ci` (Node 20) and `pip install -r requirements.txt` (Python
3.12, only needed for the data-pipeline scripts).

```bash
# Run the app locally (REQUIRED server — sets COOP/COEP headers for WebGPU + WASM threads)
npm run serve                 # python serve_local.py -> http://localhost:8000
                              # Opening index.html directly will NOT work (cross-origin isolation needed)

# Build the production bundle (esbuild -> js/dist/, then regenerate PWA assets)
npm run build:app

# Tests
npm run test:unit             # Vitest, runs js/**/*.test.js (node env)
npx vitest run js/domain/vote-helpers.test.js   # single unit test file
npm run test:playwright       # Playwright e2e (tests/*.spec.js); auto-starts serve_local.py
npm run playwright:install    # one-time: install chromium for Playwright
npx playwright test tests/pwa.spec.js           # single e2e spec
npm run test:router           # router regression vs tests/router/question-bank.jsonl
npm run test:circuit-breaker  # online-runtime circuit breaker test
npm run test:lighthouse       # perf budget (needs a server + bundled entry running)

# Quick sanity checks (from AGENTS.md)
node --check js/app-runtime.js
python -m py_compile scripts/generate_semantic_index.py
```

There is no separate lint step; rely on `node --check` and the test suites.

## Architecture

Entry: `index.html` loads `js/app.js` -> `js/app-runtime.js` (wired via
`js/core/app-bootstrap.js`). Treat `app-runtime.js` and `index.html` as
last-resort orchestration files; nearly all logic lives in focused modules under
`js/`.

The request flow for a user question is the heart of the system:

1. **`js/domain/router.js`** (with `router-primitives.js`, `router-constants.js`)
   resolves the **scope**, builds a normalized execution plan
   (`questionType`, `candidateStrategy`, `requiresLlm`, `responseMode`,
   `unsupportedReason`), and derives an external action: `deterministic`,
   `analysis_rag`, or `clarify`.
2. **Intent** is classified in `js/domain/intent-classifier.js` /
   `intent-detectors.js`. **Scope/follow-up references** (`ces votes`,
   `ceux-ci`, `les derniers`) are resolved in `scope-resolver.js` /
   `clarification-resolution.js`, reusing session memory (`lastResultVoteIds`,
   `activeDeputeId`, `lastFilters`, etc. — see `js/core/state.js`).
3. **Deterministic answers** (lists, counts, subjects) come from
   `deterministic-router.js` / `deterministic-responses.js` — no LLM.
4. **Analytical answers** build a short context via `analysis-context.js` /
   `analysis-ranking.js`, then call an AI runtime for synthesis only.

**AI runtimes** (under `js/ai/`) are pluggable behind model loading
(`model-loader.js`, `model-selection.js`, `model-ui-facade.js`,
`consent-modal.js`):
- Local browser inference uses **transformers.js + WebGPU** (MLC/WebLLM were fully removed).
- `qwen3-runtime.js` — **stable** local chat (Qwen3 ONNX, `AutoTokenizer + Qwen3ForCausalLM`).
- `qwen35-runtime.js` — **experimental** Qwen3.5 (easy to remove if it doesn't pan out).
- `online-runtime.js` — remote source via the **Cloudflare Worker** (default for analysis requests).
- `semantic-rag-runtime.js` — opt-in local semantic reranking.
- `answer-sanitizer.js` — strips `<think>` blocks; internal reasoning must never reach the UI.

Default chat mode is **non-thinking** (`enable_thinking: false`, French, final
output only). Model catalog source of truth is
`public/data/model-catalog.json` (mirrored by `js/data/model-catalog-repository.js`
with `js/ai/fallback-model-catalog.js`). **No model downloads silently** —
explicit consent and visible size are required; the last choice is remembered locally.

**Data access** is via repositories under `js/data/` (`votes-repository.js`,
`deputes-repository.js`, `groupes-repository.js`, `search-index-repository.js`) —
read these to learn the implicit data schema rather than the JSON blobs.

**State/storage:** `js/core/state.js` (session memory), `js/core/storage.js`
(localStorage), chat history in `js/core/chat-history-persistence.js` /
`chat-history-provider.js`.

**UI** lives under `js/ui/` — the chat surface is in `js/ui/chat/`
(`chat-controller.js` is the main controller; `chat-composer.js`,
`chat-renderer.js`, `chat-pagination-controller.js`, `chat-scope-controller.js`),
plus side panels `search-panel.js`, `depute-panel.js`, `hemicycle-panel.js`.

## RAG

Browser default RAG is lexical/structural (no mandatory local embedding in v1).
Semantic RAG is **opt-in, advanced mode only**: `single-vector` default,
`multi-vector` experimental. Artifacts are prepared **server-side nightly** and
published under `public/data/rag/` (lexical index, semantic index, multi-vector
index, plus `manifest.json`). The browser only computes the *query* embedding
when semantic mode is active, using a dedicated embedding model — never a
generative model. Indexing is at the single-*scrutin* level, not per
depute-vote pair.

## Data pipeline (`scripts/` + GitHub Actions)

`.github/workflows/global_update.yml` runs nightly (`cron 0 4 * * *`) and on
manual dispatch. It downloads MP and vote data, regenerates hemicycle graphics,
group colors, and RAG artifacts, then runs `npm run build:app` and commits the
results (`public/data`, `pwa-assets.json`, `sw.js`, `js/dist`) to `main` in a
single commit. Key scripts: `process_votes.py`, `update_deputes_actifs.py`,
`generate_semantic_index.py`, `scrap_places.py`, `update_hemicycle_svg.py`,
`update_group_colors.py`. Failures open/refresh a single deduped `ci-failure`
issue rather than alerting daily.

Lexical index and RAG manifest are mandatory (build fails without them);
semantic indexes degrade gracefully (kept from the prior day if HuggingFace is
unavailable). **Large model weights are never committed** — rely on Hugging Face
+ browser cache.

## Router regression testing

`scripts/run_router_regression.js` and `scripts/audit_question_bank.js` check
router decisions against `tests/router/question-bank.jsonl`
(`router-templates.json` defines expectations per `template_id`,
`question-bank-overrides.json` handles per-id exceptions). Out-of-scope or
contextless questions should route to `clarify` with an explicit reason
(`unsupported`, `needs_context`, `too_broad`). See `tests/router/README.md`.
Add router logic only after a real recurring question family appears.

## Online mode (Cloudflare Worker)

`worker/` holds the Cloudflare Worker for `online` mode (endpoints `/session`,
`/analysis`) deployed via `worker/wrangler.toml`. It proxies through Cloudflare
AI Gateway with a configurable provider fallback chain. The only remote runtime
component allowed is this Worker; there is no classic application backend. The
front points to it via `api_base_url` in `public/data/model-catalog.json`. No
user API key is required for the default `online` service. See `worker/README.md`
for the required env vars.
