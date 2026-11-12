/**
 * The profile stream client against a fake `EventSource`. What matters: it opens the run's own stream route, every `line` reaches the handler
 * with its number and text, a line of another shape is dropped, and a stream the browser gave up on reopens after the last line received,
 * so a line replayed across the reopen is delivered once. Closing stops a pending reopen.
 */
import {
  afterEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import type { EventStreamSource }                      from './EventStreamClient.ts';
import { ProfileStreamClient, type ProfileOutputLine } from './ProfileStreamClient.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE }             from './constants/StreamReopening.ts';

afterEach(() => {
  jest.useRealTimers();
});

interface OpenedSource {
  readonly url:       string;
  readonly listeners: Map<string, (event: Event) => void>;
  readyState:         number;
  closed:             boolean;
}

function fakeSources(): { opened: OpenedSource[]; eventSourceOf: (url: string) => EventStreamSource } {
  const opened: OpenedSource[] = [];
  const eventSourceOf = (url: string): EventStreamSource => {
    const source: OpenedSource = {
      url, listeners: new Map(), readyState: 1, closed: false
    };
    opened.push(source);
    return {
      get readyState() {
        return source.readyState;
      },
      close: () => {
        source.closed = true;
      },
      addEventListener: ((type: string, listener: (event: Event) => void) => {
        source.listeners.set(type, listener);
      }) as EventStreamSource['addEventListener'],
    };
  };
  return { opened, eventSourceOf };
}

function fireLine(source: OpenedSource | undefined, lineNumber: string, data: unknown): void {
  source?.listeners.get('line')?.(new MessageEvent('line', { data: JSON.stringify(data), lastEventId: lineNumber }));
}

function giveUp(source: OpenedSource | undefined): void {
  if (source === undefined) return;
  source.readyState = EVENT_SOURCE_CLOSED_READY_STATE;
  source.listeners.get('error')?.(new Event('error'));
}

describe('the profile stream client', () => {
  test('follows the run\'s own stream route and hands on each line with its number, dropping a line of another shape', () => {
    const { opened, eventSourceOf } = fakeSources();
    const received: ProfileOutputLine[] = [];
    const stream = ProfileStreamClient.follow('P3', { onLines: (lines) => received.push(...lines) }, { eventSourceOf });
    fireLine(opened[0], '1', { text: 'Running 12 tests' });
    fireLine(opened[0], '2', { output: 'no text field' });
    fireLine(opened[0], 'not-a-number', { text: 'no line number' });
    fireLine(opened[0], '3', { text: '12 passed' });
    expect(opened.map(({ url }) => url)).toEqual(['/api/profiles/P3/stream']);
    expect(received).toEqual([{ lineNumber: 1, text: 'Running 12 tests' }, { lineNumber: 3, text: '12 passed' }]);
    expect(stream.lastLineNumber()).toBe(3);
  });

  test('a stream the browser gave up on reopens after the last line received, and a replayed line is not delivered twice', () => {
    jest.useFakeTimers();
    const { opened, eventSourceOf } = fakeSources();
    const received: number[] = [];
    const stream = ProfileStreamClient.follow('P3', { onLines: (lines) => received.push(...lines.map((line) => line.lineNumber)) }, { eventSourceOf, reopenDelayMilliseconds: 0 });
    fireLine(opened[0], '1', { text: 'first' });
    fireLine(opened[0], '2', { text: 'second' });
    giveUp(opened[0]);
    jest.advanceTimersByTime(1);
    fireLine(opened[1], '2', { text: 'second' });
    fireLine(opened[1], '3', { text: 'third' });
    stream.close();
    expect(opened.map(({ url }) => url)).toEqual(['/api/profiles/P3/stream', '/api/profiles/P3/stream?after=2']);
    expect(received).toEqual([1, 2, 3]);
    expect(opened[1]?.closed).toBe(true);
  });

  test('closing stops a pending reopen', () => {
    jest.useFakeTimers();
    const { opened, eventSourceOf } = fakeSources();
    const stream = ProfileStreamClient.follow('P3', { onLines: () => undefined }, { eventSourceOf, reopenDelayMilliseconds: 10 });
    giveUp(opened[0]);
    stream.close();
    jest.advanceTimersByTime(20);
    expect(opened).toHaveLength(1);
  });
});
