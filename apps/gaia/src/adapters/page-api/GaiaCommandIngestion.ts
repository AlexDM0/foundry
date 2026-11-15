/**
 * The ingestion of the page's command body (`POST /api/commands`, PLAN 6.3): parse, check `commandVersion` against `CONTRACT_VERSIONS`,
 * check the keys of its kind, map to the internal `GaiaCommand`. Every key is read as the body's own. The page and the server ship
 * together, so another version means a stale page.
 */
import { isAbsolute } from 'node:path';

import type { CommandKind }               from '../../../page/@types/CommandDocument.ts';
import { JsonValueUtil, type JsonObject } from '../../lib/json-value/JsonValueUtil.ts';
import type {
  ForgeCommand,
  ForgeStopAgents,
  GaiaCommand,
  PathChoiceTarget,
  SettingsChange,
} from '../../shared/@types/GaiaCommand.ts';
import type {
  GaiaSettings,
  NotificationKind,
  NotificationSettings,
  ThemeChoice,
} from '../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS }   from '../../shared/constants/ContractVersions.ts';
import { SETTINGS_CHOICES }    from '../../shared/constants/SettingsChoices.ts';
import { ContractVersionUtil } from '../../shared/utils/ContractVersionUtil.ts';

/**
 * `other-version`: `commandVersion` is not the known number, `null` when it is absent or no whole number. `unknown-kind`: a kind this
 * Gaia does not carry out, `null` when the body names none. `malformed`: a key the kind needs is missing or holds another type.
 */
export type GaiaCommandReading =
  | { readonly verdict: 'readable'; readonly command: GaiaCommand }
  | { readonly verdict: 'not-json' }
  | { readonly verdict: 'not-a-json-object' }
  | { readonly verdict: 'other-version'; readonly commandVersion: number | null }
  | { readonly verdict: 'unknown-kind'; readonly kind: string | null }
  | { readonly verdict: 'malformed'; readonly invalidKeys: readonly string[] };

type SingleForgeKind = Exclude<ForgeCommand['kind'], 'forge-stop' | 'forge-concurrency-set'>;

const VERSION_KEYS = { majorKey: 'commandVersion' } as const;
const KIND_KEY = 'kind';
const TRACKER_ID_KEY = 'trackerId';
const AGENTS_KEY = 'agents';
const LIMIT_KEY = 'limit';
const ROOT_KEY = 'root';
const PROJECT_KEY = 'project';
const SETTINGS_KEY_KEY = 'key';
const SETTINGS_VALUE_KEY = 'value';
const PATH_CHOICE_TARGET_KEY = 'what';

const SINGLE_FORGE_KINDS: ReadonlySet<string> = new Set<SingleForgeKind>([
  'forge-start',
  'forge-pause',
  'forge-resume',
  'forge-restart',
  'forge-update',
  'forge-open-in-browser',
  'forge-hide',
  'forge-unhide',
  'forge-brain-start',
  'forge-brain-stop',
] satisfies readonly CommandKind[]);

const STOP_AGENTS: ReadonlySet<unknown> = new Set<ForgeStopAgents>(['keep', 'stop-first']);
const PATH_CHOICE_TARGETS: ReadonlySet<unknown> = new Set<PathChoiceTarget>(['folder', 'file']);
const THEME_CHOICES: ReadonlySet<unknown> = new Set<ThemeChoice>(SETTINGS_CHOICES.themes);
const SETTINGS_KEYS: ReadonlySet<unknown> = new Set<keyof GaiaSettings>(['theme', 'hiddenTrackerIds', 'forgeProgramPath', 'notifications', 'startForgesAtLogin']);

function nonEmptyTextOf(body: JsonObject, key: string): string | null {
  const value = JsonValueUtil.ownValueOf(body, key);
  return typeof value === 'string' && value !== '' ? value : null;
}

function trackerIdOf(body: JsonObject): string | null {
  return nonEmptyTextOf(body, TRACKER_ID_KEY);
}

