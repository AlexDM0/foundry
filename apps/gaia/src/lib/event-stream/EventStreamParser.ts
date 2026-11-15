/**
 * Server-sent events, parsed as the HTML standard reads an event stream: text arrives in chunks cut anywhere, and an event is handed out
 * only when its closing blank line has arrived. What is left when the stream ends is an incomplete event and is never handed out.
 */

export interface ServerSentEvent {
  /** `message` when the event names no type. */
  readonly eventName:   string;
  readonly data:        string;
  /** The newest `id` the stream sent, carried over to every later event as the standard says. */
  readonly lastEventId: string;
}

export interface EventStreamParser {
  /** The events this chunk completes, in order; a partial line or event waits for the next chunk. */
  readonly eventsOf: (chunk: string) => ServerSentEvent[];
}

const DEFAULT_EVENT_NAME = 'message';
const BYTE_ORDER_MARK = '﻿';
const LINE_ENDING = /\r\n|\r|\n/g;
const CARRIAGE_RETURN = '\r';
const LINE_FEED = '\n';
const COMMENT_MARK = ':';
const FIELD_SEPARATOR = ':';
const NULL_CHARACTER = '\0';

export function eventStreamParserOf(): EventStreamParser {
  let unfinishedLine        = '';
  let streamHasStarted      = false;
  // A chunk that ends on a carriage return may be followed by the line feed of the same line ending.
  let lineFeedMayContinue   = false;
  let eventName             = '';
  let dataLines: string[] = [];
  let lastEventId           = '';

  function eventCompletedBy(line: string): ServerSentEvent | null {
    if (line === '') {
      const completed = dataLines.length === 0 ? null : { eventName: eventName === '' ? DEFAULT_EVENT_NAME : eventName, data: dataLines.join(LINE_FEED), lastEventId };
      eventName = '';
      dataLines = [];
      return completed;
    }
    if (line.startsWith(COMMENT_MARK)) return null;
    const separatorIndex = line.indexOf(FIELD_SEPARATOR);
    const fieldName      = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue       = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
    const value          = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (fieldName === 'event') eventName = value;
    if (fieldName === 'data') dataLines.push(value);
    if (fieldName === 'id' && !value.includes(NULL_CHARACTER)) lastEventId = value;
    return null;
  }

  function eventsOf(chunk: string): ServerSentEvent[] {
    if (chunk === '') return [];
    let text = lineFeedMayContinue && chunk.startsWith(LINE_FEED) ? chunk.slice(1) : chunk;
    if (!streamHasStarted) {
      streamHasStarted = true;
      if (text.startsWith(BYTE_ORDER_MARK)) text = text.slice(1);
    }
    lineFeedMayContinue = text.endsWith(CARRIAGE_RETURN);
    const buffered = unfinishedLine + text;
    const events: ServerSentEvent[] = [];
    let lineStart = 0;
    for (const lineEnding of buffered.matchAll(LINE_ENDING)) {
      const completed = eventCompletedBy(buffered.slice(lineStart, lineEnding.index));
      if (completed !== null) events.push(completed);
      lineStart = lineEnding.index + lineEnding[0].length;
    }
    unfinishedLine = buffered.slice(lineStart);
    return events;
  }

  return { eventsOf };
}
