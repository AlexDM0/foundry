/**
 * The port for where a named instance listens on this machine. An endpoint is an opaque string the launch file stores; only the adapter
 * knows its shape, and a bind or a connect goes through it too. It depends on `src/lib/owner-only-files`.
 */
import type { Server, Socket } from 'node:net';

export interface EndpointInstanceFacts {
  /** The owner-only folder an adapter that needs a file for its endpoint keeps it in. */
  readonly socketFolder: string;
  /** Who owns the instances, so two owners' instances of one name never share an endpoint. */
  readonly scope:        string;
  /** What the endpoint serves. */
  readonly name:         string;
  readonly instance:     number;
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
