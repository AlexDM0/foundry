/**
 * `useFlintPerform` below a recording connection. What matters: a component's perform reaches the connection with its intent and its own
 * element, and gives back what the connection answered; the function stays the same across renders; without a `<Flint>` above it answers
 * `no-flint` and reaches nothing.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode }          from 'react';
import { useEffect, useRef }       from 'react';

import type { ConnectedPerformVerdict, FlintConnection } from './FlintConnection.ts';
import { FlintContext }                                  from './FlintContext.ts';
import { useFlintPerform }                               from './UseFlintPerform.ts';

afterEach(cleanup);

function recordingConnection(): { readonly connection: FlintConnection; readonly events: string[] } {
  const events: string[] = [];
  const connection: FlintConnection = {
    registerHabitat: () => () => undefined,
    cue:             () => undefined,
    perform:         (intent, toward) => {
      events.push(`perform ${intent} ${toward instanceof HTMLElement ? toward.id : 'nothing'}`);
      return 'already-running';
    },
    attach: () => undefined,
    detach: () => undefined,
  };
  return { connection, events };
}

type Perform = (intent: string, toward?: Element) => ConnectedPerformVerdict;

/** A timeline row that starts a lay along its own bar once it is mounted, and hands its perform to the spec. */
function TimelineRow(properties: { readonly onPerform: (perform: Perform) => void; readonly onVerdict: (verdict: ConnectedPerformVerdict) => void }): ReactNode {
  const bar = useRef<HTMLDivElement>(null);
  const perform = useFlintPerform();
  const { onPerform, onVerdict } = properties;
  useEffect(() => {
    onPerform(perform);
    if (bar.current !== null) onVerdict(perform('lay-bar-along', bar.current));
  }, [perform, onPerform, onVerdict]);
  return <div ref={bar} id="bar" />;
}

test('a perform reaches the connection with its own element, gives back its answer, and stays the same function across renders', () => {
  const { connection, events } = recordingConnection();
  const performs: Perform[] = [];
  const verdicts: ConnectedPerformVerdict[] = [];
  const onPerform = (perform: Perform): void => {
    performs.push(perform);
  };
  const onVerdict = (verdict: ConnectedPerformVerdict): void => {
    verdicts.push(verdict);
  };
  const tree = (): ReactNode => <FlintContext.Provider value={connection}><TimelineRow onPerform={onPerform} onVerdict={onVerdict} /></FlintContext.Provider>;
  const { rerender } = render(tree());
  rerender(tree());
  expect([events, verdicts]).toEqual([['perform lay-bar-along bar'], ['already-running']]);
  expect(new Set(performs).size).toBe(1);
});

test('without a Flint above, a perform answers no-flint', () => {
  const verdicts: ConnectedPerformVerdict[] = [];
  render(<TimelineRow onPerform={() => undefined} onVerdict={(verdict) => verdicts.push(verdict)} />);
  expect(verdicts).toEqual(['no-flint']);
});
