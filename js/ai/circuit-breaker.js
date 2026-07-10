import { CIRCUIT_BREAKER } from '../core/config.js';

export function createCircuitBreaker(now) {
  const state = {
    status: 'closed',
    consecutiveFailures: 0,
    openedAt: 0,
    halfOpenAttempts: 0
  };

  const threshold = CIRCUIT_BREAKER.failureThreshold;
  const resetTimeout = CIRCUIT_BREAKER.resetTimeoutMs;
  const halfOpenMax = CIRCUIT_BREAKER.halfOpenMaxAttempts;

  function checkBeforeCall() {
    if (state.status === 'open') {
      const elapsed = now() - state.openedAt;
      if (elapsed >= resetTimeout) {
        state.status = 'half_open';
        state.halfOpenAttempts = 0;
        return;
      }
      const error = new Error('Le service IA en ligne est temporairement indisponible.');
      error.code = 'CIRCUIT_OPEN';
      error.retryAfterMs = resetTimeout - elapsed;
      throw error;
    }

    if (state.status === 'half_open') {
      if (state.halfOpenAttempts >= halfOpenMax) {
        const error = new Error('Le service IA en ligne est temporairement indisponible.');
        error.code = 'CIRCUIT_OPEN';
        error.retryAfterMs = resetTimeout;
        throw error;
      }
      state.halfOpenAttempts++;
    }
  }

  function recordSuccess() {
    state.consecutiveFailures = 0;
    state.halfOpenAttempts = 0;
    state.status = 'closed';
  }

  function recordFailure() {
    if (state.status === 'half_open') {
      state.status = 'open';
      state.openedAt = now();
      state.halfOpenAttempts = 0;
      return;
    }

    state.consecutiveFailures++;
    if (state.consecutiveFailures >= threshold) {
      state.status = 'open';
      state.openedAt = now();
    }
  }

  function getStatus() {
    if (state.status === 'open') {
      return {
        status: 'open',
        retryAfterMs: Math.max(0, resetTimeout - (now() - state.openedAt))
      };
    }
    return { status: state.status, retryAfterMs: 0 };
  }

  function reset() {
    state.status = 'closed';
    state.consecutiveFailures = 0;
    state.openedAt = 0;
    state.halfOpenAttempts = 0;
  }

  return { checkBeforeCall, recordSuccess, recordFailure, getStatus, reset };
}
