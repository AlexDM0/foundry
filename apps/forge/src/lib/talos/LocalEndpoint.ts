/**
 * The port for where a named instance, a job or a board's Talos, listens on this machine. An endpoint is an opaque string the launch
 * file stores; only the adapter knows its shape, and a bind or a connect goes through it too.
 */
import type { Server, Socket } from 'node:net';

export interface EndpointInstanceFacts {
  readonly monitorFolder: string;
  readonly trackerId:     string;
  /** What the endpoint serves, a job or a board's Talos. */
  readonly name:          string;
  readonly instance:      number;
}

export type EndpointOutcome =
  | { verdict: 'done' }
  | { verdict: 'refused'; reason: string };

export interface LocalEndpoint {
  /** One endpoint per instance. An adapter may draw a new one each call, so a launch keeps what it was answered. */
  readonly endpointOf:      (facts: EndpointInstanceFacts) => string;
  /** The limit of this platform, which a launch checks before it writes a file. */
  readonly endpointFits:    (endpoint: string) => boolean;
  /** Makes the endpoint bindable, clearing what a dead process of this instance left behind. */
  readonly prepareEndpoint: (endpoint: string) => EndpointOutcome;
  /** Never throws: an instance's stop signals run after it. */
  readonly releaseEndpoint: (endpoint: string) => EndpointOutcome;
  /** A server not yet listening; its `listen` takes the endpoint. */
  readonly serverOf:        (onConnection: (socket: Socket) => void) => Server;
  readonly connectionTo:    (endpoint: string) => Socket;
}
