/**
 * What the Attention view shows of a fleet document (SCREENS A1, B3, B4): the status line, the figures, what waits on User in the fleet's
 * own order, the forges that need a look with their actions, the running forges, the newest activity, and for a forge Gaia cannot read in
 * full, its banner and what Gaia reads of each forge. The page's clock only prints ages and clock times; no order reads it. A value the
 * document does not hold is absent, never zero.
 */
import type { CommandBody } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentAttentionKind,
  FleetDocumentCondition,
  FleetDocumentContracts,
  FleetDocumentFleetAttentionItem,
  FleetDocumentForge,
  FleetDocumentLook,
  FleetDocumentLookKind,
} from '../../@types/FleetDocument.ts';
import type { ButtonEmphasis, ButtonIcon } from '../../design-system/Button.tsx';
import type { CalloutTone }                from '../../design-system/Callout.tsx';
import type { DotCondition }               from '../../design-system/ConditionDot.tsx';
import type { PillTone }                   from '../../design-system/Pill.tsx';
import type { DotRole }                    from '../../design-system/RoleDot.tsx';
import { AddRepositoryForm }               from '../../shared/add-repository/AddRepositoryForm.ts';
import { ForgeContractUtil }               from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                   from '../../shared/utils/ForgeTextUtil.ts';
import { StampTextUtil }                   from '../../shared/utils/StampTextUtil.ts';
import { HashRouter }                      from '../../shell/HashRouter.ts';
import type { TopBarStatus }               from '../../shell/TopBar.tsx';

/** The page's clock as the model reads it: one reading and the time zone a clock time is printed in. */
export interface ClockReading {
  readonly nowEpochMilliseconds: number;
  readonly timeZone:             string | undefined;
}

export interface AttentionFigure {
  readonly value: string;
  readonly label: string;
}

/** One entry that waits on User. A row of an unreachable forge is stale: it can be read, not acted on. */
export interface AttentionRow {
  readonly key:           string;
  readonly trackerId:     string;
  readonly project:       string;
  readonly condition:     DotCondition;
  readonly conditionWord: string;
  readonly kindText:      string;
  readonly kindTone:      PillTone;
  readonly idText:        string;
  readonly subject:       string;
  readonly metaText:      string;
  readonly actionLabel:   string;
  readonly href:          string;
  readonly isStale:       boolean;
  readonly isPrimary:     boolean;
}

/** A callout's action: a command Gaia sends, or a place the page goes. A command its forge cannot be sent is shown, disabled. */
export type LookAction =
  | {
    readonly kind:           'command';
    readonly label:          string;
    readonly emphasis:       ButtonEmphasis;
    readonly icon:           ButtonIcon | null;
    readonly command:        CommandBody;
    readonly forgeAcceptsIt: boolean;
  }
  | { readonly kind: 'link'; readonly label: string; readonly emphasis: ButtonEmphasis; readonly href: string };

export interface LookCallout {
  readonly trackerId:   string;
  readonly lookKind:    FleetDocumentLookKind;
  readonly tone:        CalloutTone;
  readonly condition:   DotCondition;
  readonly project:     string;
  readonly word:        string;
  readonly sentence:    string;
  readonly machineLine: string | null;
  readonly actions:     readonly LookAction[];
}

export interface RunningJob {
  readonly jobId: string;
  readonly role:  DotRole;
  readonly text:  string;
}

export interface RunningCard {
  readonly trackerId:     string;
  readonly project:       string;
  readonly condition:     DotCondition;
  readonly conditionWord: string;
  readonly href:          string;
  readonly slotsText:     string | null;
  readonly jobs:          readonly RunningJob[];
  readonly waitingText:   string | null;
  readonly isStale:       boolean;
}

export interface RecentEntry {
  readonly key:       string;
  readonly clockText: string | null;
  readonly project:   string;
  readonly text:      string;
}

/** One forge in "What Gaia reads of each forge"; the totals cannot vouch for a forge the figures name as incomplete. */
export interface ForgeReadingLine {
  readonly trackerId:              string;
  readonly project:                string;
  readonly contractText:           string;
  readonly readingText:            string;
  readonly totalsCannotVouchForIt: boolean;
}

