import { createOnlineRuntime } from '../js/ai/online-runtime.js';

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

function createMockStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
}

function createMockFetch(status = 500, body = { error: 'down' }) {
  let callCount = 0;
  const fetch = async () => {
    callCount++;
    return { ok: false, status, json: async () => body };
  };
  return { fetch, getCallCount: () => callCount };
}

let fakeTime = 0;

console.log('=== Test Circuit Breaker ===\n');

// Test 1 : circuit opens after N consecutive failures
{
  console.log('1. Circuit opens after failureThreshold consecutive failures');
  const { fetch, getCallCount } = createMockFetch(502);
  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: createMockStorage(), now: () => fakeTime }
  );

  for (let i = 0; i < 3; i++) {
    try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  }

  assert(getCallCount() === 3, `3 fetches made after 3 failures (got ${getCallCount()})`);
  assert(runtime.getCircuitStatus().status === 'open', 'Circuit is open after threshold');

  // 4th call should be blocked without fetch
  try {
    await runtime.invoke([{ role: 'user', content: 'test' }]);
    assert(false, 'Should have thrown CIRCUIT_OPEN');
  } catch (e) {
    assert(e.code === 'CIRCUIT_OPEN', `4th call throws CIRCUIT_OPEN (got ${e.code})`);
    assert(e.retryAfterMs > 0, `retryAfterMs > 0 (got ${e.retryAfterMs})`);
    assert(getCallCount() === 3, 'No fetch made while circuit is open');
  }
}

// Test 2 : circuit transitions to half_open after resetTimeout
{
  console.log('\n2. Circuit transitions to half_open after resetTimeout');
  const { fetch, getCallCount } = createMockFetch(502);
  fakeTime = 0;
  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: createMockStorage(), now: () => fakeTime }
  );

  // Trip the circuit
  for (let i = 0; i < 3; i++) {
    try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  }
  assert(runtime.getCircuitStatus().status === 'open', 'Circuit open after 3 failures');

  // Advance time past resetTimeout (30s)
  fakeTime = 31000;

  // Next call should go through (half_open)
  try {
    await runtime.invoke([{ role: 'user', content: 'test' }]);
  } catch {}

  assert(getCallCount() === 4, `Fetch attempted in half_open state (got ${getCallCount()})`);
}

// Test 3 : circuit closes on success in half_open
{
  console.log('\n3. Circuit closes on success in half_open state');
  let shouldFail = true;
  fakeTime = 0;
  const fetch = async () => {
    if (shouldFail) {
      return { ok: false, status: 502, json: async () => ({ error: 'down' }) };
    }
    return {
      ok: true,
      json: async () => ({ answer: 'ok', session_token: 'tok', expires_at: new Date(fakeTime + 60000).toISOString() })
    };
  };

  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: createMockStorage(), now: () => fakeTime }
  );

  // Trip the circuit
  for (let i = 0; i < 3; i++) {
    try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  }
  assert(runtime.getCircuitStatus().status === 'open', 'Circuit open');

  // Advance past timeout, allow success
  fakeTime = 31000;
  shouldFail = false;

  const result = await runtime.invoke([{ role: 'user', content: 'test' }]);
  assert(result.choices[0].message.content === 'ok', 'Invoke returned success');
  assert(runtime.getCircuitStatus().status === 'closed', 'Circuit closed after success');
}

// Test 4 : half_open failure re-opens circuit immediately
{
  console.log('\n4. Half_open failure re-opens circuit immediately');
  fakeTime = 0;
  const { fetch, getCallCount } = createMockFetch(502);
  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: createMockStorage(), now: () => fakeTime }
  );

  // Trip the circuit
  for (let i = 0; i < 3; i++) {
    try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  }

  // Advance past timeout
  fakeTime = 31000;
  const countBefore = getCallCount();

  // Half_open attempt fails
  try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  assert(getCallCount() === countBefore + 1, 'One fetch in half_open');

  assert(runtime.getCircuitStatus().status === 'open', 'Circuit re-opened after half_open failure');

  // Immediate retry should be blocked
  try {
    await runtime.invoke([{ role: 'user', content: 'test' }]);
    assert(false, 'Should throw');
  } catch (e) {
    assert(e.code === 'CIRCUIT_OPEN', 'Blocked again after half_open failure');
    assert(getCallCount() === countBefore + 1, 'No additional fetch');
  }
}

// Test 5 : resetCircuit() closes the circuit
{
  console.log('\n5. resetCircuit() closes the circuit');
  const { fetch, getCallCount } = createMockFetch(502);
  fakeTime = 0;
  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: createMockStorage(), now: () => fakeTime }
  );

  for (let i = 0; i < 3; i++) {
    try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  }
  assert(runtime.getCircuitStatus().status === 'open', 'Circuit open');

  runtime.resetCircuit();
  assert(runtime.getCircuitStatus().status === 'closed', 'Circuit closed after reset');

  // Should allow calls again
  const countBefore = getCallCount();
  try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  assert(getCallCount() === countBefore + 1, 'Fetch made after reset');
}

// Test 6 : success resets failure counter (no false trip)
{
  console.log('\n6. Intermittent failures do not trip circuit');
  let failNext = false;
  fakeTime = 0;
  const storage = createMockStorage();
  const fetch = async () => {
    if (failNext) {
      failNext = false;
      return { ok: false, status: 502, json: async () => ({ error: 'blip' }) };
    }
    return {
      ok: true,
      json: async () => ({ answer: 'ok', session_token: 'tok', expires_at: new Date(fakeTime + 60000).toISOString() })
    };
  };

  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: storage, now: () => fakeTime }
  );

  // fail, fail, success, fail, fail
  failNext = true;
  try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  failNext = true;
  try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}

  assert(runtime.getCircuitStatus().status === 'closed', 'Still closed after 2 failures');

  // success resets counter
  await runtime.invoke([{ role: 'user', content: 'test' }]);

  failNext = true;
  try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  failNext = true;
  try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}

  assert(runtime.getCircuitStatus().status === 'closed', 'Still closed after success + 2 failures');
}

// Test 7 : CIRCUIT_OPEN passthrough from requestSessionToken in invoke
{
  console.log('\n7. CIRCUIT_OPEN from session passthrough does not double-count');
  fakeTime = 0;
  const { fetch, getCallCount } = createMockFetch(502);
  const runtime = createOnlineRuntime(
    { apiBaseUrl: 'https://example.com' },
    { fetchImpl: fetch, storageApi: createMockStorage(), now: () => fakeTime }
  );

  // Trip the circuit
  for (let i = 0; i < 3; i++) {
    try { await runtime.invoke([{ role: 'user', content: 'test' }]); } catch {}
  }
  assert(runtime.getCircuitStatus().status === 'open', 'Circuit open');

  // Verify retryAfterMs decreases as time passes
  fakeTime = 15000;
  try {
    await runtime.invoke([{ role: 'user', content: 'test' }]);
  } catch (e) {
    assert(e.code === 'CIRCUIT_OPEN', 'Still blocked at 15s');
    assert(e.retryAfterMs <= 15000, `retryAfterMs reflects elapsed time (${e.retryAfterMs}ms)`);
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
