/**
 * The address scheme of an HTTP API whose endpoints are versioned by path: `/api/v<n>/<endpoint>` for each version an endpoint is served
 * at, side by side, and `/api/<endpoint>`, its path from before versions, which a server keeps answering for older clients until it raises
 * its minimum. `/api/versions` is never versioned and never removed: it says which system version a server is.
 */
export interface EndpointOfPath {
  /** The path below `/api/` without its version, such as `fleet` or `forges/example/frame-session`. */
  readonly endpoint: string;
  /** `null` at the unversioned path. */
  readonly version:  number | null;
}

const API_ROOT = '/api/';

const VERSIONS_PATH = `${API_ROOT}versions`;

const VERSION_SEGMENT = /^v([1-9]\d*)\/(.+)$/;

function versionedPathOf(endpoint: string, version: number): string {
  return `${API_ROOT}v${version}/${endpoint}`;
}

function unversionedPathOf(endpoint: string): string {
  return `${API_ROOT}${endpoint}`;
}

/** The endpoint and version a path names; `null` for a path outside `/api/` or one that names no endpoint. */
function endpointOfPath(pathname: string): EndpointOfPath | null {
  if (!pathname.startsWith(API_ROOT)) return null;
  const belowRoot = pathname.slice(API_ROOT.length);
  if (belowRoot === '') return null;
  const versioned = VERSION_SEGMENT.exec(belowRoot);
  const version = versioned?.[1];
  const endpoint = versioned?.[2];
  return version === undefined || endpoint === undefined ? { endpoint: belowRoot, version: null } : { endpoint, version: Number(version) };
}

export const ApiPathUtil = {
  VERSIONS_PATH,
  versionedPathOf,
  unversionedPathOf,
  endpointOfPath,
} as const;
