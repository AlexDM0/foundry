/**
 * The ingestion of the page's command body (`POST /api/commands`, PLAN 6.3): parse, check `commandVersion` against `CONTRACT_VERSIONS`,
 * check the keys of its kind, map to the internal `GaiaCommand`. Every key is read as the body's own. The page and the server ship
 * together, so another version means a stale page.
 */
import type { CommandKind }                                from '../../../page/@types/CommandDocument.ts';
import type { ForgeCommand, ForgeStopAgents, GaiaCommand } from '../../shared/@types/GaiaCommand.ts';
import { CONTRACT_VERSIONS }                               from '../../shared/constants/ContractVersions.ts';

/**
 * `other-version`: `commandVersion` is not the known number, `null` when it is absent or no number. `unknown-kind`: a kind this Gaia does
 * not carry out, `null` when the body names none. `malformed`: a key the kind needs is missing or holds another type.
 */
export type GaiaCommandReading =
  | { readonly verdict: 'readable'; readonly command: GaiaCommand }
  | { readonly verdict: 'not-json' }
  | { readonly verdict: 'not-a-json-object' }
  | { readonly verdict: 'other-version'; readonly commandVersion: number | null }
  | { readonly verdict: 'unknown-kind'; readonly kind: string | null }
  | { readonly verdict: 'malformed'; readonly invalidKeys: readonly string[] };

type JsonObject = Readonly<Record<string, unknown>>;

type SingleForgeKind = Exclude<ForgeCommand['kind'], 'forge-stop'>;

const VERSION_KEY = 'commandVersion';
const KIND_KEY = 'kind';
const TRACKER_ID_KEY = 'trackerId';
const AGENTS_KEY = 'agents';

const SINGLE_FORGE_KINDS: ReadonlySet<string> = new Set<SingleForgeKind>([
  'forge-start',
  'forge-pause',
  'forge-resume',
  'forge-restart',
  'forge-update',
  'forge-open-in-browser',
] satisfies readonly CommandKind[]);

const STOP_AGENTS: ReadonlySet<unknown> = new Set<ForgeStopAgents>(['keep', 'stop-first']);

function parsedValueOf(bodyText: string): { readonly parsed: unknown } | null {
  try {
    return { parsed: JSON.parse(bodyText) as unknown };
  } catch {
    return null;
  }
}

function jsonObjectOf(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : null;
}

/** `undefined` for a key the body does not hold as its own. */
function ownValueOf(body: JsonObject, key: string): unknown {
  return Object.hasOwn(body, key) ? body[key] : undefined;
}

function trackerIdOf(body: JsonObject): string | null {
  const trackerId = ownValueOf(body, TRACKER_ID_KEY);
  return typeof trackerId === 'string' && trackerId !== '' ? trackerId : null;
}

function isSingleForgeKind(kind: string): kind is SingleForgeKind {
  return SINGLE_FORGE_KINDS.has(kind);
}

function isStopAgents(value: unknown): value is ForgeStopAgents {
  return STOP_AGENTS.has(value);
}

function forgeStopReadingOf(body: JsonObject): GaiaCommandReading {
  const trackerId = trackerIdOf(body);
  const agents    = ownValueOf(body, AGENTS_KEY);
  const invalidKeys = [
    ...(trackerId === null ? [TRACKER_ID_KEY] : []),
    ...(isStopAgents(agents) ? [] : [AGENTS_KEY]),
  ];
  if (trackerId === null || !isStopAgents(agents)) return { verdict: 'malformed', invalidKeys };
  return { verdict: 'readable', command: { kind: 'forge-stop', trackerId, agents } };
}

function commandReadingOf(body: JsonObject, kind: string): GaiaCommandReading {
  if (kind === 'fleet-look-again') return { verdict: 'readable', command: { kind } };
  if (kind === 'forge-stop') return forgeStopReadingOf(body);
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
    const parsing = parsedValueOf(this.#bodyText);
    if (parsing === null) return { verdict: 'not-json' };
    const body = jsonObjectOf(parsing.parsed);
    if (body === null) return { verdict: 'not-a-json-object' };
    const commandVersion = ownValueOf(body, VERSION_KEY);
    if (commandVersion !== CONTRACT_VERSIONS.gaiaCommand) return { verdict: 'other-version', commandVersion: typeof commandVersion === 'number' ? commandVersion : null };
    const kind = ownValueOf(body, KIND_KEY);
    if (typeof kind !== 'string') return { verdict: 'unknown-kind', kind: null };
    return commandReadingOf(body, kind);
  }
}