/** A limit counts agents, so it is a whole number of at least one; which ceiling it may reach is the forge's to say. */
function limitOf(body: JsonObject): number | null {
  const limit = JsonValueUtil.ownValueOf(body, LIMIT_KEY);
  return typeof limit === 'number' && Number.isSafeInteger(limit) && limit >= 1 ? limit : null;
}

/** A path the server runs a program in, so it never depends on the folder the server itself runs in. */
function absolutePathOf(body: JsonObject, key: string): string | null {
  const path = nonEmptyTextOf(body, key);
  return path !== null && isAbsolute(path) ? path : null;
}

function isSingleForgeKind(kind: string): kind is SingleForgeKind {
  return SINGLE_FORGE_KINDS.has(kind);
}

function isStopAgents(value: unknown): value is ForgeStopAgents {
  return STOP_AGENTS.has(value);
}

function isPathChoiceTarget(value: unknown): value is PathChoiceTarget {
  return PATH_CHOICE_TARGETS.has(value);
}

function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.has(value);
}

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry !== '');
}

function notificationSettingsOf(value: unknown): NotificationSettings | null {
  const notifications = JsonValueUtil.jsonObjectOf(value);
  if (notifications === null) return null;
  const enabled = JsonValueUtil.ownValueOf(notifications, 'enabled');
  const kinds   = JsonValueUtil.jsonObjectOf(JsonValueUtil.ownValueOf(notifications, 'kinds'));
  if (typeof enabled !== 'boolean' || kinds === null) return null;
  const choices: Partial<Record<NotificationKind, boolean>> = {};
  for (const kind of SETTINGS_CHOICES.notificationKinds) {
    const choice = JsonValueUtil.ownValueOf(kinds, kind);
    if (typeof choice !== 'boolean') return null;
    choices[kind] = choice;
  }
  return { enabled, kinds: choices as Record<NotificationKind, boolean> };
}

/** The value checked against the type its settings key holds. */
function settingsChangeOf(settingsKey: keyof GaiaSettings, value: unknown): SettingsChange | null {
  switch (settingsKey) {
    case 'theme':
      return isThemeChoice(value) ? { key: 'theme', value } : null;
    case 'hiddenTrackerIds':
      return isTextList(value) ? { key: 'hiddenTrackerIds', value: [...value] } : null;
    case 'forgeProgramPath': {
      if (value === null) return { key: 'forgeProgramPath', value };
      return typeof value === 'string' && isAbsolute(value) ? { key: 'forgeProgramPath', value } : null;
    }
    case 'notifications': {
      const notifications = notificationSettingsOf(value);
      return notifications === null ? null : { key: 'notifications', value: notifications };
    }
    case 'startForgesAtLogin':
      return typeof value === 'boolean' ? { key: 'startForgesAtLogin', value } : null;
  }
}

/** Names each key that holds no valid value, in the order the kind lists its keys. */
function malformedReadingOf(keysAndWhetherValid: readonly (readonly [string, boolean])[]): GaiaCommandReading {
  return { verdict: 'malformed', invalidKeys: keysAndWhetherValid.filter(([, isValid]) => !isValid).map(([key]) => key) };
}

function forgeStopReadingOf(body: JsonObject): GaiaCommandReading {
  const trackerId = trackerIdOf(body);
  const agents    = JsonValueUtil.ownValueOf(body, AGENTS_KEY);
  if (trackerId === null || !isStopAgents(agents)) return malformedReadingOf([[TRACKER_ID_KEY, trackerId !== null], [AGENTS_KEY, isStopAgents(agents)]]);
  return { verdict: 'readable', command: { kind: 'forge-stop', trackerId, agents } };
}

function forgeConcurrencySetReadingOf(body: JsonObject): GaiaCommandReading {
  const trackerId = trackerIdOf(body);
  const limit     = limitOf(body);
  if (trackerId === null || limit === null) return malformedReadingOf([[TRACKER_ID_KEY, trackerId !== null], [LIMIT_KEY, limit !== null]]);
  return { verdict: 'readable', command: { kind: 'forge-concurrency-set', trackerId, limit } };
}

