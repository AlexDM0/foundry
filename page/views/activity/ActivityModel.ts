/**
 * What the Activity view shows of a fleet document under its two filters: the entries in the document's own order, newest first, each with
 * its forge, its category and the forge's text unedited; the forge choices, the first three as segments and the rest in a menu; today's
 * landings and tokens per forge that reports them; the usage line the forges report; and the page title's figures. A value no forge reports
 * is absent, never zero.
 */
import type {
  FleetDocument,
  FleetDocumentActivityCategory,
  FleetDocumentFleetActivityEntry,
  FleetDocumentForge,
  FleetDocumentUsage,
} from '../../@types/FleetDocument.ts';
import type { PageFigure } from '../../design-system/PageTitle.tsx';
import type { DotRole }    from '../../design-system/RoleDot.tsx';
import { ForgeTextUtil }   from '../../shared/utils/ForgeTextUtil.ts';
import { HashRouter }      from '../../shell/HashRouter.ts';

export type ActivityKindFilter = 'everything' | FleetDocumentActivityCategory;

export interface ActivityFilters {
  readonly kind:      ActivityKindFilter;
  /** `null` for every forge. */
  readonly trackerId: string | null;
}

export interface ActivityRow {
  readonly key:          string;
  readonly at:           string;
  readonly clockTime:    string;
  readonly project:      string;
  readonly categoryWord: string;
  /** `null` for an agent's entry whose job the forge no longer reports, so its role is not known. */
  readonly dotRole:      DotRole | null;
  readonly text:         string;
  /** `null` for an entry the forge gives no route. */
  readonly href:         string | null;
}

export interface ForgeChoice {
  readonly trackerId: string;
  readonly project:   string;
}

export interface ForgeChoices {
  readonly segments: readonly ForgeChoice[];
  readonly inMenu:   readonly ForgeChoice[];
  /** The chosen forge, or `null` for every forge; a forge that left the document is no longer chosen. */
  readonly chosen:   string | null;
}

export interface TodayRow {
  readonly trackerId: string;
  readonly project:   string;
  readonly valueText: string;
  /** `null` when no forge reports more than zero, so there is nothing to compare. */
  readonly meter:     { readonly used: number; readonly whole: number; readonly label: string } | null;
}

export interface TodayList {
  /** `null` when no forge reports the value. */
  readonly totalText: string | null;
  readonly rows:      readonly TodayRow[];
}

/** The kinds whose segment counts its entries, as the artboard counts them. */
export type CountedKind = 'needs-user' | 'landed';

export interface ActivityContent {
  readonly rows:                 readonly ActivityRow[];
  /** The entries of each counted kind under the chosen forge, whatever kind is chosen. */
  readonly kindCounts:           Readonly<Record<CountedKind, number>>;
  /** What the table's place says when it holds no row; `null` when it holds one. */
  readonly emptySentence:        string | null;
  readonly forgeChoices:         ForgeChoices;
  readonly landedToday:          TodayList;
  readonly tokensToday:          TodayList;
  /** One line per distinct usage reading; the usage limit is the machine's, so every forge normally reports the same. */
  readonly usageLines:           readonly string[];
  /** The lines of a forge that hit its limit, so their dot can say so beside the words. */
  readonly usageLinesAtTheLimit: readonly string[];
}

export const EVERY_ENTRY: ActivityFilters = { kind: 'everything', trackerId: null };

export const KIND_FILTER_LABELS: Readonly<Record<ActivityKindFilter, string>> = {
  'everything': 'Everything',
  'needs-user': 'Needs you',
  'landed':     'Landed',
  'agent':      'Agents',
  'forge':      'Forge',
};

export const KIND_FILTERS: readonly ActivityKindFilter[] = ['everything', 'needs-user', 'landed', 'agent', 'forge'];

const CATEGORY_WORDS: Readonly<Record<FleetDocumentActivityCategory, string>> = {
  'needs-user': 'Needs you',
  'landed':     'Landed',
  'agent':      'Agent',
  'forge':      'Forge',
};

const FORGE_SEGMENTS_SHOWN = 3;

const ONE_THOUSAND = 1_000;
const ONE_MILLION = 1_000_000;
const SIGNIFICANT_DIGITS_OF_A_TOKEN_COUNT = 3;

