/**
 * The browser around a relayed stream of a forge's board: how it opens an `EventSource` on a relay path and how it waits before opening one
 * again, so a spec drives the source and fires every wait by hand.
 */

/** The part of the browser's `EventSource` the stream clients use. */
export interface RelayEventSource {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export interface RelayStreamSurroundings {
  readonly openEventSource: (path: string) => RelayEventSource;
  /** Runs the task once after the delay; the answer cancels it. */
  readonly schedule:        (task: () => void, delayMilliseconds: number) => () => void;
}

export const BROWSER_RELAY_STREAM_SURROUNDINGS: RelayStreamSurroundings = {
  openEventSource: (path) => new EventSource(path),
  schedule:        (task, delayMilliseconds) => {
    const timer = setTimeout(task, delayMilliseconds);
    return () => clearTimeout(timer);
  },
};

/** An event's data parsed, `undefined` for data that is no JSON. */
export function parsedDataOf(event: Event): unknown {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as unknown;
  } catch {
    return undefined;
  }
}
