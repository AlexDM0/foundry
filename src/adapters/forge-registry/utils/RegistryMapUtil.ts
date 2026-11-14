/**
 * Validates and maps the entries of the registry `projects.json` to `RegisteredForge`s, in the registry's order. An entry that fails is
 * left out and named with every problem it has; every key is read as the entry's own, never through its prototype.
 */
import { isAbsolute } from 'node:path';

import { JsonValueUtil, type JsonObject } from '../../../lib/json-value/JsonValueUtil.ts';
import type {
  LeftOutRegistryEntry,
  RegisteredForge,
  RegisteredOverseer,
  RegistryEntryKey,
  RegistryEntryProblem,
  RegistryEntryProblemReason,
} from '../@types/RegisteredForge.ts';

export interface RegistryEntriesMapping {
  readonly forges:         readonly RegisteredForge[];
  readonly leftOutEntries: readonly LeftOutRegistryEntry[];
}

type TextRule = 'text' | 'absolute-path' | 'http-address';

const HTTP_PROTOCOL = 'http:';

function textIsHttpAddress(text: string): boolean {
  return URL.canParse(text) && new URL(text).protocol === HTTP_PROTOCOL;
}

function textProblemOf(value: unknown, rule: TextRule): RegistryEntryProblemReason | null {
  if (value === undefined) return 'missing';
  if (typeof value !== 'string') return 'not-a-string';
  if (value === '') return 'empty';
  if (rule === 'absolute-path' && !isAbsolute(value)) return 'not-an-absolute-path';
  if (rule === 'http-address' && !textIsHttpAddress(value)) return 'not-an-http-address';
  return null;
}

function requiredTextOf(record: JsonObject, field: string, key: RegistryEntryKey, rule: TextRule, problems: RegistryEntryProblem[]): string | null {
  const value  = JsonValueUtil.ownValueOf(record, field);
  const reason = textProblemOf(value, rule);
  if (reason !== null) {
    problems.push({ key, reason });
    return null;
  }
  return value as string;
}

/** An optional key that is absent or `null` reads as `null`; one that is present must hold to its rule. */
function optionalTextOf(record: JsonObject, field: string, key: RegistryEntryKey, rule: TextRule, problems: RegistryEntryProblem[]): string | null {
  const value = JsonValueUtil.ownValueOf(record, field);
  if (value === undefined || value === null) return null;
  return requiredTextOf(record, field, key, rule, problems);
}

function processIdOf(record: JsonObject, problems: RegistryEntryProblem[]): number | null {
  const value = JsonValueUtil.ownValueOf(record, 'processId');
  if (value === undefined) {
    problems.push({ key: 'overseer.processId', reason: 'missing' });
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    problems.push({ key: 'overseer.processId', reason: 'not-a-process-id' });
    return null;
  }
  return value;
}

/** A fact Gaia only shows: any value but text with something in it reads as `null`, and never leaves the forge out. */
function shownTextOf(record: JsonObject, field: string): string | null {
  const value = JsonValueUtil.ownValueOf(record, field);
  return typeof value === 'string' && value !== '' ? value : null;
}

/** An absent or `null` overseer is a forge with no live Overseer; one that is present must be whole. */
function overseerOf(entry: JsonObject, problems: RegistryEntryProblem[]): RegisteredOverseer | null {
  const value = JsonValueUtil.ownValueOf(entry, 'overseer');
  if (value === undefined || value === null) return null;
  const overseer = JsonValueUtil.jsonObjectOf(value);
  if (overseer === null) {
    problems.push({ key: 'overseer', reason: 'not-an-object' });
    return null;
  }
  const url       = requiredTextOf(overseer, 'url', 'overseer.url', 'http-address', problems);
  const processId = processIdOf(overseer, problems);
  const startedAt = requiredTextOf(overseer, 'startedAt', 'overseer.startedAt', 'text', problems);
  const tokenPath = optionalTextOf(overseer, 'tokenPath', 'overseer.tokenPath', 'absolute-path', problems);
  if (url === null || processId === null || startedAt === null) return null;
  return {
    url,
    processId,
    startedAt,
    tokenPath,
  };
}

function registeredForgeOf(trackerId: string, entryValue: unknown): { forge: RegisteredForge } | { leftOut: LeftOutRegistryEntry } {
  const entry = JsonValueUtil.jsonObjectOf(entryValue);
  if (entry === null) return { leftOut: { trackerId, problems: [{ key: 'entry', reason: 'not-an-object' }] } };
  const problems: RegistryEntryProblem[] = trackerId === '' ? [{ key: 'trackerId', reason: 'empty' }] : [];
  const project  = requiredTextOf(entry, 'project', 'project', 'text', problems);
  const root     = requiredTextOf(entry, 'root', 'root', 'absolute-path', problems);
  const program  = optionalTextOf(entry, 'program', 'program', 'absolute-path', problems);
  const overseer = overseerOf(entry, problems);
  if (problems.length > 0 || project === null || root === null) return { leftOut: { trackerId, problems } };
  return {
    forge: {
      trackerId,
      project,
      root,
      program,
      overseer,
      lastCommand:   shownTextOf(entry, 'lastCommand'),
      lastChangedAt: shownTextOf(entry, 'lastChangedAt'),
    },
  };
}

function registeredForgesOf(entries: JsonObject): RegistryEntriesMapping {
  const forges: RegisteredForge[]              = [];
  const leftOutEntries: LeftOutRegistryEntry[] = [];
  for (const [trackerId, entryValue] of Object.entries(entries)) {
    const mapped = registeredForgeOf(trackerId, entryValue);
    if ('forge' in mapped) forges.push(mapped.forge);
    else leftOutEntries.push(mapped.leftOut);
  }
  return { forges, leftOutEntries };
}

export const RegistryMapUtil = { registeredForgesOf, } as const;
