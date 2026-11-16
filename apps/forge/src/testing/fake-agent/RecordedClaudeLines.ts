/**
 * The real `claude` stream-json lines the fake agent plays, read from this OS's recording, which `bun run record src/testing/fake-agent/`
 * writes from the Claude probes. A scenario gives a line as a selector: its `type`, its `subtype` and the values it sets. The fake prints
 * the recorded line of that kind which holds every key the selector names, with the selector's values put in. A selector naming a kind or
 * a key no recording holds is refused, so no line the fake prints has a shape a person wrote.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { type BoundaryRecording, recordCommandOf, recordingPathOf } from '../BoundaryRecordings.ts';

export const CLAUDE_WIRE_BOUNDARY = 'src/testing/fake-agent/';

/** In the order a selector's candidates are tried. */
export const CLAUDE_WIRE_SCENARIOS = [
  'turn-that-ends',
  'resume',
  'mid-turn-line',
  'rate-limit-rejected',
  'rate-limit-window-rejected',
  'crash',
  'unreadable-input-line',
  'flint-brain-turn',
] as const;

export type ClaudeWireScenario = typeof CLAUDE_WIRE_SCENARIOS[number];

export interface ClaudeWireEntry {
  readonly from: 'stdin' | 'stdout';
  readonly line: string;
}

export interface ClaudeSessionEnding {
  readonly exitCode:   number | null;
  readonly signalCode: string | null;
  readonly stderr:     string;
}

export interface RecordedClaudeSession {
  readonly scenario: ClaudeWireScenario;
  readonly wire:     readonly ClaudeWireEntry[];
  readonly ending:   ClaudeSessionEnding;
}

/** Values a session fills in whole, whatever their recorded shape: the report follows the role's schema. */
const VALUES_SET_WHOLE: ReadonlySet<string> = new Set(['structured_output']);

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..', '..');

type JsonRecord = Record<string, unknown>;

const sessionsByOs = new Map<string, ReadonlyMap<ClaudeWireScenario, RecordedClaudeSession>>();
const stdoutRecordsByOs = new Map<string, readonly JsonRecord[]>();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function noRecordingMessage(what: string, os: string): string {
  return `The fake agent plays only recorded claude lines, and ${what} for ${os}. Record it with \`${recordCommandOf(CLAUDE_WIRE_BOUNDARY)}\`.`;
}

function sessionsOf(os: string): ReadonlyMap<ClaudeWireScenario, RecordedClaudeSession> {
  const known = sessionsByOs.get(os);
  if (known !== undefined) return known;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(CLAUDE_WIRE_BOUNDARY, os));
  if (!existsSync(recordingPath)) throw new Error(noRecordingMessage(`${recordingPathOf(CLAUDE_WIRE_BOUNDARY, os)} does not exist`, os));
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  const sessions = new Map<ClaudeWireScenario, RecordedClaudeSession>();
  for (const { callShape, answer } of recording.answers) {
    const scenario = CLAUDE_WIRE_SCENARIOS.find((known) => known === callShape);
    if (scenario !== undefined) sessions.set(scenario, answer as RecordedClaudeSession);
  }
  const missing = CLAUDE_WIRE_SCENARIOS.filter((scenario) => !sessions.has(scenario));
  if (missing.length > 0) throw new Error(noRecordingMessage(`the recording holds no ${missing.join(', ')} session`, os));
  sessionsByOs.set(os, sessions);
  return sessions;
}

export function recordedSessionOf(scenario: ClaudeWireScenario, os: string = process.platform): RecordedClaudeSession {
  const session = sessionsOf(os).get(scenario);
  if (session === undefined) throw new Error(noRecordingMessage(`the recording holds no ${scenario} session`, os));
  return session;
}

function recordedStdoutRecordsOf(os: string): readonly JsonRecord[] {
  const known = stdoutRecordsByOs.get(os);
  if (known !== undefined) return known;
  const records = CLAUDE_WIRE_SCENARIOS.flatMap((scenario) => recordedSessionOf(scenario, os).wire)
    .filter((entry) => entry.from === 'stdout')
    .map((entry) => JSON.parse(entry.line) as unknown)
    .filter(isRecord);
  stdoutRecordsByOs.set(os, records);
  return records;
}

function holdsEveryKeyOf(recorded: JsonRecord, selector: JsonRecord): boolean {
  return Object.keys(selector).every((key) => {
    if (!Object.hasOwn(recorded, key)) return false;
    const recordedValue = recorded[key];
    const selectorValue = selector[key];
    if (VALUES_SET_WHOLE.has(key) || !isRecord(selectorValue) || !isRecord(recordedValue)) return true;
    return holdsEveryKeyOf(recordedValue, selectorValue);
  });
}

function hasTheSameKeysAs(first: JsonRecord, second: JsonRecord): boolean {
  const firstKeys = Object.keys(first);
  if (firstKeys.length !== Object.keys(second).length) return false;
  return firstKeys.every((key) => {
    if (!Object.hasOwn(second, key)) return false;
    const firstValue = first[key];
    const secondValue = second[key];
    return VALUES_SET_WHOLE.has(key) || !isRecord(firstValue) || !isRecord(secondValue) || hasTheSameKeysAs(firstValue, secondValue);
  });
}

/** The recorded line with the selector's values put in; the recorded key order is kept. */
function withValuesOf(recorded: JsonRecord, selector: JsonRecord): JsonRecord {
  const filled: JsonRecord = { ...recorded };
  for (const [key, selectorValue] of Object.entries(selector)) {
    const recordedValue = recorded[key];
    filled[key] = !VALUES_SET_WHOLE.has(key) && isRecord(selectorValue) && isRecord(recordedValue) ? withValuesOf(recordedValue, selectorValue) : selectorValue;
  }
  return filled;
}

function selectorOf(line: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`The real claude prints only JSON lines on stdout, and a fake agent scenario prints this line: ${line}`);
  }
  if (!isRecord(parsed) || typeof parsed['type'] !== 'string') throw new Error(`A fake agent line names no type: ${line}`);
  return parsed;
}

/**
 * The recorded line a selector line names, filled with its values. A recorded line of the same keys is taken first, so a line this
 * returned comes back unchanged.
 */
export function recordedLineOf(line: string, os: string = process.platform): string {
  const selector = selectorOf(line);
  const sameKind = recordedStdoutRecordsOf(os).filter((recorded) => recorded['type'] === selector['type'] && recorded['subtype'] === selector['subtype']);
  const candidates = sameKind.filter((recorded) => holdsEveryKeyOf(recorded, selector));
  const chosen = candidates.find((recorded) => hasTheSameKeysAs(recorded, selector)) ?? candidates[0];
  if (chosen === undefined) {
    const kind = selector['subtype'] === undefined ? String(selector['type']) : `${String(selector['type'])}/${String(selector['subtype'])}`;
    const reason = sameKind.length === 0 ? `no recorded ${kind} line` : `no recorded ${kind} line holds every key of`;
    throw new Error(`The fake agent plays only recorded claude lines, and there is ${reason} this line: ${line}`);
  }
  return JSON.stringify(withValuesOf(chosen, selector));
}
