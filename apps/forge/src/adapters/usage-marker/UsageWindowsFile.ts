/**
 * `usage-windows.json` in the monitor folder, beside the usage marker: the newest observation of each usage window of the vendor's plan, which
 * every Hephaestus shows in its header. Read, validate and map; written through the atomic-file package, unknown keys kept in order.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { writeFileAtomically }      from '../../lib/atomic-file/AtomicFile.ts';
import { JsonRecordUtil }           from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf }         from '../StoredFileText.ts';
import { StoredValueUtil }          from '../utils/StoredValueUtil.ts';
import type { UsageWindowsProblem } from './@types/UsageWindowsProblem.ts';

export interface UsageWindowObservation {
  /** The window's name as the agent reported it, an opaque value. */
  window:      string;
  /** `null` for a window the agent's adapter does not know. */
  lengthHours: number | null;
  /** The share of the window used, as the vendor reports it: 0 to 1. */
  utilization: number;
  /** An ISO stamp. */
  resetsAt:    string;
}

export type UsageWindowsReading =
  | { verdict: 'absent' }
  | { verdict: 'read'; windows: UsageWindowObservation[]; storedText: string; document: Record<string, unknown> }
  | { verdict: 'malformed'; problem: UsageWindowsProblem };

const USAGE_WINDOWS_FILE_NAME = 'usage-windows.json';
const JSON_INDENT_SPACES = 2;

function pathIn(monitorFolder: string): string {
  return join(monitorFolder, USAGE_WINDOWS_FILE_NAME);
}

function observationOf(window: string, entry: unknown): UsageWindowObservation | UsageWindowsProblem {
  const fields = JsonRecordUtil.recordOf(entry);
  if (fields === undefined) return { code: 'window-not-an-object', window };
  const { lengthHours, utilization, resetsAt } = fields;
  if (lengthHours !== null && (typeof lengthHours !== 'number' || !Number.isFinite(lengthHours))) {
    return { code: 'window-length-hours-not-a-number-or-null', window };
  }
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return { code: 'window-utilization-not-a-number', window };
  if (typeof resetsAt !== 'string' || Number.isNaN(Date.parse(resetsAt))) return { code: 'window-resets-at-not-a-stamp', window };
  return {
    window, lengthHours, utilization, resetsAt
  };
}

function observationsOf(document: Record<string, unknown>): UsageWindowObservation[] | UsageWindowsProblem {
  const windows = JsonRecordUtil.recordOf(document['windows']);
  if (windows === undefined) return { code: 'windows-not-an-object', field: 'windows' };
  const observations: UsageWindowObservation[] = [];
  for (const [window, entry] of Object.entries(windows)) {
    if (window.length === 0) return { code: 'window-with-no-name' };
    const observation = observationOf(window, entry);
    if ('code' in observation) return observation;
    observations.push(observation);
  }
  return observations;
}

/** Never throws: a file that cannot be read or trusted whole is `malformed`, which shows no windows. */
function read(monitorFolder: string): UsageWindowsReading {
  const storedText = storedFileTextOf(pathIn(monitorFolder));
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', problem: storedText.problem };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', problem: parsedJson.problem };
  const document = JsonRecordUtil.recordOf(parsedJson.value);
  if (document === undefined) return { verdict: 'malformed', problem: { code: 'not-a-json-object' } };
  const windows = observationsOf(document);
  return !Array.isArray(windows)
    ? { verdict: 'malformed', problem: windows }
    : {
      verdict: 'read', windows, storedText: storedText.text, document
    };
}

/** Each observation replaces its window's values in place; a window seen first is added last. Every other key stays, in order. */
function documentWith(document: Record<string, unknown>, observations: readonly UsageWindowObservation[]): Record<string, unknown> {
  const windows: Record<string, unknown> = { ...JsonRecordUtil.recordOf(document['windows']) };
  for (const {
    window, lengthHours, utilization, resetsAt
  } of observations) {
    const stored = Object.hasOwn(windows, window) ? JsonRecordUtil.recordOf(windows[window]) : undefined;
    windows[window] = {
      ...stored, lengthHours, utilization, resetsAt
    };
  }
  return { ...document, windows };
}

/**
 * The later observation of a window replaces the earlier one. Nothing is written when no value changes, so a file stays byte-identical;
 * a malformed file is replaced by the observations alone.
 */
function record(monitorFolder: string, observations: readonly UsageWindowObservation[]): void {
  if (observations.length === 0) return;
  const reading = read(monitorFolder);
  const document = reading.verdict === 'read' ? reading.document : {};
  const text = `${JSON.stringify(documentWith(document, observations), null, JSON_INDENT_SPACES)}\n`;
  if (reading.verdict === 'read' && text === reading.storedText) return;
  mkdirSync(monitorFolder, { recursive: true });
  writeFileAtomically(pathIn(monitorFolder), text);
}

export const UsageWindowsFile = Object.freeze({ pathIn, read, record });
