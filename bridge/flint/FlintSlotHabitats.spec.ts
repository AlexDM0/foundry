/**
 * The habitats of the Flint slots. What matters: every answer is an intent of Flint's fixed list, so Flint refuses none; each screen
 * answers every cue it sends, with the same intent on every screen; every cue a screen lists can reach Flint, since a cue goes only on a
 * change: a screen lists none or at least two, or its one cue is lasting and kept up; Flint waves on arriving in a slot, and thinks in the
 * Constitution step's; each screen's kind is its own; only a lasting cue, whose answer is a loop, is kept up in the slot; and every slot
 * keeps Flint inside, since content stands around it.
 */
import { describe, expect, test } from 'bun:test';

import { ARRIVED_CUE, isSpriteIntent, type SpriteHabitat } from '../../flint/SpriteHabitat.ts';
import { FLINT_SLOT_CUES, LASTING_FLINT_SLOT_CUES }        from './FlintSlotCues.ts';
import { FLINT_SLOT_HABITATS, lastingIntentOf }            from './FlintSlotHabitats.ts';

const HABITATS = Object.values(FLINT_SLOT_HABITATS);

function answerOf(cue: string): readonly string[] {
  return HABITATS.flatMap((habitat) => habitat.suggestions.filter((suggestion) => suggestion.when === cue).map((suggestion) => suggestion.respond));
}

describe('the habitats of the Flint slots', () => {
  test('every answer is an intent of Flint\'s fixed list', () => {
    const answers = HABITATS.flatMap((habitat) => habitat.suggestions.map((suggestion) => suggestion.respond));
    expect(answers.length).toBeGreaterThan(HABITATS.length);
    expect(answers.filter((intent) => !isSpriteIntent(intent))).toEqual([]);
  });

  test('a cue has the same answer on every screen that sends it', () => {
    expect(Object.values(FLINT_SLOT_CUES).map((cue) => [cue, [...new Set(answerOf(cue))]])).toEqual([
      ['agent-reads', ['research']],
      ['agent-writes', ['type']],
      ['agent-reviews', ['review']],
      ['agent-thinks', ['thinking']],
      ['agent-waits-on-user', ['ask']],
      ['agent-is-done', ['happy']],
      ['agent-is-idle', ['wander']],
    ]);
  });

  test('each screen answers the cues of its own data', () => {
    expect(Object.entries(FLINT_SLOT_HABITATS).map(([screen, habitat]) => [
      screen, habitat.suggestions.map((suggestion) => suggestion.when).filter((cue) => cue !== ARRIVED_CUE),
    ])).toEqual([
      ['setup', []],
      ['research', ['agent-reads', 'agent-waits-on-user', 'agent-is-idle']],
      ['constitution', ['agent-waits-on-user', 'agent-is-idle']],
      ['pipelineDesign', ['agent-thinks', 'agent-waits-on-user', 'agent-is-done', 'agent-is-idle']],
      ['kanban', ['agent-writes', 'agent-reviews', 'agent-is-idle']],
      ['ticketDetail', ['agent-writes', 'agent-reviews', 'agent-is-idle']],
      ['agents', ['agent-writes', 'agent-reviews', 'agent-is-idle']],
      ['assistant', ['agent-waits-on-user', 'agent-is-idle']],
      ['questions', ['agent-waits-on-user']],
      ['intake', ['agent-writes']],
    ]);
  });

  test('every cue a screen lists can reach Flint: a screen lists none or at least two, or its one cue is lasting', () => {
    const listedCuesOf = (habitat: SpriteHabitat) => habitat.suggestions.map((suggestion) => suggestion.when).filter((cue) => cue !== ARRIVED_CUE);
    const unreachable = Object.entries(FLINT_SLOT_HABITATS).filter(([, habitat]) => {
      const listedCues = listedCuesOf(habitat);
      return listedCues.length === 1 && !listedCues.some((cue) => (LASTING_FLINT_SLOT_CUES as ReadonlySet<string>).has(cue));
    });
    expect(HABITATS.filter((habitat) => listedCuesOf(habitat).length === 1).length).toBeGreaterThan(0);
    expect(unreachable).toEqual([]);
  });

  test('Flint waves on arriving in a slot, and thinks on arriving in the Constitution step\'s', () => {
    const arrivals = Object.entries(FLINT_SLOT_HABITATS).map(([screen, habitat]) => [screen, habitat.suggestions[0]]);
    expect(arrivals.filter(([, suggestion]) => typeof suggestion === 'object' && suggestion.when !== ARRIVED_CUE)).toEqual([]);
    expect(arrivals.filter(([, suggestion]) => typeof suggestion === 'object' && suggestion.respond !== 'wave'))
      .toEqual([['constitution', { when: ARRIVED_CUE, respond: 'thinking' }]]);
  });

  test('each screen\'s kind is its own', () => {
    const kinds = HABITATS.map((habitat) => habitat.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  test('every slot keeps Flint inside, so Flint never shows over the content around it', () => {
    expect(HABITATS.length).toBeGreaterThan(0);
    expect(HABITATS.filter((habitat) => habitat.keepsFlintInside !== true).map((habitat) => habitat.kind)).toEqual([]);
  });
});

describe('lastingIntentOf', () => {
  test('a lasting cue is kept up with the slot\'s answer to it', () => {
    expect([...LASTING_FLINT_SLOT_CUES].map((cue) => lastingIntentOf(FLINT_SLOT_HABITATS.agents, cue)))
      .toEqual([null, 'type', 'review', null]);
    expect(lastingIntentOf(FLINT_SLOT_HABITATS.research, FLINT_SLOT_CUES.AGENT_READS)).toBe('research');
    expect(lastingIntentOf(FLINT_SLOT_HABITATS.questions, FLINT_SLOT_CUES.AGENT_WAITS_ON_USER)).toBe('ask');
  });

  test('a moment is answered once and never kept up', () => {
    expect([FLINT_SLOT_CUES.AGENT_THINKS, FLINT_SLOT_CUES.AGENT_IS_DONE].map((cue) => lastingIntentOf(FLINT_SLOT_HABITATS.pipelineDesign, cue)))
      .toEqual([null, null]);
    expect(lastingIntentOf(FLINT_SLOT_HABITATS.agents, FLINT_SLOT_CUES.AGENT_IS_IDLE)).toBeNull();
  });
});
