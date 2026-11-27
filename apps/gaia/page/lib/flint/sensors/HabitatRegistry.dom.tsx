/**
 * The registry of habitats on a happy-dom page: the kind a habitat element carries, which habitat a cue belongs to, the order of the last
 * worked in and last changed habitats, and the drop target mark.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { SpriteHabitat }    from '../SpriteHabitat.ts';
import type { HabitatRegistry }  from './HabitatRegistry.ts';
import { createHabitatRegistry } from './HabitatRegistry.ts';

const CHAT_HABITAT: SpriteHabitat = { kind: 'chat', description: 'The chat.', suggestions: [] };
const AGENTS_HABITAT: SpriteHabitat = { kind: 'agent-panel', description: 'The agents.', suggestions: [] };

const registries: HabitatRegistry[] = [];

afterEach(() => {
  for (const registry of registries.splice(0)) registry.destroy();
  document.body.replaceChildren();
});

interface PageWithHabitats {
  readonly registry:     HabitatRegistry;
  readonly chat:         HTMLElement;
  readonly agents:       HTMLElement;
  readonly removeAgents: () => void;
}

function pageWithHabitats(tracksContentChanges = false): PageWithHabitats {
  const home = document.createElement('div');
  const chat = document.createElement('section');
  const agents = document.createElement('section');
  chat.appendChild(document.createElement('textarea'));
  document.body.append(home, chat, agents);
  const registry = createHabitatRegistry({ document, home, tracksContentChanges });
  registries.push(registry);
  registry.register(chat, CHAT_HABITAT);
  const removeAgents = registry.register(agents, AGENTS_HABITAT);
  return {
    registry, chat, agents, removeAgents,
  };
}

function recordOf(registry: HabitatRegistry, kind: string): ReturnType<HabitatRegistry['records']>[number] | undefined {
  return registry.records().find((record) => record.habitat.kind === kind);
}

describe('marks', () => {
  test('a habitat element carries its kind, and loses it on removal', () => {
    const { chat, agents, removeAgents } = pageWithHabitats();
    expect([chat.getAttribute('data-sprite-habitat'), agents.getAttribute('data-sprite-habitat')]).toEqual(['chat', 'agent-panel']);
    removeAgents();
    expect(agents.hasAttribute('data-sprite-habitat')).toBe(false);
  });

  test('the drop target mark moves from habitat to habitat, and leaves with a removed habitat', () => {
    const {
      registry, chat, agents, removeAgents
    } = pageWithHabitats();
    registry.markDropTarget(recordOf(registry, 'chat')?.id ?? null);
    registry.markDropTarget(recordOf(registry, 'agent-panel')?.id ?? null);
    expect([chat.hasAttribute('data-sprite-drop-target'), agents.hasAttribute('data-sprite-drop-target')]).toEqual([false, true]);
    removeAgents();
    expect(agents.hasAttribute('data-sprite-drop-target')).toBe(false);
  });
});

describe('cues', () => {
  test('a cue on an element inside a habitat is that habitat\'s; a cue elsewhere is dropped', () => {
    const { registry, chat } = pageWithHabitats();
    const inside = chat.querySelector('textarea');
    if (inside === null) throw new Error('no textarea');
    expect(registry.cue(inside, 'user-types')).toBe(true);
    expect(registry.cue(document.body, 'nothing')).toBe(false);
    expect(registry.drainCues()).toEqual([{ habitatId: recordOf(registry, 'chat')?.id ?? '', cue: 'user-types' }]);
    expect(registry.drainCues()).toEqual([]);
  });
});

describe('where the user works', () => {
  test('a focus or a press inside a habitat orders it as the last one the user worked in', () => {
    const { registry, chat, agents } = pageWithHabitats();
    chat.querySelector('textarea')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    agents.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const chatOrder = recordOf(registry, 'chat')?.focusedOrClickedOrder ?? 0;
    expect(recordOf(registry, 'agent-panel')?.focusedOrClickedOrder ?? 0).toBeGreaterThan(chatOrder);
  });

  test('with content tracking, a change of a habitat\'s content orders it as the last changed, and a cue counts as a change', async () => {
    const { registry, chat, agents } = pageWithHabitats(true);
    registry.cue(chat, 'agent-is-writing');
    agents.appendChild(document.createElement('p'));
    // The DOM delivers mutation records in a microtask, so the spec waits for that one microtask.
    await Promise.resolve();
    expect(recordOf(registry, 'agent-panel')?.changedOrder ?? 0).toBeGreaterThan(recordOf(registry, 'chat')?.changedOrder ?? 0);
  });

  test('without content tracking, a change of content orders nothing', async () => {
    const { registry, agents } = pageWithHabitats(false);
    agents.appendChild(document.createElement('p'));
    await Promise.resolve();
    expect(recordOf(registry, 'agent-panel')?.changedOrder).toBeNull();
  });
});
