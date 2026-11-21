/** A relayed stream's answer read as a browser reads it, event by event, until its end or until the page goes. Test-only. */
import { eventStreamParserOf, type ServerSentEvent } from '../../../lib/event-stream/EventStreamParser.ts';

export interface RelayEventReader {
  readonly nextEvent: () => Promise<ServerSentEvent>;
  /** Every event left, once the stream has ended. */
  readonly untilEnd:  () => Promise<readonly ServerSentEvent[]>;
  /** The page goes: its reader cancels the stream. */
  readonly leave:     () => Promise<void>;
}

export function relayEventReaderOf(response: Response): RelayEventReader {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('The relayed stream has no body.');
  const decoder = new TextDecoder();
  const parser = eventStreamParserOf();
  const waiting: ServerSentEvent[] = [];
  return {
    nextEvent: async () => {
      while (waiting.length === 0) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('The relayed stream ended before the next event.');
        waiting.push(...parser.eventsOf(decoder.decode(chunk.value, { stream: true })));
      }
      return waiting.shift() as ServerSentEvent;
    },
    untilEnd: async () => {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) waiting.push(...parser.eventsOf(decoder.decode(chunk.value, { stream: true })));
      return waiting.splice(0);
    },
    leave: () => reader.cancel(),
  };
}
