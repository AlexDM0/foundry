/**
 * Which habitat the visit-target policy picks. What matters: each built-in strategy picks by its own reading (last focused or clicked,
 * the innermost below the pointer, content changed last); a host function picks among the roomy habitats and anything else it answers
 * visits none; a habitat smaller than the minimum is never a candidate.
 */
import { describe, expect, test } from 'bun:test';

import type { RegisteredHabitat } from '../SpriteHabitat.ts';
import type { VisitCandidate }    from './VisitTargetSelection.ts';
import { visitTargetIdOf }        from './VisitTargetSelection.ts';

function candidateOf(id: string, changes: Partial<VisitCandidate> = {}): VisitCandidate {
  return {
    id,
    registered:            { element: { id } as unknown as HTMLElement, habitat: { kind: id, description: id, suggestions: [] } },
    isRoomy:               true,
    area:                  10000,
    containsPointer:       false,
    focusedOrClickedOrder: null,
    changedOrder:          null,
    ...changes,
  };
}

const CHAT = candidateOf('chat', {
  focusedOrClickedOrder: 3, changedOrder: 1, containsPointer: true, area: 90000
});
const AGENTS = candidateOf('agents', {
  focusedOrClickedOrder: 1, changedOrder: 4, containsPointer: true, area: 20000
});
const SMALL = candidateOf('small', {
  isRoomy: false, focusedOrClickedOrder: 9, changedOrder: 9, containsPointer: true, area: 10
});

describe('the built-in strategies', () => {
  test('last focused or clicked picks the latest focus or click', () => {
    expect(visitTargetIdOf('last-focused-or-clicked', [CHAT, AGENTS, SMALL])).toBe('chat');
  });

  test('under the pointer picks the innermost habitat below it', () => {
    expect(visitTargetIdOf('under-pointer', [CHAT, AGENTS, SMALL])).toBe('agents');
  });

  test('content changed last picks the latest change', () => {
    expect(visitTargetIdOf('content-changed-last', [CHAT, AGENTS, SMALL])).toBe('agents');
  });

  test('with no reading, no habitat is picked', () => {
    expect(visitTargetIdOf('last-focused-or-clicked', [candidateOf('quiet')])).toBeNull();
  });
});

describe('a host function', () => {
  test('picks among the roomy habitats only', () => {
    const offered: RegisteredHabitat[][] = [];
    const picked = visitTargetIdOf((habitats) => {
      offered.push([...habitats]);
      return habitats.at(-1) ?? null;
    }, [CHAT, AGENTS, SMALL]);
    expect([picked, offered[0]?.map((habitat) => habitat.habitat.kind)]).toEqual(['agents', ['chat', 'agents']]);
  });

  test('an answer that is not a roomy habitat visits none', () => {
    expect(visitTargetIdOf(() => SMALL.registered, [CHAT, SMALL])).toBeNull();
    expect(visitTargetIdOf(() => null, [CHAT])).toBeNull();
  });
});
