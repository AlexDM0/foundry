/**
 * Validates and maps the entries of the registry `projects.json` to `RegisteredForge`s, in the registry's order. An entry whose required
 * key fails is left out; an optional key that fails reads as `null`. Every key is read as the entry's own, never through its prototype.
 */
import { isAbsolute } from 'node:path';

import { JsonValueUtil, type JsonObject }                                            from '../../../lib/json-value/JsonValueUtil.ts';
import type { ForgeCrashSummary, ForgeRegistryPresence, ForgeRegistryPresenceState } from '../../../shared/@types/ForgePresence.ts';
import type { RegisteredForge, RegisteredOverseer }                                  from '../@types/RegisteredForge.ts';

type TextRule = 'text' | 'absolute-path' | 'http-address';

const HTTP_PROTOCOL = 'http:';

function textIsHttpAddress(text: string): boolean {
  return URL.canParse(text) && new URL(text).protocol === HTTP_PROTOCOL;
}

/** The key's text when it holds to its rule; `null` for one that is absent, `null`, empty or breaks the rule. */
function textOf(record: JsonObject, field: string, rule: TextRule): string | null {
  const value = JsonValueUtil.ownValueOf(record, field);
  if (typeof value !== 'string' || value === '') return null;
  if (rule === 'absolute-path' && !isAbsolute(value)) return null;
  if (rule === 'http-address' && !textIsHttpAddress(value)) return null;
  return value;
}

function processIdOf(record: JsonObject): number | null {
  const value = JsonValueUtil.ownValueOf(record, 'processId');
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** An absent or `null` overseer is a forge with no live Overseer, and so is one that is not whole. */
function overseerOf(entry: JsonObject): RegisteredOverseer | null {
  const overseer = JsonValueUtil.jsonObjectOf(JsonValueUtil.ownValueOf(entry, 'overseer'));
  if (overseer === null) return null;
  const url       = textOf(overseer, 'url', 'http-address');
  const processId = processIdOf(overseer);
  const startedAt = textOf(overseer, 'startedAt', 'text');
  if (url === null || processId === null || startedAt === null) return null;
  return {
    url,
    processId,
    startedAt,
    tokenPath: textOf(overseer, 'tokenPath', 'absolute-path'),
  };
}

const PRESENCE_STATES: ReadonlySet<unknown> = new Set<ForgeRegistryPresenceState>(['serving', 'stopped', 'handed-over', 'crashed']);
const CRASHED_COMPONENTS: ReadonlySet<unknown> = new Set<ForgeCrashSummary['component']>(['overseer', 'talos']);

function isPresenceState(value: unknown): value is ForgeRegistryPresenceState {
  return PRESENCE_STATES.has(value);
}

function isCrashedComponent(value: unknown): value is ForgeCrashSummary['component'] {
  return CRASHED_COMPONENTS.has(value);
}

function generationOf(record: JsonObject): number | null {
  const value = JsonValueUtil.ownValueOf(record, 'generation');
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A summary without its component or whether it is suspected is no summary; an error's name or message may be missing. */
function crashSummaryOf(presence: JsonObject): ForgeCrashSummary | null {
  const crash = JsonValueUtil.jsonObjectOf(JsonValueUtil.ownValueOf(presence, 'crash'));
  if (crash === null) return null;
  const component = JsonValueUtil.ownValueOf(crash, 'component');
  const suspected = JsonValueUtil.ownValueOf(crash, 'suspected');
  if (!isCrashedComponent(component) || typeof suspected !== 'boolean') return null;
  return {
    component,
    suspected,
    errorName:    textOf(crash, 'errorName', 'text'),
    errorMessage: textOf(crash, 'errorMessage', 'text'),
  };
}

/** A presence of a state Gaia does not know reads as none; a crashed one keeps its state when its summary is not whole. */
function presenceOf(entry: JsonObject): ForgeRegistryPresence | null {
  const presence = JsonValueUtil.jsonObjectOf(JsonValueUtil.ownValueOf(entry, 'presence'));
  if (presence === null) return null;
  const state = JsonValueUtil.ownValueOf(presence, 'state');
  if (!isPresenceState(state)) return null;
  return {
    state,
    generation: generationOf(presence),
    at:         textOf(presence, 'at', 'text'),
    crash:      state === 'crashed' ? crashSummaryOf(presence) : null,
  };
}

function registeredForgeOf(trackerId: string, entryValue: unknown): RegisteredForge | null {
  const entry = JsonValueUtil.jsonObjectOf(entryValue);
  if (entry === null || trackerId === '') return null;
  const project = textOf(entry, 'project', 'text');
  const root    = textOf(entry, 'root', 'absolute-path');
  if (project === null || root === null) return null;
  return {
    trackerId,
    project,
    root,
    program:       textOf(entry, 'program', 'absolute-path'),
    overseer:      overseerOf(entry),
    lastCommand:   textOf(entry, 'lastCommand', 'text'),
    lastChangedAt: textOf(entry, 'lastChangedAt', 'text'),
    presence:      presenceOf(entry),
  };
}

function registeredForgesOf(entries: JsonObject): readonly RegisteredForge[] {
  const forges: RegisteredForge[] = [];
  for (const [trackerId, entryValue] of Object.entries(entries)) {
    const forge = registeredForgeOf(trackerId, entryValue);
    if (forge !== null) forges.push(forge);
  }
  return forges;
}

export const RegistryMapUtil = { registeredForgesOf } as const;
