/**
 * The Host check of a server bound to 127.0.0.1: a request must name this server by a loopback name and its own port. A page on a foreign
 * name that DNS rebinding resolved to 127.0.0.1 carries that foreign name as its Host, and is refused.
 */
export type HostGuardVerdict = 'admitted' | 'foreign-host';

/** The names by which a page reaches a server bound to 127.0.0.1. */
export const LOOPBACK_HOST_NAMES = ['127.0.0.1', 'localhost'] as const;

export function hostGuardVerdictFor(request: Request, port: number): HostGuardVerdict {
  const host = request.headers.get('host');
  const hostIsOwn = host !== null && LOOPBACK_HOST_NAMES.some((hostName) => host === `${hostName}:${port}`);
  return hostIsOwn ? 'admitted' : 'foreign-host';
}
