/**
 * What the Activity view shows of a fleet document under its two filters: the entries in the document's own order, newest first, each with
 * its forge, its category and the forge's text unedited; the forge choices, the first three as segments and the rest in a menu; today's
 * landings and tokens per forge that reports them, the usage line the forges report; and the
 * page title's figures. A value no forge reports is absent, never zero.
 */
import type {
  FleetDocument,
  FleetDocumentActivityCategory,
  FleetDocumentFleetActivityEntry,
  FleetDocumentForge,
  FleetDocumentUsage,
} from '../../@types/FleetDocument.ts';
import type { DotRole }       from '../../design-system/RoleDot.tsx';
import type { ClockReading }  from '../../shared/@types/ClockReading.ts';
import type { PageFigure }    from '../../shared/@types/ViewParts.ts';
import { HashRouter }         from '../../shared/HashRouter.ts';
import { ACTIVITY_SENTENCES } from '../../shared/constants/ActivitySentences.ts';
import { CountTextUtil }      from '../../shared/utils/CountTextUtil.ts';
import { ForgeTextUtil }      from '../../shared/utils/ForgeTextUtil.ts';
import { StampTextUtil }      from '../../shared/utils/StampTextUtil.ts';

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

const NOTHING_MATCHES_SENTENCE = 'No entry matches these filters.';

/** A clock time, with its month and day when it is of another day than the clock's; a stamp that does not parse is shown as the forge wrote it. */
function clockTimeOf(stamp: string, clock: ClockReading): string {
  return StampTextUtil.clockTextOf(stamp, clock.nowEpochMilliseconds, clock.timeZone) ?? stamp;
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
      const { boardRoute } = entry;
      const role = boardRoute === null ? null : forge?.agents.find((agent) => agent.boardRoute?.tab === boardRoute.tab && agent.boardRoute.item === boardRoute.item)?.role ?? null;
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

function rowsOf(fleetDocument: FleetDocument, kind: ActivityKindFilter, trackerId: string | null, clock: ClockReading): ActivityRow[] {
  const projects = projectsByTrackerIdOf(fleetDocument);
  const forges = new Map(fleetDocument.forges.map((forge) => [forge.trackerId, forge]));
  return fleetDocument.activity
    .filter((entry) => entryIsKept(entry, kind, trackerId))
    .map((entry) => ({
      key:          `${entry.trackerId}:${entry.logPosition}`,
      at:           entry.at,
      clockTime:    clockTimeOf(entry.at, clock),
      project:      projects.get(entry.trackerId) ?? entry.trackerId,
      categoryWord: CATEGORY_WORDS[entry.category],
      dotRole:      dotRoleOf(entry, forges.get(entry.trackerId)),
      text:         entry.text,
      href:         entry.boardRoute === null ? null : HashRouter.fragmentOf({ view: 'forge', trackerId: entry.trackerId, boardRoute: entry.boardRoute }),
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

function usageLinesOf(fleetDocument: FleetDocument, clock: ClockReading, usageIsKept: (usage: FleetDocumentUsage) => boolean): string[] {
  const lines = fleetDocument.forges.flatMap((forge) => (forge.usage === null || !usageIsKept(forge.usage)
    ? []
    : [ForgeTextUtil.usageTextOf(forge.usage, (stamp) => clockTimeOf(stamp, clock))]));
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
  return fleetDocument.activity.length === 0 ? ACTIVITY_SENTENCES.noActivity : NOTHING_MATCHES_SENTENCE;
}

function activityContentOf(fleetDocument: FleetDocument, filters: ActivityFilters, clock: ClockReading): ActivityContent {
  const forgeChoices = forgeChoicesOf(fleetDocument, filters.trackerId);
  const rows = rowsOf(fleetDocument, filters.kind, forgeChoices.chosen, clock);
  return {
    rows,
    kindCounts:           kindCountsOf(fleetDocument, forgeChoices.chosen),
    emptySentence:        emptySentenceOf(fleetDocument, rows),
    forgeChoices,
    landedToday:          landedTodayOf(fleetDocument),
    tokensToday:          tokensTodayOf(fleetDocument),
    usageLines:           usageLinesOf(fleetDocument, clock, () => true),
    usageLinesAtTheLimit: usageLinesOf(fleetDocument, clock, limitIsHit),
  };
}

function landedTodayOf(fleetDocument: FleetDocument): TodayList {
  return todayListOf(fleetDocument, (today) => today.deliveredTickets, String, (project, valueText) => `${project}: ${valueText} landed today`);
}

function tokensTodayOf(fleetDocument: FleetDocument): TodayList {
  return todayListOf(fleetDocument, (today) => today.tokens, CountTextUtil.shortCountTextOf, (project, valueText) => `${project}: ${valueText} tokens today`);
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
} as const;