const NO_ACTIVITY_SENTENCE = 'No forge has reported activity yet.';
const NOTHING_MATCHES_SENTENCE = 'No entry matches these filters.';

/** A clock time in the page's own time zone, or the one named, so a spec does not depend on the machine's. */
function clockFormatOf(timeZone: string | undefined): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return new Intl.DateTimeFormat('en-GB', timeZone === undefined ? options : { ...options, timeZone });
}

/** A stamp that does not parse is shown as the forge wrote it. */
function clockTimeOf(stamp: string, clockFormat: Intl.DateTimeFormat): string {
  const instant = Date.parse(stamp);
  return Number.isNaN(instant) ? stamp : clockFormat.format(instant);
}

function roundedToTokenCountDigitsOf(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS_OF_A_TOKEN_COUNT));
}

/** 146000 as `146k`, 1240000 as `1.24M`: three significant digits, as the artboard writes a token count. */
function tokenCountTextOf(tokens: number): string {
  if (tokens < ONE_THOUSAND) return String(tokens);
  const thousands = roundedToTokenCountDigitsOf(tokens / ONE_THOUSAND);
  if (thousands < ONE_THOUSAND) return `${thousands}k`;
  return `${roundedToTokenCountDigitsOf(tokens / ONE_MILLION)}M`;
}

function projectsByTrackerIdOf(fleetDocument: FleetDocument): ReadonlyMap<string, string> {
  return new Map(fleetDocument.forges.map((forge) => [forge.trackerId, forge.project]));
}

/** An agent's entry and the job it names carry the same route, so the job's role gives the dot while the forge still reports the job. */
function dotRoleOf(entry: FleetDocumentFleetActivityEntry, forge: FleetDocumentForge | undefined): DotRole | null {
  switch (entry.category) {
    case 'needs-user':
      return 'needs-user';
    case 'landed':
      return 'landed';
    case 'forge':
      return 'forge';
    case 'agent': {
      const role = entry.route === null ? null : forge?.agents.find((agent) => agent.route === entry.route)?.role ?? null;
      return role === 'builder' || role === 'reviewer' ? role : null;
    }
  }
}

function forgeChoicesOf(fleetDocument: FleetDocument, chosenTrackerId: string | null): ForgeChoices {
  const trackerIdsWithEntries = new Set(fleetDocument.activity.map((entry) => entry.trackerId));
  const choices = fleetDocument.forges
    .filter((forge) => trackerIdsWithEntries.has(forge.trackerId))
    .map((forge) => ({ trackerId: forge.trackerId, project: forge.project }));
  const chosenIsOffered = choices.some((choice) => choice.trackerId === chosenTrackerId);
  return {
    segments: choices.slice(0, FORGE_SEGMENTS_SHOWN),
    inMenu:   choices.slice(FORGE_SEGMENTS_SHOWN),
    chosen:   chosenIsOffered ? chosenTrackerId : null,
  };
}

function entryIsKept(entry: FleetDocumentFleetActivityEntry, kind: ActivityKindFilter, trackerId: string | null): boolean {
  return (kind === 'everything' || entry.category === kind) && (trackerId === null || entry.trackerId === trackerId);
}

function rowsOf(fleetDocument: FleetDocument, kind: ActivityKindFilter, trackerId: string | null, clockFormat: Intl.DateTimeFormat): ActivityRow[] {
  const projects = projectsByTrackerIdOf(fleetDocument);
  const forges = new Map(fleetDocument.forges.map((forge) => [forge.trackerId, forge]));
  return fleetDocument.activity
    .filter((entry) => entryIsKept(entry, kind, trackerId))
    .map((entry) => ({
      key:          `${entry.trackerId}:${entry.logPosition}`,
      at:           entry.at,
      clockTime:    clockTimeOf(entry.at, clockFormat),
      project:      projects.get(entry.trackerId) ?? entry.trackerId,
      categoryWord: CATEGORY_WORDS[entry.category],
      dotRole:      dotRoleOf(entry, forges.get(entry.trackerId)),
      text:         entry.text,
      href:         entry.route === null ? null : HashRouter.fragmentOf({ view: 'forge', trackerId: entry.trackerId, bridgeFragment: entry.route }),
    }));
}