export interface UnreachableBanner {
  readonly trackerId:         string;
  readonly project:           string;
  readonly lastReportedClock: string | null;
}

/** A row of stacked figures under the bar; one line atop the main column while a forge is not fully read, so B3 fits the window. */
export type AttentionFiguresForm = 'row' | 'line';

export interface AttentionContent {
  readonly status:      TopBarStatus;
  readonly banners:     readonly UnreachableBanner[];
  readonly figures:     readonly AttentionFigure[];
  readonly figuresForm: AttentionFiguresForm;
  readonly waitingHead: string;
  readonly rows:        readonly AttentionRow[];
  /** What the list's place says when it holds no row. */
  readonly nothingText: string;
  readonly looksHead:   string;
  readonly looks:       readonly LookCallout[];
  readonly runningHead: string;
  readonly running:     readonly RunningCard[];
  readonly recent:      readonly RecentEntry[];
  /** `null` while Gaia reads every forge in full. */
  readonly readings:    readonly ForgeReadingLine[] | null;
}

/** B4: no forge is registered. The forge program is missing when the settings name none and Gaia found none. */
export interface NoForgeContent {
  readonly status:                TopBarStatus;
  readonly forgeProgramIsMissing: boolean;
}

export type AttentionScreen = { readonly kind: 'fleet'; readonly content: AttentionContent } | { readonly kind: 'no-forge'; readonly content: NoForgeContent };

const HEAD_SEPARATOR = ' · ';
const META_SEPARATOR = ' · ';
const RECENT_ENTRIES_SHOWN = 4;
const THOUSAND = 1_000;
const MILLION = 1_000_000;
const COMPACT_SIGNIFICANT_DIGITS = 3;

const NO_FORGE_STATUS: TopBarStatus = { condition: null, text: 'no forge on this machine yet' };

const EVERY_FORGE_HIDDEN_STATUS: TopBarStatus = { condition: null, text: 'every forge is hidden in Gaia' };

const KIND_TEXTS: Readonly<Record<FleetDocumentAttentionKind, string>> = {
  'escalated-question': 'Escalated',
  'question':           'Question',
  'draft-ticket':       'Draft',
  'filing-draft':       'Draft',
  'review':             'Review',
  'merge-accept':       'Accept',
};

/** The conditions under which a forge's Overseer runs. */
const RUNNING_CONDITIONS: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'passing-baton']);

const BATON_PASS_FAILED_WARNING_KIND = 'baton-pass-failed';
const NEW_CODE_NOTICE_KIND = 'new-code';

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

function visibleForgesOf(fleetDocument: FleetDocument): FleetDocumentForge[] {
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  return fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
}

function forgeInPlaceHrefOf(trackerId: string, bridgeFragment: string | null): string {
  return HashRouter.fragmentOf({ view: 'forge', trackerId, bridgeFragment });
}

function clockTextOf(stamp: string | null, clock: ClockReading): string | null {
  return stamp === null ? null : StampTextUtil.clockTextOf(stamp, clock.nowEpochMilliseconds, clock.timeZone);
}

/** The significant digits of a count, so a figure stays short: `1.24M`, `512k`, `840`. */
function compactCountOf(count: number): string {
  const thousands = Number((count / THOUSAND).toPrecision(COMPACT_SIGNIFICANT_DIGITS));
  if (count < THOUSAND) return String(count);
  if (thousands < THOUSAND) return `${thousands}k`;
  return `${Number((count / MILLION).toPrecision(COMPACT_SIGNIFICANT_DIGITS))}M`;
}

/** A clause of the status line, absent for a count of none. */
function clauseOf(count: number, singularPhrase: string, pluralPhrase = singularPhrase): string | null {
  return count === 0 ? null : countedPhrase(count, singularPhrase, pluralPhrase);
}

