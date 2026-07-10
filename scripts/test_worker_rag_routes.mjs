import worker from '../worker/src/index.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  OK: ${message}`);
    passed++;
  }
}

const ORIGIN = 'http://127.0.0.1:8000';

function createLimiterStub(deniedKeys = new Set()) {
  return {
    idFromName(key) { return key; },
    get(key) {
      return {
        async fetch() {
          return new Response(JSON.stringify({ allowed: !deniedKeys.has(key), remaining: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      };
    }
  };
}

function createEnv(overrides = {}) {
  return {
    SESSION_SECRET: 'secret-de-test',
    AI_GATEWAY_ACCOUNT_ID: 'acc',
    AI_GATEWAY_GATEWAY_ID: 'gw',
    AI_GATEWAY_TOKEN: 'tok',
    ALLOWED_ORIGINS: ORIGIN,
    USAGE_LIMITER: createLimiterStub(),
    ...overrides
  };
}

function postRequest(path, body, token = null) {
  const headers = { Origin: ORIGIN, 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new Request(`https://worker.example${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

async function createSessionToken(env) {
  const response = await worker.fetch(postRequest('/session', {}), env);
  const payload = await response.json();
  return { payload, token: payload.session_token };
}

const realFetch = globalThis.fetch;
let upstreamCalls = [];
let upstreamResponder = null;

function stubUpstream(responder) {
  upstreamCalls = [];
  upstreamResponder = responder;
  globalThis.fetch = async (url, options) => {
    upstreamCalls.push({ url: String(url), options });
    return upstreamResponder(String(url), options);
  };
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

console.log('=== Test routes RAG du Worker (/rerank, /embed-query, capabilities) ===\n');

// Test 1 : capabilities dans /session
{
  console.log('1. /session expose les capabilities selon la presence de la cle');
  const withoutKey = await createSessionToken(createEnv());
  assert(withoutKey.payload.capabilities?.rerank === false, 'rerank=false sans OPENROUTER_API_KEY');
  assert(withoutKey.payload.capabilities?.embed_query === false, 'embed_query=false sans OPENROUTER_API_KEY');

  const withKey = await createSessionToken(createEnv({ OPENROUTER_API_KEY: 'sk-test' }));
  assert(withKey.payload.capabilities?.rerank === true, 'rerank=true avec cle');
  assert(withKey.payload.capabilities?.embed_query === true, 'embed_query=true avec cle');

  const killed = await createSessionToken(createEnv({ OPENROUTER_API_KEY: 'sk-test', RERANK_DISABLED: 'true' }));
  assert(killed.payload.capabilities?.rerank === false, 'kill-switch RERANK_DISABLED respecte');
  assert(killed.payload.capabilities?.embed_query === true, 'embed_query intact malgre RERANK_DISABLED');
}

// Test 2 : /rerank sans session
{
  console.log('\n2. /rerank sans jeton de session');
  const env = createEnv({ OPENROUTER_API_KEY: 'sk-test' });
  const response = await worker.fetch(postRequest('/rerank', { query: 'test', documents: ['a'] }), env);
  const payload = await response.json();
  assert(response.status === 401, `401 attendu (recu ${response.status})`);
  assert(payload.error_code === 'SESSION_REQUIRED', `SESSION_REQUIRED attendu (recu ${payload.error_code})`);
}

// Test 3 : /rerank sans cle configuree
{
  console.log('\n3. /rerank sans cle OpenRouter -> FEATURE_DISABLED');
  const env = createEnv();
  const { token } = await createSessionToken(env);
  const response = await worker.fetch(postRequest('/rerank', { query: 'test', documents: ['a'] }, token), env);
  const payload = await response.json();
  assert(response.status === 503, `503 attendu (recu ${response.status})`);
  assert(payload.error_code === 'FEATURE_DISABLED', `FEATURE_DISABLED attendu (recu ${payload.error_code})`);
  assert(payload.next_action === 'fallback_local', 'next_action=fallback_local');
}

// Test 4 : /rerank chemin nominal + normalisation relevance_score
{
  console.log('\n4. /rerank nominal : normalisation de la reponse upstream');
  const env = createEnv({ OPENROUTER_API_KEY: 'sk-test' });
  const { token } = await createSessionToken(env);

  stubUpstream(() => new Response(JSON.stringify({
    model: 'nvidia/llama-nemotron-rerank-vl-1b-v2:free',
    results: [
      { index: 1, relevance_score: 0.92 },
      { index: 0, relevance_score: 0.31 },
      { index: 99, relevance_score: 0.5 },
      { index: 2, relevance_score: 'oops' }
    ]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  const response = await worker.fetch(
    postRequest('/rerank', { query: 'budget agriculture', documents: ['doc a', 'doc b', 'doc c'], top_n: 3 }, token),
    env
  );
  const payload = await response.json();
  restoreFetch();

  assert(response.status === 200, `200 attendu (recu ${response.status})`);
  assert(upstreamCalls.length === 1, 'un seul appel upstream');
  assert(upstreamCalls[0].url === 'https://openrouter.ai/api/v1/rerank', `URL upstream par defaut (recu ${upstreamCalls[0].url})`);
  const upstreamBody = JSON.parse(upstreamCalls[0].options.body);
  assert(upstreamBody.model === 'nvidia/llama-nemotron-rerank-vl-1b-v2:free', 'modele par defaut transmis');
  assert(upstreamBody.top_n === 3, 'top_n transmis');
  assert(Array.isArray(payload.results) && payload.results.length === 2, `entrees invalides filtrees (recu ${payload.results?.length})`);
  assert(payload.results[0].index === 1 && payload.results[0].score === 0.92, 'relevance_score -> score');
}

// Test 5 : garde-fous corps /rerank (pas d appel upstream)
{
  console.log('\n5. /rerank garde-fous : documents invalides rejetes sans appel upstream');
  const env = createEnv({ OPENROUTER_API_KEY: 'sk-test' });
  const { token } = await createSessionToken(env);

  stubUpstream(() => new Response('{}', { status: 200 }));

  const tooMany = await worker.fetch(
    postRequest('/rerank', { query: 'test', documents: Array.from({ length: 41 }, () => 'doc') }, token),
    env
  );
  assert(tooMany.status >= 400, `>=400 pour 41 documents (recu ${tooMany.status})`);

  const tooLong = await worker.fetch(
    postRequest('/rerank', { query: 'test', documents: ['x'.repeat(501)] }, token),
    env
  );
  assert(tooLong.status >= 400, `>=400 pour document de 501 chars (recu ${tooLong.status})`);

  const emptyQuery = await worker.fetch(
    postRequest('/rerank', { query: '', documents: ['doc'] }, token),
    env
  );
  assert(emptyQuery.status >= 400, `>=400 pour requete vide (recu ${emptyQuery.status})`);

  assert(upstreamCalls.length === 0, 'aucun appel upstream sur rejet');
  restoreFetch();
}

// Test 6 : budget quotidien global partage
{
  console.log('\n6. Budget quotidien global epuise -> REMOTE_QUOTA_EXHAUSTED sans upstream');
  const env = createEnv({
    OPENROUTER_API_KEY: 'sk-test',
    USAGE_LIMITER: createLimiterStub(new Set(['openrouter:global']))
  });
  const { token } = await createSessionToken(env);

  stubUpstream(() => new Response('{}', { status: 200 }));

  const rerankResponse = await worker.fetch(postRequest('/rerank', { query: 'test', documents: ['doc'] }, token), env);
  const rerankPayload = await rerankResponse.json();
  assert(rerankResponse.status === 429, `429 attendu sur /rerank (recu ${rerankResponse.status})`);
  assert(rerankPayload.error_code === 'REMOTE_QUOTA_EXHAUSTED', 'REMOTE_QUOTA_EXHAUSTED sur /rerank');

  const embedResponse = await worker.fetch(postRequest('/embed-query', { input: 'test' }, token), env);
  const embedPayload = await embedResponse.json();
  assert(embedResponse.status === 429, `429 attendu sur /embed-query (recu ${embedResponse.status})`);
  assert(embedPayload.error_code === 'REMOTE_QUOTA_EXHAUSTED', 'budget partage avec /embed-query');

  assert(upstreamCalls.length === 0, 'aucun appel upstream quand le budget est epuise');
  restoreFetch();
}

// Test 7 : 429 upstream mappe en REMOTE_QUOTA_EXHAUSTED
{
  console.log('\n7. 429 upstream -> REMOTE_QUOTA_EXHAUSTED + fallback_local');
  const env = createEnv({ OPENROUTER_API_KEY: 'sk-test' });
  const { token } = await createSessionToken(env);

  stubUpstream(() => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }));

  const response = await worker.fetch(postRequest('/rerank', { query: 'test', documents: ['doc'] }, token), env);
  const payload = await response.json();
  restoreFetch();

  assert(response.status === 429, `429 attendu (recu ${response.status})`);
  assert(payload.error_code === 'REMOTE_QUOTA_EXHAUSTED', 'REMOTE_QUOTA_EXHAUSTED');
  assert(payload.next_action === 'fallback_local', 'next_action=fallback_local');
}

// Test 8 : /embed-query nominal
{
  console.log('\n8. /embed-query nominal : vecteur brut + dimension');
  const env = createEnv({ OPENROUTER_API_KEY: 'sk-test' });
  const { token } = await createSessionToken(env);

  const fakeEmbedding = Array.from({ length: 2048 }, (_, i) => Math.sin(i));
  stubUpstream(() => new Response(JSON.stringify({
    model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
    data: [{ index: 0, embedding: fakeEmbedding }]
  }), { status: 200 }));

  const response = await worker.fetch(postRequest('/embed-query', { input: 'question de test' }, token), env);
  const payload = await response.json();

  assert(response.status === 200, `200 attendu (recu ${response.status})`);
  assert(upstreamCalls[0].url === 'https://openrouter.ai/api/v1/embeddings', 'endpoint /embeddings');
  const upstreamBody = JSON.parse(upstreamCalls[0].options.body);
  assert(Array.isArray(upstreamBody.input) && upstreamBody.input.length === 1, 'input encapsule en tableau');
  assert(payload.dimension === 2048, `dimension brute non tronquee (recu ${payload.dimension})`);
  assert(payload.embedding.length === 2048, 'vecteur complet renvoye');

  const tooLong = await worker.fetch(postRequest('/embed-query', { input: 'x'.repeat(801) }, token), env);
  assert(tooLong.status >= 400, `>=400 pour input de 801 chars (recu ${tooLong.status})`);
  restoreFetch();
}

// Test 9 : reponse upstream sans embedding exploitable
{
  console.log('\n9. /embed-query : reponse upstream vide -> REMOTE_EMPTY_ANSWER');
  const env = createEnv({ OPENROUTER_API_KEY: 'sk-test' });
  const { token } = await createSessionToken(env);

  stubUpstream(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));

  const response = await worker.fetch(postRequest('/embed-query', { input: 'test' }, token), env);
  const payload = await response.json();
  restoreFetch();

  assert(response.status === 502, `502 attendu (recu ${response.status})`);
  assert(payload.error_code === 'REMOTE_EMPTY_ANSWER', 'REMOTE_EMPTY_ANSWER');
}

console.log(`\n=== Resultats : ${passed} reussis, ${failed} echoues ===`);
process.exit(failed > 0 ? 1 : 0);
