/**
 * A Talos socket that supervises no child and refuses every frame, for the endpoint's specs: they reach Talos's socket server through
 * here, with the welcome of a Talos that holds no lease.
 */
import type { LocalEndpoint }                             from '../lib/talos/LocalEndpoint.ts';
import { listenOnTalosSocket, type TalosSocketListening } from '../lib/talos/TalosSocketServer.ts';
import { TALOS_PROTOCOL_VERSION }                         from '../lib/talos/constants/TalosProtocol.ts';

export type { TalosSocketListening };

export async function listenOnIdleTalosSocket(endpoint: LocalEndpoint, socketPath: string, secret: string): Promise<TalosSocketListening> {
  return await listenOnTalosSocket({
    serverOf:   (onConnection) => endpoint.serverOf(onConnection),
    endpoint:   socketPath,
    secret,
    isQuitting: () => false,
    welcomeOf:  () => ({
      kind: 'welcome', protocolVersion: TALOS_PROTOCOL_VERSION, codeVersion: 'code-example', startNumber: 1, talos: null, leaseStanding: 'unheld'
    }),
    onVersionMismatch: () => undefined,
    onClientFrame:     async (frame) => ({
      kind: 'done', frameId: frame.frameId, verdict: 'refused', reason: 'unknown-child'
    }),
  });
}

export function talosHelloLineOf(secret: string): string {
  return `${JSON.stringify({ kind: 'hello', requiredProtocolVersion: TALOS_PROTOCOL_VERSION, secret })}\n`;
}
