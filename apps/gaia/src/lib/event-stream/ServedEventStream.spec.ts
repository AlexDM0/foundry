/**
 * A served event stream, read back through the event-stream parser as a browser would read it: events arrive whole and in order, data with
 * line breaks arrives as it was sent, a comment is skipped by the reader, and the stream ends exactly once, whether the server closes it or
 * the reader goes away; a reader that leaves more than its bound unread ends it too. A write after the end is dropped without a throw.
 */
import { describe, expect, test } from 'bun:test';

import { eventStreamParserOf, type ServerSentEvent } from './EventStreamParser.ts';
import { servedEventStreamOf }                       from './ServedEventStream.ts';

/** Room for one short event and not for two. */
const EXAMPLE_UNREAD_BYTES_BOUND = 48;

async function wholeBodyOf(response: Response): Promise<string> {
  return response.text();
}

function eventsIn(bodyText: string): ServerSentEvent[] {
  return eventStreamParserOf().eventsOf(bodyText);
}

describe('a served event stream', () => {
  test('answers as an event stream that no cache keeps', () => {
    const { response } = servedEventStreamOf({ onEnded: () => undefined });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('sends each event whole and in order, data with line breaks included', async () => {
    const stream = servedEventStreamOf({ onEnded: () => undefined });
    stream.sendEvent('fleet', '{"fleetVersion":1}');
    stream.sendEvent('note', 'first line\nsecond line');
    stream.close();
    const events = eventsIn(await wholeBodyOf(stream.response));
    expect(events.map((event) => [event.eventName, event.data])).toEqual([
      ['fleet', '{"fleetVersion":1}'],
      ['note', 'first line\nsecond line'],
    ]);
  });

  test('sends an event under its id, and one without an id leaves the reader\'s last event id as it was', async () => {
    const stream = servedEventStreamOf({ onEnded: () => undefined });
    stream.sendEvent('handshake', '{}');
    stream.sendEvent('board', '{}', '1-45');
    stream.sendEvent('note', '{}');
    stream.close();
    expect(eventsIn(await wholeBodyOf(stream.response)).map((event) => [event.eventName, event.lastEventId])).toEqual([
      ['handshake', ''],
      ['board', '1-45'],
      ['note', '1-45'],
    ]);
  });

  test('sends a comment that the reader skips', async () => {
    const stream = servedEventStreamOf({ onEnded: () => undefined });
    stream.sendComment('heartbeat');
    stream.sendEvent('fleet', 'after the comment');
    stream.close();
    const bodyText = await wholeBodyOf(stream.response);
    expect(bodyText.startsWith(': heartbeat\n\n')).toBe(true);
    expect(eventsIn(bodyText).map((event) => event.data)).toEqual(['after the comment']);
  });

  test('ends once when the server closes it, and drops what is written after', async () => {
    let endings = 0;
    const stream = servedEventStreamOf({ onEnded: () => { endings += 1; } });
    stream.sendEvent('fleet', 'before the end');
    stream.close();
    stream.close();
    stream.sendEvent('fleet', 'after the end');
    stream.sendComment('after the end');
    expect(stream.isOpen()).toBe(false);
    expect(endings).toBe(1);
    expect(eventsIn(await wholeBodyOf(stream.response)).map((event) => event.data)).toEqual(['before the end']);
  });

  test('ends once when the reader leaves more than its bound unread, and the reader still gets what was sent before the end', async () => {
    let endings = 0;
    const stream = servedEventStreamOf({ onEnded: () => { endings += 1; }, unreadBytesBound: EXAMPLE_UNREAD_BYTES_BOUND });
    stream.sendEvent('fleet', 'within the bound');
    expect(stream.isOpen()).toBe(true);
    stream.sendEvent('fleet', 'past the bound');
    stream.sendEvent('fleet', 'after the end');
    expect(stream.isOpen()).toBe(false);
    expect(endings).toBe(1);
    expect(eventsIn(await wholeBodyOf(stream.response)).map((event) => event.data)).toEqual(['within the bound', 'past the bound']);
  });

  test('ends once when the reader goes away, and drops what is written after', async () => {
    let endings = 0;
    const stream = servedEventStreamOf({ onEnded: () => { endings += 1; } });
    const reader = stream.response.body?.getReader();
    await reader?.cancel();
    stream.sendEvent('fleet', 'after the reader went');
    stream.close();
    expect(stream.isOpen()).toBe(false);
    expect(endings).toBe(1);
  });
});
