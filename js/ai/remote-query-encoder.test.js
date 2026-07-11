import { describe, it, expect, vi } from 'vitest';
import { createRemoteQueryEncoder } from './remote-query-encoder.js';

function createClientStub(embedding) {
  return {
    embedQuery: vi.fn(async () => embedding)
  };
}

describe('remote-query-encoder', () => {
  it('tronque a la dimension du manifest et re-normalise L2', async () => {
    const raw = Array.from({ length: 2048 }, (_, index) => (index < 4 ? [3, 4, 0, 0][index] : 0.5));
    const encoder = createRemoteQueryEncoder({
      workerRagClient: createClientStub(raw),
      model: { dimension: 4 }
    });

    const vector = await encoder('question de test');

    expect(vector).toHaveLength(4);
    // [3,4,0,0] normalise -> [0.6, 0.8, 0, 0]
    expect(vector[0]).toBeCloseTo(0.6, 10);
    expect(vector[1]).toBeCloseTo(0.8, 10);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it('retourne [] quand le client repond null', async () => {
    const encoder = createRemoteQueryEncoder({
      workerRagClient: createClientStub(null),
      model: { dimension: 512 }
    });

    expect(await encoder('question')).toEqual([]);
  });

  it('retourne [] quand le vecteur amont est plus court que la dimension cible', async () => {
    const encoder = createRemoteQueryEncoder({
      workerRagClient: createClientStub([0.1, 0.2]),
      model: { dimension: 512 }
    });

    expect(await encoder('question')).toEqual([]);
  });

  it('retourne [] sur un vecteur nul (norme zero)', async () => {
    const encoder = createRemoteQueryEncoder({
      workerRagClient: createClientStub(new Array(8).fill(0)),
      model: { dimension: 8 }
    });

    expect(await encoder('question')).toEqual([]);
  });

  it('ne jette jamais, meme si le client explose', async () => {
    const encoder = createRemoteQueryEncoder({
      workerRagClient: {
        embedQuery: async () => {
          throw new Error('reseau coupe');
        }
      },
      model: { dimension: 512 }
    });

    await expect(encoder('question')).resolves.toEqual([]);
  });

  it('retourne null (fabrique) sans client ou sans dimension', () => {
    expect(createRemoteQueryEncoder({ model: { dimension: 512 } })).toBeNull();
    expect(createRemoteQueryEncoder({ workerRagClient: createClientStub([]), model: {} })).toBeNull();
  });
});
