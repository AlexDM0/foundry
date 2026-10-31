/**
 * The port for where a Watcher instance listens on this machine. An endpoint is an opaque string the launch file stores; only the adapter
 * knows its shape, and a bind or a connect goes through it too.
 */
import type { Server, Socket } from 'node:net';

export interface EndpointInstanceFacts {
  readonly monitorFolder: string;
  readonly trackerId:     string;
  readonly jobId:         string;
  readonly instance:      number;
}

export type EndpointOutcome =
  | { verdict: 'done' }
  | { verdict: 'refused'; reason: string };

export interface LocalEndpoint {
  readonly endpointOf:      (facts: EndpointInstanceFacts) => string;
  readonly endpointFits:    (endpoint: string) => boolean;
  /** Makes the endpoint bindable, clearing what a dead Watcher of this instance left behind. */
  readonly prepareEndpoint: (endpoint: string) => EndpointOutcome;
  readonly releaseEndpoint: (endpoint: string) => EndpointOutcome;
  /** A server not yet listening; its `listen` takes the endpoint. */
  readonly serverOf:        (onConnection: (socket: Socket) => void) => Server;
  readonly connectionTo:    (endpoint: string) => Socket;
}