function todayListOf(
  fleetDocument: FleetDocument,
  valueOf: (today: NonNullable<FleetDocumentForge['today']>) => number,
  textOf: (value: number) => string,
  meterLabelOf: (project: string, valueText: string) => string,
): TodayList {
  const reported = fleetDocument.forges.flatMap((forge) => (forge.today === null ? [] : [{ forge, value: valueOf(forge.today) }]));
  if (reported.length === 0) return { totalText: null, rows: [] };
  const largest = Math.max(...reported.map(({ value }) => value));
  const total = reported.reduce((sum, { value }) => sum + value, 0);
  return {
    totalText: textOf(total),
    rows:      reported.map(({ forge, value }) => ({
      trackerId: forge.trackerId,
      project:   forge.project,
      valueText: textOf(value),
      meter:     largest === 0 ? null : { used: value, whole: largest, label: meterLabelOf(forge.project, textOf(value)) },
    })),
  };
}

function usageLinesOf(fleetDocument: FleetDocument, clockFormat: Intl.DateTimeFormat, usageIsKept: (usage: FleetDocumentUsage) => boolean): string[] {
  const lines = fleetDocument.forges.flatMap((forge) => (forge.usage === null || !usageIsKept(forge.usage)
    ? []
    : [ForgeTextUtil.usageTextOf(forge.usage, (stamp) => clockTimeOf(stamp, clockFormat))]));
  return [...new Set(lines)];
}

/** A forge reports a reset time only for the window that hit its limit. */
function limitIsHit(usage: FleetDocumentUsage): boolean {
  return usage.resetsAt !== null;
}

function kindCountsOf(fleetDocument: FleetDocument, trackerId: string | null): Record<CountedKind, number> {
  const countOf = (kind: CountedKind) => fleetDocument.activity.filter((entry) => entryIsKept(entry, kind, trackerId)).length;
  return { 'needs-user': countOf('needs-user'), 'landed': countOf('landed') };
}

function emptySentenceOf(fleetDocument: FleetDocument, rows: readonly ActivityRow[]): string | null {
  if (rows.length > 0) return null;
  return fleetDocument.activity.length === 0 ? NO_ACTIVITY_SENTENCE : NOTHING_MATCHES_SENTENCE;
}

function activityContentOf(fleetDocument: FleetDocument, filters: ActivityFilters, timeZone?: string): ActivityContent {
  const clockFormat = clockFormatOf(timeZone);
  const forgeChoices = forgeChoicesOf(fleetDocument, filters.trackerId);
  const rows = rowsOf(fleetDocument, filters.kind, forgeChoices.chosen, clockFormat);
  return {
    rows,
    kindCounts:           kindCountsOf(fleetDocument, forgeChoices.chosen),
    emptySentence:        emptySentenceOf(fleetDocument, rows),
    forgeChoices,
    landedToday:          landedTodayOf(fleetDocument),
    tokensToday:          tokensTodayOf(fleetDocument),
    usageLines:           usageLinesOf(fleetDocument, clockFormat, () => true),
    usageLinesAtTheLimit: usageLinesOf(fleetDocument, clockFormat, limitIsHit),
  };
}

function landedTodayOf(fleetDocument: FleetDocument): TodayList {
  return todayListOf(fleetDocument, (today) => today.deliveredTickets, String, (project, valueText) => `${project}: ${valueText} landed today`);
}

function tokensTodayOf(fleetDocument: FleetDocument): TodayList {
  return todayListOf(fleetDocument, (today) => today.tokens, tokenCountTextOf, (project, valueText) => `${project}: ${valueText} tokens today`);
}

/** What waits on User, with `+` while a forge is not fully read, then today's landings and tokens, each only when a forge reports today. */
function titleFiguresOf(fleetDocument: FleetDocument): PageFigure[] {
  const { waitingOnUser, incompleteFor } = fleetDocument.figures;
  const landedTotal = landedTodayOf(fleetDocument).totalText;
  const tokensTotal = tokensTodayOf(fleetDocument).totalText;
  return [
    { value: `${waitingOnUser}${incompleteFor.length > 0 ? '+' : ''}`, label: 'need you', attention: true },
    ...(landedTotal === null ? [] : [{ value: landedTotal, label: 'landed today' }]),
    ...(tokensTotal === null ? [] : [{ value: tokensTotal, label: 'tokens today' }]),
  ];
}

export const ActivityModel = {
  activityContentOf,
  titleFiguresOf,
  tokenCountTextOf,
} as const;
