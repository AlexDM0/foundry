/**
 * The transcript client against a fake `EventSource`. What matters: the stream asks after the cursor it was given, `history` and
 * `message` both reach the handler, an entry of another shape is dropped (one with no `entryKey` among them), and the last cursor received
 * is kept for a reopened panel; a stream the browser gave up on reopens after that cursor, and an entry replayed across the reopen is
 * delivered once. Entries of one log line share a cursor and differ in `entryKey`, so all of them arrive while following, every field intact,
 * a chat's pictures among them.
 */
import {
  afterEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import type { EventStreamSource }                               from './EventStreamClient.ts';
import { TranscriptStreamClient, type TranscriptEntryDocument } from './TranscriptStreamClient.ts';

afterEach(() => {
  jest.useRealTimers();
});

function entryOf(cursor: string, part: number, role: string, text: string): TranscriptEntryDocument {
  return {
    cursor, entryKey: `${cursor}.${part}`, role, text, at: '2026-11-10T09:30:00.000Z'
  };
}

/** A fake `EventSource` the case fires events on by type. */
function fakeSource(): { eventSourceOf: (url: string) => EventStreamSource; fire: (type: string, data: unknown) => void } {
  const listeners = new Map<string, (event: Event) => void>();
  return {
    eventSourceOf: () => ({
      readyState:       1,
      close:            () => undefined,
      addEventListener: ((type: string, listener: (event: Event) => void) => {
        listeners.set(type, listener);
      }) as EventStreamSource['addEventListener'],
    }),
    fire: (type, data) => listeners.get(type)?.(Object.assign(new Event(type), { data: JSON.stringify(data) })),
  };
}

describe('the transcript client', () => {
  test('follows history then messages after the cursor, keeping the last cursor and dropping malformed entries', () => {
    const listeners = new Map<string, (event: Event) => void>();
    let openedUrl = '';
    const eventSourceOf = (url: string): EventStreamSource => {
      openedUrl = url;
      return {
        readyState:       1,
        close:            () => undefined,
        addEventListener: ((type: string, listener: (event: Event) => void) => {
          listeners.set(type, listener);
        }) as EventStreamSource['addEventListener'],
      };
    };
    const received: string[] = [];
    const stream = TranscriptStreamClient.follow('J12', { onEntries: (entries) => received.push(...entries.map((entry) => entry.cursor)) }, { after: '1.4', eventSourceOf });
    const fire = (type: string, data: unknown) => listeners.get(type)?.(Object.assign(new Event(type), { data: JSON.stringify(data) }));
    fire('history', [entryOf('1.5', 0, 'assistant', 'Reading the ticket.'), { cursor: 'broken' }]);
    fire('message', entryOf('2.1', 0, 'tool-call', 'Bash'));
    expect(openedUrl).toBe('/api/jobs/J12/stream?after=1.4');
    expect(received).toEqual(['1.5', '2.1']);
    expect(stream.lastCursor()).toBe('2.1');
  });

  test('a stream the browser gave up on reopens after the last cursor received, and a replayed entry is not delivered twice', () => {
    jest.useFakeTimers();
    const opened: { url: string; listeners: Map<string, (event: Event) => void>; readyState: number }[] = [];
    const eventSourceOf = (url: string): EventStreamSource => {
      const source = { url, listeners: new Map<string, (event: Event) => void>(), readyState: 1 };
      opened.push(source);
      return {
        get readyState() {
          return source.readyState;
        },
        close:            () => undefined,
        addEventListener: ((type: string, listener: (event: Event) => void) => {
          source.listeners.set(type, listener);
        }) as EventStreamSource['addEventListener'],
      };
    };
    const received: string[] = [];
    const onEntries = (entries: readonly { cursor: string }[]) => received.push(...entries.map((entry) => entry.cursor));
    const stream = TranscriptStreamClient.follow('J12', { onEntries }, { eventSourceOf, reopenDelayMilliseconds: 0 });
    const fire = (index: number, type: string, data?: unknown) => opened[index]?.listeners.get(type)?.(Object.assign(new Event(type), { data: JSON.stringify(data) }));
    fire(0, 'history', [entryOf('1.1', 0, 'assistant', 'Reading.')]);
    const [first] = opened;
    if (first !== undefined) first.readyState = 2;
    fire(0, 'error');
    jest.advanceTimersByTime(1);
    fire(1, 'history', [entryOf('1.1', 0, 'assistant', 'Reading.'), entryOf('1.2', 0, 'tool-call', 'Read')]);
    stream.close();
    expect(opened.map(({ url }) => url)).toEqual(['/api/jobs/J12/stream', '/api/jobs/J12/stream?after=1.1']);
    expect(received).toEqual(['1.1', '1.2']);
  });

  test('entries of one log line share a cursor and all arrive while following, each delivered once by its entry key', () => {
    const { eventSourceOf, fire } = fakeSource();
    const received: string[] = [];
    TranscriptStreamClient.follow('J12', { onEntries: (entries) => received.push(...entries.map((entry) => entry.entryKey)) }, { eventSourceOf });
    fire('message', entryOf('4.17', 0, 'assistant', 'Two calls.'));
    fire('message', entryOf('4.17', 1, 'tool-call', 'Read'));
    fire('message', entryOf('4.17', 2, 'tool-call', 'Grep'));
    fire('message', entryOf('4.17', 1, 'tool-call', 'Read'));
    expect(received).toEqual(['4.17.0', '4.17.1', '4.17.2']);
  });

  test('an entry with no entry key is dropped', () => {
    const { eventSourceOf, fire } = fakeSource();
    const received: string[] = [];
    TranscriptStreamClient.follow('J12', { onEntries: (entries) => received.push(...entries.map((entry) => entry.cursor)) }, { eventSourceOf });
    fire('history', [{
      cursor: '1.1', role: 'assistant', text: 'Reading.', at: null
    }, entryOf('1.2', 0, 'assistant', 'Done.')]);
    expect(received).toEqual(['1.2']);
  });

  test('a client entry reaches the handler with its stamp, act, sender, chat number and incidents', () => {
    const { eventSourceOf, fire } = fakeSource();
    const received: TranscriptEntryDocument[] = [];
    TranscriptStreamClient.follow('J1', { onEntries: (entries) => received.push(...entries) }, { eventSourceOf });
    const delivery: TranscriptEntryDocument = {
      ...entryOf('1.9', 0, 'overseer', 'Incident I3 is open.'), clientAct: 'chat', sentBy: 'overseer', chatSequence: 4, incidentIds: ['I3']
    };
    const toolCall: TranscriptEntryDocument = { ...entryOf('1.10', 0, 'tool-call', 'Read'), toolName: 'Read', toolUseId: 'toolu_example' };
    fire('history', [delivery, toolCall]);
    expect(received).toEqual([delivery, toolCall]);
  });

  test('a chat with pictures reaches the handler with each picture\'s id, name, type and size', () => {
    const { eventSourceOf, fire } = fakeSource();
    const received: TranscriptEntryDocument[] = [];
    TranscriptStreamClient.follow('J7', { onEntries: (entries) => received.push(...entries) }, { eventSourceOf });
    const withPicture: TranscriptEntryDocument = {
      ...entryOf('1.3', 0, 'user', 'Make the header like this.'),
      clientAct: 'chat',
      sentBy:    'user',
      pictures:  [{
        pictureId: 'a'.repeat(64), name: 'header-mockup.png', mediaType: 'image/png', bytes: 41_200
      }],
    };
    fire('message', withPicture);
    expect(received).toEqual([withPicture]);
  });
});
