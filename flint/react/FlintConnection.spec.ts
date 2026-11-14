/**
 * The connection between `<Flint>` and its habitats, on a recording fake of the handle. What matters: a habitat registered before Flint
 * exists reaches it once it attaches; a removed habitat leaves Flint; a detach removes every habitat from the old Flint and keeps them
 * for the next; a cue reaches only an attached Flint.
 */
import { expect, test } from 'bun:test';

import type { FlintHandle }      from '../CreateFlint.ts';
import type { SpriteHabitat }    from '../SpriteHabitat.ts';
import { createFlintConnection } from './FlintConnection.ts';

const CHAT_HABITAT: SpriteHabitat = { kind: 'chat', description: 'The conversation with the agent.', suggestions: [] };

function recordingHandle(): { readonly handle: FlintHandle; readonly events: string[] } {
  const events: string[] = [];
  const handle: FlintHandle = {
    contractVersion: 1,
    registerHabitat: (element, habitat) => {
      events.push(`register ${element.id} ${habitat.kind}`);
      return () => events.push(`remove ${element.id}`);
    },
    cue:        (element, cueName) => events.push(`cue ${element.id} ${cueName}`),
    perform:    () => 'performed',
    steer:      () => 'steered',
    startBrain: () => undefined,
    stopBrain:  () => undefined,
    destroy:    () => undefined,
  };
  return { handle, events };
}

const CHAT_ELEMENT = { id: 'chat' } as HTMLElement;

test('a habitat registered before Flint exists reaches it once it attaches', () => {
  const connection = createFlintConnection();
  connection.registerHabitat(CHAT_ELEMENT, CHAT_HABITAT);
  const { handle, events } = recordingHandle();
  connection.attach(handle);
  expect(events).toEqual(['register chat chat']);
});

test('a removed habitat leaves Flint, and a detach removes the rest but keeps them for the next Flint', () => {
  const connection = createFlintConnection();
  const first = recordingHandle();
  connection.attach(first.handle);
  const remove = connection.registerHabitat(CHAT_ELEMENT, CHAT_HABITAT);
  connection.registerHabitat({ id: 'agents' } as HTMLElement, { ...CHAT_HABITAT, kind: 'agent-panel' });
  remove();
  connection.detach();
  expect(first.events).toEqual(['register chat chat', 'register agents agent-panel', 'remove chat', 'remove agents']);
  const second = recordingHandle();
  connection.attach(second.handle);
  expect(second.events).toEqual(['register agents agent-panel']);
});

test('a cue reaches only an attached Flint', () => {
  const connection = createFlintConnection();
  connection.cue(CHAT_ELEMENT, 'arrived');
  const { handle, events } = recordingHandle();
  connection.attach(handle);
  connection.cue(CHAT_ELEMENT, 'agent-is-writing');
  expect(events).toEqual(['cue chat agent-is-writing']);
});
