/**
 * The Origin check of a server bound to 127.0.0.1: a request carries no Origin, as a local program or a same-origin read sends it, or this
 * server's own. The text `null`, which a sandboxed frame or a file page sends, is refused like a foreign origin. A preflight is refused
 * whatever its Origin: no route grants cross-origin permission, so none answers the request for it.
 */
import { LOOPBACK_HOST_NAMES } from './HostGuard.ts';

export type OriginGuardVerdict = 'admitted' | 'foreign-origin' | 'opaque-origin' | 'preflight';

const OPAQUE_ORIGIN = 'null';

const PREFLIGHT_METHOD = 'OPTIONS';

export function originGuardVerdictFor(request: Request, port: number): OriginGuardVerdict {
  if (request.method === PREFLIGHT_METHOD) return 'preflight';
  const origin = request.headers.get('origin');
  if (origin === null) return 'admitted';
  if (origin === OPAQUE_ORIGIN) return 'opaque-origin';
  return LOOPBACK_HOST_NAMES.some((hostName) => origin === `http://${hostName}:${port}`) ? 'admitted' : 'foreign-origin';
}