function forgeAddReadingOf(body: JsonObject): GaiaCommandReading {
  const root    = absolutePathOf(body, ROOT_KEY);
  const project = nonEmptyTextOf(body, PROJECT_KEY);
  if (root === null || project === null) return malformedReadingOf([[ROOT_KEY, root !== null], [PROJECT_KEY, project !== null]]);
  return { verdict: 'readable', command: { kind: 'forge-add', root, project } };
}

function machineAgentLimitSetReadingOf(body: JsonObject): GaiaCommandReading {
  const limit = limitOf(body);
  if (limit === null) return { verdict: 'malformed', invalidKeys: [LIMIT_KEY] };
  return { verdict: 'readable', command: { kind: 'machine-agent-limit-set', limit } };
}

function isSettingsKey(value: unknown): value is keyof GaiaSettings {
  return SETTINGS_KEYS.has(value);
}

function settingsSetReadingOf(body: JsonObject): GaiaCommandReading {
  const settingsKey = JsonValueUtil.ownValueOf(body, SETTINGS_KEY_KEY);
  if (!isSettingsKey(settingsKey)) return { verdict: 'malformed', invalidKeys: [SETTINGS_KEY_KEY] };
  const change = settingsChangeOf(settingsKey, JsonValueUtil.ownValueOf(body, SETTINGS_VALUE_KEY));
  if (change === null) return { verdict: 'malformed', invalidKeys: [SETTINGS_VALUE_KEY] };
  return { verdict: 'readable', command: { kind: 'settings-set', change } };
}

function pathChooseReadingOf(body: JsonObject): GaiaCommandReading {
  const what = JsonValueUtil.ownValueOf(body, PATH_CHOICE_TARGET_KEY);
  if (!isPathChoiceTarget(what)) return { verdict: 'malformed', invalidKeys: [PATH_CHOICE_TARGET_KEY] };
  return { verdict: 'readable', command: { kind: 'path-choose', what } };
}

function commandReadingOf(body: JsonObject, kind: string): GaiaCommandReading {
  switch (kind) {
    case 'fleet-look-again':
      return { verdict: 'readable', command: { kind } };
    case 'forge-stop':
      return forgeStopReadingOf(body);
    case 'forge-concurrency-set':
      return forgeConcurrencySetReadingOf(body);
    case 'forge-add':
      return forgeAddReadingOf(body);
    case 'machine-agent-limit-set':
      return machineAgentLimitSetReadingOf(body);
    case 'settings-set':
      return settingsSetReadingOf(body);
    case 'path-choose':
      return pathChooseReadingOf(body);
  }
  if (!isSingleForgeKind(kind)) return { verdict: 'unknown-kind', kind };
  const trackerId = trackerIdOf(body);
  if (trackerId === null) return { verdict: 'malformed', invalidKeys: [TRACKER_ID_KEY] };
  return { verdict: 'readable', command: { kind, trackerId } };
}

export class GaiaCommandIngestion {
  readonly #bodyText: string;

  public constructor(bodyText: string) {
    this.#bodyText = bodyText;
  }

  public read(): GaiaCommandReading {
    const parsing = JsonValueUtil.parsedValueOf(this.#bodyText);
    if (parsing === null) return { verdict: 'not-json' };
    const body = JsonValueUtil.jsonObjectOf(parsing.parsed);
    if (body === null) return { verdict: 'not-a-json-object' };
    const versionReading = ContractVersionUtil.versionOf(body, VERSION_KEYS);
    const commandVersion = versionReading.verdict === 'versioned' ? versionReading.version.major : null;
    if (commandVersion === null || ContractVersionUtil.majorVerdictOf(commandVersion, CONTRACT_VERSIONS.gaiaCommand) !== 'known') {
      return { verdict: 'other-version', commandVersion };
    }
    const kind = JsonValueUtil.ownValueOf(body, KIND_KEY);
    if (typeof kind !== 'string') return { verdict: 'unknown-kind', kind: null };
    return commandReadingOf(body, kind);
  }
}
