/**
 * `machine-limits.json` in the monitor folder: the one agent limit every Hephaestus of this user on this machine keeps, `{version: 1,
 * agentLimit}`. Read, validate and map; written through the atomic-file package.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { writeFileAtomically }       from '../../lib/atomic-file/AtomicFile.ts';
import { storedFileTextOf }          from '../StoredFileText.ts';
import { StoredValueUtil }           from '../utils/StoredValueUtil.ts';
import type { MachineLimitsProblem } from './@types/MachineLimitsProblem.ts';

export const MACHINE_LIMITS_VERSION = 1;

export interface MachineLimits {
  agentLimit: number;
}

export type MachineLimitsReading =
  | { verdict: 'absent' }
  | { verdict: 'read'; limits: MachineLimits }
  | { verdict: 'newer-version'; version: number }
  | { verdict: 'malformed'; problem: MachineLimitsProblem };

const MACHINE_LIMITS_FILE_NAME = 'machine-limits.json';

function pathIn(monitorFolder: string): string {
  return join(monitorFolder, MACHINE_LIMITS_FILE_NAME);
}

function readingOf(document: unknown): MachineLimitsReading {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return { verdict: 'malformed', problem: { code: 'not-a-json-object' } };
  const { version, agentLimit } = document as { version?: unknown; agentLimit?: unknown };
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return { verdict: 'malformed', problem: { code: 'version-not-a-whole-number', field: 'version' } };
  if (version > MACHINE_LIMITS_VERSION) return { verdict: 'newer-version', version };
  if (version < MACHINE_LIMITS_VERSION) {
    return {
      verdict: 'malformed',
      problem: {
        code: 'version-older', field: 'version', version, readableVersion: MACHINE_LIMITS_VERSION
      }
    };
  }
  if (typeof agentLimit !== 'number' || !Number.isSafeInteger(agentLimit) || agentLimit < 1) {
    return { verdict: 'malformed', problem: { code: 'agent-limit-below-one', field: 'agentLimit' } };
  }
  return { verdict: 'read', limits: { agentLimit } };
}

/** Never throws: a file that cannot be read or trusted whole is `malformed`, which every reader treats as no file. */
function read(monitorFolder: string): MachineLimitsReading {
  const storedText = storedFileTextOf(pathIn(monitorFolder));
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', problem: storedText.problem };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', problem: parsedJson.problem };
  return readingOf(parsedJson.value);
}

function write(monitorFolder: string, limits: MachineLimits): void {
  mkdirSync(monitorFolder, { recursive: true });
  writeFileAtomically(pathIn(monitorFolder), `${JSON.stringify({ version: MACHINE_LIMITS_VERSION, agentLimit: limits.agentLimit }, null, 2)}\n`);
}

export const MachineLimitsFile = Object.freeze({ pathIn, read, write });
