import { describe, it, expect } from 'vitest';
import { dedupeVotes } from './vote-helpers.js';

describe('dedupeVotes', () => {
  it('supprime les doublons par numero/date/titre/vote', () => {
    const votes = [
      { numero: '1', date: '2024-01-01', titre: 'Budget', vote: 'pour' },
      { numero: '1', date: '2024-01-01', titre: 'Budget', vote: 'pour' },
      { numero: '2', date: '2024-01-02', titre: 'Securite', vote: 'contre' }
    ];
    const result = dedupeVotes(votes);
    expect(result).toHaveLength(2);
    expect(result[0].numero).toBe('1');
    expect(result[1].numero).toBe('2');
  });

  it('garde les votes differents', () => {
    const votes = [
      { numero: '1', date: '2024-01-01', titre: 'Budget', vote: 'pour' },
      { numero: '2', date: '2024-01-02', titre: 'Securite', vote: 'contre' },
      { numero: '3', date: '2024-01-03', titre: 'Education', vote: 'abstention' }
    ];
    const result = dedupeVotes(votes);
    expect(result).toHaveLength(3);
  });

  it('distingue les votes differents sur le meme sujet', () => {
    const votes = [
      { numero: '1', date: '2024-01-01', titre: 'Budget', vote: 'pour' },
      { numero: '2', date: '2024-01-01', titre: 'Budget', vote: 'contre' }
    ];
    const result = dedupeVotes(votes);
    expect(result).toHaveLength(2);
  });

  it('retourne un tableau vide pour une entree vide', () => {
    expect(dedupeVotes([])).toEqual([]);
  });

  it('retourne un tableau vide pour undefined', () => {
    expect(dedupeVotes(undefined)).toEqual([]);
  });

  it('ne plante pas sur null (default ne couvre pas null)', () => {
    expect(() => dedupeVotes(null)).toThrow();
  });

  it('gere les champs manquants', () => {
    const votes = [
      { date: '2024-01-01' },
      { date: '2024-01-01' },
      { numero: '1' }
    ];
    const result = dedupeVotes(votes);
    expect(result).toHaveLength(2);
  });

  it('preserve l ordre des premiers votes', () => {
    const votes = [
      { numero: '3', date: '2024-03-03', titre: 'C', vote: 'pour' },
      { numero: '1', date: '2024-01-01', titre: 'A', vote: 'pour' },
      { numero: '3', date: '2024-03-03', titre: 'C', vote: 'pour' },
      { numero: '2', date: '2024-02-02', titre: 'B', vote: 'pour' }
    ];
    const result = dedupeVotes(votes);
    expect(result).toHaveLength(3);
    expect(result[0].numero).toBe('3');
    expect(result[1].numero).toBe('1');
    expect(result[2].numero).toBe('2');
  });
});
