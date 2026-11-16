/**
 * The origins that may frame the Bridge, read again for every response from the frame-ancestor records in the monitor folder, one file per
 * host. A record that is unreadable, of another major or whose origin is no URL or opaque adds no origin; with none the Bridge is unframeable.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { FRAME_ANCESTOR_RECORD_FORMAT } from 'forge-contracts/FrameAncestorRecord';

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

function recordFileNamesIn(frameAncestorsFolder: string): string[] {
  try {
    return readdirSync(frameAncestorsFolder).filter((fileName) => fileName.endsWith(FRAME_ANCESTOR_RECORD_FORMAT.extension)).sort();
  } catch {
    return [];
  }
}

/** Only `origin` is read, and only from a record of the one major this Overseer knows; a newer minor only adds keys. */
function frameOriginsOf(monitorFolder: string): string[] {
  const frameAncestorsFolder = join(monitorFolder, FRAME_ANCESTOR_RECORD_FORMAT.folderName);
  return [...new Set(recordFileNamesIn(frameAncestorsFolder).flatMap((fileName) => {
    const record = storedRecordOf(join(frameAncestorsFolder, fileName));
    return record?.['version'] === FRAME_ANCESTOR_RECORD_FORMAT.major ? originOf(record['origin']) : [];
  }))];
}

export const FrameOrigins = Object.freeze({ frameOriginsOf });
