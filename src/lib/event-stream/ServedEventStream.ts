/**
 * Server-sent events, served: an answer whose body stays open, and the writer that sends events and comments down it as the HTML standard
 * frames them. The stream ends once, by `close()`, by the reader going away, or by the reader leaving too much unread, and a write after
 * the end is dropped, never thrown.
 */
export interface ServedEventStreamOptions {
  /** Called once, when the stream ends for any reason. */
  readonly onEnded:           () => void;
  /** A reader that leaves more than this unread has stopped reading: the stream ends, so the writer's queue never grows without bound. */
  readonly unreadBytesBound?: number;
}

export interface ServedEventStream {
  readonly response:    Response;
  /** `eventName` holds no line break; `data` may, and is sent as one `data` line per line. */
  readonly sendEvent:   (eventName: string, data: string) => void;
  /** A line a reader skips, such as a heartbeat that keeps an idle connection from looking dead. */
  readonly sendComment: (comment: string) => void;
  readonly close:       () => void;
  readonly isOpen:      () => boolean;
}

const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';

/** Four mebibytes, many whole documents: a reader this far behind is not merely slow, and an event-stream reader that is cut off connects again. */
const UNREAD_BYTES_BOUND = 4_194_304;

const LINE_BREAK = /\r\n|\r|\n/;

function eventTextOf(eventName: string, data: string): string {
  const dataLines = data.split(LINE_BREAK).map((line) => `data: ${line}\n`).join('');
  return `event: ${eventName}\n${dataLines}\n`;
}

function commentTextOf(comment: string): string {
  return comment.split(LINE_BREAK).map((line) => `: ${line}\n`).join('') + '\n';
}

export function servedEventStreamOf(options: ServedEventStreamOptions): ServedEventStream {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let isOpen = true;

  const end = (): void => {
    if (!isOpen) return;
    isOpen = false;
    options.onEnded();
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      end();
    },
  }, new ByteLengthQueuingStrategy({ highWaterMark: options.unreadBytesBound ?? UNREAD_BYTES_BOUND }));

  const close = (): void => {
    if (!isOpen) return;
    end();
    streamController?.close();
  };

  const write = (text: string): void => {
    if (!isOpen || streamController === null) return;
    streamController.enqueue(encoder.encode(text));
    const unreadRoomLeft = streamController.desiredSize ?? 0;
    if (unreadRoomLeft < 0) close();
  };

  return {
    response:    new Response(body, { headers: { 'content-type': EVENT_STREAM_CONTENT_TYPE, 'cache-control': 'no-store' } }),
    sendEvent:   (eventName, data) => write(eventTextOf(eventName, data)),
    sendComment: (comment) => write(commentTextOf(comment)),
    close,
    isOpen:      () => isOpen,
  };
}