function statusOf(forges: readonly FleetDocumentForge[]): TopBarStatus {
  if (forges.length === 0) return NO_FORGE_STATUS;
  const countOf = (condition: FleetDocumentCondition): number => forges.filter((forge) => forge.condition === condition).length;
  const runningGroup = clauseOf(forges.filter((forge) => RUNNING_CONDITIONS.has(forge.condition)).length, 'forge running', 'forges running');
  const runningClauses = [
    clauseOf(countOf('paused'), 'paused'),
    clauseOf(countOf('held'), 'holds its launches', 'hold their launches'),
    clauseOf(countOf('passing-baton'), 'passing the baton'),
  ];
  const groups = [
    runningGroup === null ? null : [runningGroup, ...runningClauses].filter((clause) => clause !== null).join(', '),
    clauseOf(countOf('starting'), 'starting'),
    clauseOf(countOf('dormant'), 'dormant'),
    clauseOf(countOf('unreachable'), 'unreachable'),
    clauseOf(countOf('unreadable'), 'not readable by this Gaia'),
    clauseOf(countOf('missing'), 'repository missing', 'repositories missing'),
  ];
  return { condition: countOf('live') === 0 ? null : 'live', text: groups.filter((group) => group !== null).join(HEAD_SEPARATOR) };
}

function figuresOf(fleetDocument: FleetDocument): AttentionFigure[] {
  const {
    waitingOnUser, agentsInFlight, machineLimit, readyTickets, deliveredToday, tokensToday, openIncidents, incompleteFor
  } = fleetDocument.figures;
  return [
    { value: `${waitingOnUser}${incompleteFor.length > 0 ? '+' : ''}`, label: 'waiting on you' },
    machineLimit === null
      ? { value: String(agentsInFlight), label: 'agents' }
      : { value: `${agentsInFlight} / ${machineLimit}`, label: 'agents, machine limit' },
    { value: String(readyTickets), label: 'tickets ready' },
    { value: String(deliveredToday), label: 'done today' },
    { value: compactCountOf(tokensToday), label: 'tokens today' },
    { value: String(openIncidents), label: 'open incidents' },
  ];
}

/** A row read as last reported keeps the stamp as a clock time, since an age would keep growing past what Gaia knows. */
function metaTextOf(item: FleetDocumentFleetAttentionItem, forge: FleetDocumentForge, isStale: boolean, clock: ClockReading): string {
  if (isStale) {
    const lastReported = clockTextOf(forge.lastReportedAt, clock);
    const stampClock = clockTextOf(item.stamp, clock);
    return [
      lastReported === null ? 'as last reported' : `as last reported ${lastReported}`,
      stampClock === null ? null : `${item.stampWord} ${stampClock}`,
    ].filter((part) => part !== null).join(META_SEPARATOR);
  }
  const age = StampTextUtil.ageTextOf(item.stamp, clock.nowEpochMilliseconds);
  return [item.metaText ?? item.decisionKind, age === null ? null : `${item.stampWord} ${age}`].filter((part) => part !== null).join(META_SEPARATOR);
}

/** The fleet's own order, which the server sorts; only the first row whose button can act is primary. */
function rowsOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): AttentionRow[] {
  let primaryIsGiven = false;
  return fleetDocument.attention.flatMap((item) => {
    const forge = forgesById.get(item.trackerId);
    if (forge === undefined) return [];
    const isStale = forge.fidelity === 'unreachable';
    const isPrimary = !isStale && !primaryIsGiven;
    if (isPrimary) primaryIsGiven = true;
    return [{
      key:           `${item.trackerId}/${item.key}`,
      trackerId:     item.trackerId,
      project:       forge.project,
      condition:     ForgeTextUtil.dotConditionOf(forge.condition),
      conditionWord: ForgeTextUtil.conditionWordOf(forge.condition),
      kindText:      KIND_TEXTS[item.kind],
      kindTone:      item.kind === 'escalated-question' ? 'error' : 'attention',
      idText:        item.idText,
      subject:       item.subject,
      metaText:      metaTextOf(item, forge, isStale, clock),
      actionLabel:   item.actionLabel,
      href:          forgeInPlaceHrefOf(item.trackerId, item.route),
      isStale,
      isPrimary,
    }];
  });
}

