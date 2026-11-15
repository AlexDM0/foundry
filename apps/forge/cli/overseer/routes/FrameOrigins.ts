/**
 * The origins that may frame the Bridge, read again for every response from the server records of the two programs that frame it:
 * agent-dashboard's and Gaia's. A record that is absent, unreadable or of another version adds no origin.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

/** agent-dashboard's own server record: its path is the dashboard's, never the product's naming constant. */
const DASHBOARD_SERVER_RECORD = ['.agent-progress-monitor', 'agent-dashboard', 'server.json'] as const;

/** Gaia writes its server record in the product's monitor folder: `{version, url, origin, processId, startedAt}`. */
const GAIA_SERVER_RECORD = ['gaia', 'server.json'] as const;

const GAIA_SERVER_RECORD_VERSION = 1;

/** A page at an opaque origin, such as a `file:` URL, has the origin `null`, which no `frame-ancestors` source may name. */
const OPAQUE_ORIGIN = 'null';

function originOf(url: unknown): string[] {
  if (typeof url !== 'string') return [];
  try {
    const { origin } = new URL(url);
    return origin === OPAQUE_ORIGIN ? [] : [origin];
  } catch {
    return [];
  }
}

function storedRecordOf(recordFilePath: string): Record<string, unknown> | null {
  try {
    const record: unknown = JSON.parse(readFileSync(recordFilePath, 'utf8'));
    return typeof record === 'object' && record !== null && !Array.isArray(record) ? record as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** With no readable record agent-dashboard may not frame the Bridge. */
function dashboardFrameOriginsOf(homeDirectory: string): string[] {
  const record = storedRecordOf(join(homeDirectory, ...DASHBOARD_SERVER_RECORD));
  if (record === null) return [];
  return [...new Set([...originOf(record['url']), ...originOf(record['boardOrigin'])])];
}

/** Only `origin` is read, and only from a record of the one version this Overseer knows. */
function gaiaFrameOriginsOf(monitorFolder: string): string[] {
  const record = storedRecordOf(join(monitorFolder, ...GAIA_SERVER_RECORD));
  if (record?.['version'] !== GAIA_SERVER_RECORD_VERSION) return [];
  return originOf(record['origin']);
}

function frameOriginsOf(homeDirectory: string, monitorFolder: string): string[] {
  return [...new Set([...dashboardFrameOriginsOf(homeDirectory), ...gaiaFrameOriginsOf(monitorFolder)])];
}

export const FrameOrigins = Object.freeze({ frameOriginsOf, dashboardFrameOriginsOf, gaiaFrameOriginsOf });
