/**
 * `useFlintHabitat` over a recording connection. What matters: the element registers once it is mounted and leaves on unmount; the cue
 * sender reaches the connection with that element and stays the same function across renders, so a host effect may depend on it; without
 * a `<Flint>` above, the hook registers nothing and its cue sender does nothing.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode }          from 'react';
import { useRef }                  from 'react';

import type { SpriteCue, SpriteHabitat } from '../SpriteHabitat.ts';
import type { FlintConnection }          from './FlintConnection.ts';
import { FlintContext }                  from './FlintContext.ts';
import { useFlintHabitat }               from './UseFlintHabitat.ts';

const CHAT_HABITAT: SpriteHabitat = { kind: 'chat', description: 'The conversation with the agent.', suggestions: [] };

afterEach(cleanup);

function recordingConnection(): { readonly connection: FlintConnection; readonly events: string[] } {
  const events: string[] = [];
  const connection: FlintConnection = {
    registerHabitat: (element, habitat) => {
      events.push(`register ${element.id} ${habitat.kind}`);
      return () => events.push(`remove ${element.id}`);
    },
    cue:    (element, cueName) => events.push(`cue ${element.id} ${cueName}`),
    attach: () => undefined,
    detach: () => undefined,
  };
  return { connection, events };
}

function Chat(properties: { readonly onCueSender: (sendCue: (cueName: SpriteCue) => void) => void; readonly label: string }): ReactNode {
  const element = useRef<HTMLElement>(null);
  properties.onCueSender(useFlintHabitat(element, CHAT_HABITAT));
  return <section ref={element} id="chat">{properties.label}</section>;
}

test('the element registers once mounted, its cues reach the connection, and it leaves on unmount', () => {
  const { connection, events } = recordingConnection();
  const senders: ((cueName: SpriteCue) => void)[] = [];
  const page = render(
    <FlintContext.Provider value={connection}>
      <Chat label="chat" onCueSender={(sendCue) => senders.push(sendCue)} />
    </FlintContext.Provider>,
  );
  senders.at(-1)?.('agent-is-writing');
  page.unmount();
  expect(events).toEqual(['register chat chat', 'cue chat agent-is-writing', 'remove chat']);
});

test('the cue sender stays the same function across renders', () => {
  const { connection } = recordingConnection();
  const senders: ((cueName: SpriteCue) => void)[] = [];
  const page = render(
    <FlintContext.Provider value={connection}>
      <Chat label="first" onCueSender={(sendCue) => senders.push(sendCue)} />
    </FlintContext.Provider>,
  );
  page.rerender(
    <FlintContext.Provider value={connection}>
      <Chat label="second" onCueSender={(sendCue) => senders.push(sendCue)} />
    </FlintContext.Provider>,
  );
  expect(senders.length).toBe(2);
  expect(senders[0]).toBe(senders[1] as (cueName: SpriteCue) => void);
});

test('without a Flint above, nothing registers and a cue does nothing', () => {
  const senders: ((cueName: SpriteCue) => void)[] = [];
  const page = render(<Chat label="chat" onCueSender={(sendCue) => senders.push(sendCue)} />);
  expect(() => senders.at(-1)?.('agent-is-writing')).not.toThrow();
  expect(page.container.querySelector('[data-sprite-habitat]')).toBeNull();
});