function commandAction(label: string, emphasis: ButtonEmphasis, command: CommandBody, forgeAcceptsIt = true, icon: ButtonIcon | null = null): LookAction {
  return {
    kind: 'command',
    label,
    emphasis,
    icon,
    command,
    forgeAcceptsIt,
  };
}

function linkAction(label: string, href: string): LookAction {
  return {
    kind: 'link', label, emphasis: 'plain', href
  };
}

function openInNewTabAction(trackerId: string): LookAction {
  return commandAction('Open in new tab', 'plain', { kind: 'forge-open-in-browser', trackerId }, true, 'open-in-new-tab');
}

const CONTRACT_NAMES: readonly (keyof FleetDocumentContracts)[] = ['monitor', 'control', 'summary', 'embed'];

/** The contracts a forge publishes above the numbers this Gaia knows, monitor first: `monitor 2 · control 2`. */
function newerContractsOf(forge: FleetDocumentForge, fleetDocument: FleetDocument): (keyof FleetDocumentContracts)[] {
  return CONTRACT_NAMES.filter((name) => {
    const published = forge.contracts[name];
    return published !== null && published > fleetDocument.gaia.knownContracts[name];
  });
}

function forgeTextOf(entries: readonly { readonly kind: string; readonly text: string }[], kind: string): string | null {
  return entries.find((entry) => entry.kind === kind)?.text ?? null;
}

function unreachableCallout(forge: FleetDocumentForge, clock: ClockReading) {
  return {
    tone:    'error' as const,
    ...ForgeTextUtil.unreachableCalloutTextOf(forge, clockTextOf(forge.lastReportedAt, clock)),
    actions: [
      commandAction('Look again', 'plain', { kind: 'fleet-look-again' }),
      linkAction('Stop', HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: forge.trackerId })),
    ],
  };
}

function newerContractCallout(forge: FleetDocumentForge, fleetDocument: FleetDocument) {
  const newer = newerContractsOf(forge, fleetDocument);
  const [leading = 'monitor'] = newer;
  return {
    tone:     'warn' as const,
    word:     'Newer than this Gaia',
    sentence: `This forge publishes ${leading} contract ${forge.contracts[leading] ?? ''}. This Gaia reads ${fleetDocument.gaia.knownContracts[leading]}, `
      + 'so it shows nothing of it and sends it nothing. Update Gaia.',
    machineLine: newer.map((name) => `${name} ${forge.contracts[name] ?? ''}`).join(META_SEPARATOR) || null,
    actions:     [openInNewTabAction(forge.trackerId)],
  };
}

function countsOnlySentenceOf(forge: FleetDocumentForge): string {
  const known = [
    forge.attentionCount === null ? null : countedPhrase(forge.attentionCount, 'entry waits on you', 'entries wait on you'),
    countedPhrase(forge.agents.length, 'agent runs', 'agents run'),
  ].filter((part) => part !== null).join(', ');
  return `This forge is older than the monitor contract. Gaia reads its summary: ${known}. Open it to see what waits.`;
}

