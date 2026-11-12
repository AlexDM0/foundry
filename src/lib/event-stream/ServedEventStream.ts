/**
 * Server-sent events, served: an answer whose body stays open, and the writer that sends events and comments down it as the HTML standard
 * frames them. The stream ends once, by `close()` or by the reader going away, and a write after the end is dropped, never thrown.
 */
export interface ServedEventStreamOptions {
  /** Called once, when the stream ends for either reason. */
  readonly onEnded: () => void;
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
  });

  const write = (text: string): void => {
    if (!isOpen) return;
    streamController?.enqueue(encoder.encode(text));
  };

  return {
    response:    new Response(body, { headers: { 'content-type': EVENT_STREAM_CONTENT_TYPE, 'cache-control': 'no-store' } }),
    sendEvent:   (eventName, data) => write(eventTextOf(eventName, data)),
    sendComment: (comment) => write(commentTextOf(comment)),
    close:       () => {
      if (!isOpen) return;
      end();
      streamController?.close();
    },
    isOpen: () => isOpen,
  };
}