function calloutPartsOf(look: FleetDocumentLook, forge: FleetDocumentForge, fleetDocument: FleetDocument, clock: ClockReading) {
  const { trackerId } = forge;
  switch (look.kind) {
    case 'unreachable':
      return unreachableCallout(forge, clock);
    case 'newer-contract':
      return newerContractCallout(forge, fleetDocument);
    case 'baton-pass-failed':
      return {
        tone:        'error' as const,
        word:        'Baton pass failed',
        sentence:    forgeTextOf(forge.warnings, BATON_PASS_FAILED_WARNING_KIND) ?? 'Its Overseer could not hand over to its successor.',
        machineLine: null,
        actions:     [linkAction('Open', forgeInPlaceHrefOf(trackerId, null))],
      };
    case 'launches-held': {
      const agentsRunning = forge.concurrency?.agentsInFlight ?? forge.agents.length;
      return {
        tone:        'warn' as const,
        word:        'Launches held',
        sentence:    'The install version changed. Nothing launches until this forge is updated.',
        machineLine: agentsRunning === 0 ? null : `${countedPhrase(agentsRunning, 'agent keeps', 'agents keep')} running through the update`,
        actions:     [commandAction('Update forge', 'primary', { kind: 'forge-update', trackerId }), linkAction('Open', forgeInPlaceHrefOf(trackerId, null))],
      };
    }
    case 'new-code':
      return {
        tone:        'neutral' as const,
        word:        'New code',
        sentence:    forgeTextOf(forge.notices, NEW_CODE_NOTICE_KIND) ?? 'This forge\'s code changed since its Overseer started.',
        machineLine: forge.codeVersion === null ? null : `code ${forge.codeVersion}`,
        actions:     [commandAction('Restart onto the new code', 'primary', { kind: 'forge-restart', trackerId }, ForgeContractUtil.controlContractIsKnown(forge))],
      };
    case 'counts-only':
      return {
        tone:        'neutral' as const,
        word:        'Counts only',
        sentence:    countsOnlySentenceOf(forge),
        machineLine: forge.contracts.summary === null ? 'no monitor contract' : `summary ${forge.contracts.summary}${META_SEPARATOR}no monitor contract`,
        actions:     [openInNewTabAction(trackerId), commandAction('Update forge', 'plain', { kind: 'forge-update', trackerId })],
      };
    case 'dormant-with-ready-tickets':
      return {
        tone:     'neutral' as const,
        word:     'Dormant',
        sentence: forge.readyTicketCount === null
          ? 'This forge is not running.'
          : `This forge is not running. ${countedPhrase(forge.readyTicketCount, 'ticket is', 'tickets are')} ready and nothing drives them.`,
        machineLine: forge.lastCommand === null ? null : `last command: ${forge.lastCommand}`,
        actions:     [commandAction('Start forge', 'primary', { kind: 'forge-start', trackerId })],
      };
    case 'machine-limit-reached':
      return null;
  }
}

/** The machine at its limit shows once, on the machine panel, never as a forge's callout. */
function looksOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): LookCallout[] {
  return fleetDocument.needsALook.flatMap((look) => {
    const forge = forgesById.get(look.trackerId);
    const parts = forge === undefined ? null : calloutPartsOf(look, forge, fleetDocument, clock);
    if (forge === undefined || parts === null) return [];
    return [{
      trackerId: forge.trackerId,
      lookKind:  look.kind,
      condition: ForgeTextUtil.dotConditionOf(forge.condition),
      project:   forge.project,
      ...parts,
    }];
  });
}

function waitingCountOf(forge: FleetDocumentForge): number {
  return forge.fidelity === 'counts-only' ? forge.attentionCount ?? 0 : forge.attention.length;
}

function jobRoleOf(role: string | null, waitingOnDecisionId: string | null): DotRole {
  if (waitingOnDecisionId !== null) return 'waiting';
  if (role === 'builder' || role === 'reviewer') return role;
  return 'forge';
}

function runningCardsOf(forges: readonly FleetDocumentForge[]): RunningCard[] {
  return forges.filter((forge) => forge.agents.length > 0).map((forge) => {
    const waitingCount = waitingCountOf(forge);
    return {
      trackerId:     forge.trackerId,
      project:       forge.project,
      condition:     ForgeTextUtil.dotConditionOf(forge.condition),
      conditionWord: ForgeTextUtil.conditionWordOf(forge.condition),
      href:          forgeInPlaceHrefOf(forge.trackerId, null),
      slotsText:     forge.concurrency === null ? null : `${forge.concurrency.agentsInFlight} / ${forge.concurrency.limit}`,
      jobs:          forge.agents.map((row) => ({ jobId: row.jobId, role: jobRoleOf(row.role, row.waitingOnDecisionId), text: `${row.jobId} ${row.role ?? row.kind}` })),
      waitingText:   waitingCount === 0 ? null : countedPhrase(waitingCount, 'waits on you', 'wait on you'),
      isStale:       forge.fidelity === 'unreachable',
    };
  });
}

function recentOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): RecentEntry[] {
  return fleetDocument.activity.slice(0, RECENT_ENTRIES_SHOWN).map((entry) => ({
    key:       `${entry.trackerId}/${entry.logPosition}`,
    clockText: clockTextOf(entry.at, clock),
    project:   forgesById.get(entry.trackerId)?.project ?? entry.trackerId,
    text:      entry.text,
  }));
}

function contractTextOf(forge: FleetDocumentForge): string {
  if (forge.contracts.monitor !== null) return `monitor ${forge.contracts.monitor}`;
  if (forge.contracts.summary !== null) return `summary ${forge.contracts.summary}`;
  return 'no contract';
}

function readingTextOf(forge: FleetDocumentForge, clock: ClockReading): string {
  switch (forge.fidelity) {
    case 'full':
      return 'Everything, live.';
    case 'unreachable': {
      const lastReported = clockTextOf(forge.lastReportedAt, clock);
      return `Nothing since ${lastReported ?? 'it stopped answering'}. Its rows are shown as last reported and their actions are off.`;
    }
    case 'counts-only':
      return 'Counts and jobs only. No questions, reviews or notices by name.';
    case 'newer-contract':
      return 'Nothing. Its contract is newer than this Gaia.';
    case 'dormant':
      return 'Nothing while its Overseer is not running.';
    case 'repository-missing':
      return 'Nothing. Its repository is gone.';
  }
}

function readingsOf(fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[], clock: ClockReading): ForgeReadingLine[] | null {
  const leftOut = new Set(fleetDocument.figures.incompleteFor);
  if (leftOut.size === 0) return null;
  return forges.map((forge) => ({
    trackerId:              forge.trackerId,
    project:                forge.project,
    contractText:           contractTextOf(forge),
    readingText:            readingTextOf(forge, clock),
    totalsCannotVouchForIt: leftOut.has(forge.trackerId),
  }));
}

function attentionContentOf(fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[], clock: ClockReading): AttentionContent {
  const forgesById = new Map(forges.map((forge) => [forge.trackerId, forge]));
  const { waitingOnUser, incompleteFor } = fleetDocument.figures;
  const morePossible = incompleteFor.length > 0;
  const looks = looksOf(fleetDocument, forgesById, clock);
  const running = runningCardsOf(forges);
  return {
    status:  statusLineOf(fleetDocument),
    banners: forges.filter((forge) => forge.fidelity === 'unreachable').map((forge) => ({
      trackerId:         forge.trackerId,
      project:           forge.project,
      lastReportedClock: clockTextOf(forge.lastReportedAt, clock),
    })),
    figures:     figuresOf(fleetDocument),
    figuresForm: morePossible ? 'line' : 'row',
    waitingHead: `Waiting on you${HEAD_SEPARATOR}${morePossible ? `${waitingOnUser} known, more possible` : waitingOnUser}`,
    rows:        rowsOf(fleetDocument, forgesById, clock),
    nothingText: morePossible ? 'Nothing that Gaia can read waits on you.' : 'Nothing waits on you.',
    looksHead:   `Forges that need a look${HEAD_SEPARATOR}${looks.length}`,
    looks,
    runningHead: `Running${HEAD_SEPARATOR}${running.length}`,
    running,
    recent:      recentOf(fleetDocument, forgesById, clock),
    readings:    readingsOf(fleetDocument, forges, clock),
  };
}

/** The top bar's line: the visible forges counted by condition. */
function statusLineOf(fleetDocument: FleetDocument): TopBarStatus {
  const forges = visibleForgesOf(fleetDocument);
  if (forges.length === 0 && fleetDocument.forges.length > 0) return EVERY_FORGE_HIDDEN_STATUS;
  return statusOf(forges);
}

function screenOf(fleetDocument: FleetDocument, clock: ClockReading): AttentionScreen {
  if (fleetDocument.forges.length === 0) {
    return { kind: 'no-forge', content: { status: NO_FORGE_STATUS, forgeProgramIsMissing: AddRepositoryForm.forgeProgramIsMissingIn(fleetDocument) } };
  }
  return { kind: 'fleet', content: attentionContentOf(fleetDocument, visibleForgesOf(fleetDocument), clock) };
}

export const AttentionModel = {
  screenOf,
  statusLineOf,
  compactCountOf,
} as const;
