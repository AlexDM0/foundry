/**
 * What the Attention view shows of a fleet document (SCREENS A1, B3, B4): the figures, what waits on User in the fleet's own order, the forges that need
 * a look with their actions, the running forges with a running brain's line, the newest activity, and for a forge Gaia cannot read in full, its banner
 * and what Gaia reads of each forge. The page's clock only prints ages and clock times; no order reads it. A value the document does not hold is absent,
 * never zero.
 */
import type { ButtonEmphasis } from 'design-system/Button';

import type { CommandBody } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentAttentionKind,
  FleetDocumentContracts,
  FleetDocumentFleetAttentionItem,
  FleetDocumentForge,
  FleetDocumentLook,
  FleetDocumentLookKind,
} from '../../@types/FleetDocument.ts';
import type { CalloutTone }     from '../../design-system/Callout.tsx';
import type { DotCondition }    from '../../design-system/ConditionDot.tsx';
import type { DotRole }         from '../../design-system/RoleDot.tsx';
import type { ClockReading }    from '../../shared/@types/ClockReading.ts';
import { HashRouter }           from '../../shared/HashRouter.ts';
import { AddRepositoryForm }    from '../../shared/add-repository/AddRepositoryForm.ts';
import { CountTextUtil }        from '../../shared/utils/CountTextUtil.ts';
import { FleetDocumentUtil }    from '../../shared/utils/FleetDocumentUtil.ts';
import { ForgeCommandTextUtil } from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }    from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }        from '../../shared/utils/ForgeTextUtil.ts';
import { PathTextUtil }         from '../../shared/utils/PathTextUtil.ts';
import { StampTextUtil }        from '../../shared/utils/StampTextUtil.ts';

/** The one drawn shape a look's button carries. */
export type LookActionIcon = 'open-in-new-tab';

export interface AttentionFigure {
  readonly value:     string;
  readonly label:     string;
  /** The value waits on User. */
  readonly attention: boolean;
}

/** A kind pill's tone: orange for what User decides, green for work that waits only on User's accept. */
export type AttentionKindTone = 'warn' | 'pass';

/** One entry that waits on User. A row of an unreachable forge is stale: it can be read, not acted on. */
export interface AttentionRow {
  readonly key:           string;
  readonly trackerId:     string;
  readonly project:       string;
  readonly condition:     DotCondition;
  readonly conditionWord: string;
  readonly kindText:      string;
  readonly kindTone:      AttentionKindTone;
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
    readonly icon:           LookActionIcon | null;
    readonly command:        CommandBody;
    readonly forgeAcceptsIt: boolean;
  }
  | { readonly kind: 'link'; readonly label: string; readonly emphasis: ButtonEmphasis; readonly href: string };

export interface LookCallout {
  readonly trackerId:          string;
  readonly lookKind:           FleetDocumentLookKind;
  readonly tone:               CalloutTone;
  readonly condition:          DotCondition;
  readonly project:            string;
  readonly word:               string;
  readonly sentence:           string;
  readonly machineLine:        string | null;
  readonly actions:            readonly LookAction[];
  /** The Restart a callout with Update forge offers once an update left the forge's restart pending; `null` without Update forge. */
  readonly restartAfterUpdate: LookAction | null;
}

export interface RunningJob {
  readonly jobId:    string;
  readonly role:     DotRole;
  /** The job's role as its forge names it, else its kind: `builder`, `reviewer`; `asks` while it waits on User's decision. */
  readonly roleWord: string;
}

/** Flint's brain running in a forge, as its Running card's line words it: the model the forge reports and the time left, each when known. */
export interface RunningBrainLine {
  readonly model:     string | null;
  /** Counted from the forge's `endsAt` for display, `1:24`; the line leaves when the forge reports the brain ended, never by this count. */
  readonly countdown: string | null;
}

export interface RunningCard {
  readonly trackerId:     string;
  readonly project:       string;
  readonly condition:     DotCondition;
  readonly conditionWord: string;
  readonly href:          string;
  readonly slotsText:     string;
  readonly jobs:          readonly RunningJob[];
  readonly waitingText:   string | null;
  readonly isStale:       boolean;
  /** `null` unless the forge reports its brain running. */
  readonly brain:         RunningBrainLine | null;
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
  readonly condition:              DotCondition;
  readonly contractText:           string;
  readonly readingText:            string;
  readonly totalsCannotVouchForIt: boolean;
}

export interface UnreachableBanner {
  readonly trackerId:         string;
  readonly project:           string;
  readonly lastReportedClock: string | null;
}

/** A row of stacked figures in the page title; one line atop the main column while a forge is not fully read, so B3 fits the window. */
export type AttentionFiguresForm = 'row' | 'line';

/** A running card as A1 draws it, or compact, its waiting line in its head, while the side panel shares the column (B3). */
export type RunningCardForm = 'full' | 'compact';

export interface AttentionContent {
  readonly banners:      readonly UnreachableBanner[];
  readonly figures:      readonly AttentionFigure[];
  readonly figuresForm:  AttentionFiguresForm;
  readonly waitingHead:  string;
  /** The waiting head's count alone, for its pill: `5`, `4 known, more possible`. */
  readonly waitingCount: string;
  readonly rows:         readonly AttentionRow[];
  /** What the list's place says when it holds no row. */
  readonly nothingText:  string;
  readonly looksHead:    string;
  readonly looks:        readonly LookCallout[];
  readonly runningHead:  string;
  readonly runningForm:  RunningCardForm;
  readonly running:      readonly RunningCard[];
  readonly recent:       readonly RecentEntry[];
  /** `null` while Gaia reads every forge in full. */
  readonly readings:     readonly ForgeReadingLine[] | null;
}

/** B4: no forge is registered. The forge program is missing when the settings name none and Gaia found none. */
export interface NoForgeContent {
  readonly forgeProgramIsMissing: boolean;
  /** The program Gaia runs, else the one the settings name, from `~`: `~/.bun/bin/forge`; `null` while it is missing. */
  readonly forgeProgramText:      string | null;
}

export type AttentionScreen = { readonly kind: 'fleet'; readonly content: AttentionContent } | { readonly kind: 'no-forge'; readonly content: NoForgeContent };

const HEAD_SEPARATOR = ' · ';
const META_SEPARATOR = ' · ';
const RECENT_ENTRIES_SHOWN = 4;
const COUNTS_ONLY_WORD = 'counts only';
const ASKS_WORD = 'asks';

const KIND_TEXTS: Readonly<Record<FleetDocumentAttentionKind, string>> = {
  'escalated-question': 'Escalated',
  'question':           'Question',
  'draft-ticket':       'Draft',
  'filing-draft':       'Draft',
  'review':             'Review',
  'merge-accept':       'Accept',
};

const BATON_PASS_FAILED_WARNING_KIND = 'baton-pass-failed';
const NEW_CODE_NOTICE_KIND = 'new-code';

function visibleForgesOf(fleetDocument: FleetDocument): FleetDocumentForge[] {
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  return fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
}

function forgeInPlaceHrefOf(trackerId: string, bridgeFragment: string | null): string {
  return HashRouter.fragmentOf({ view: 'forge', trackerId, bridgeFragment });
}

/** The document sums today over the forges that report it, so with none reporting, its zero is not a count. */
function aForgeReportsToday(fleetDocument: FleetDocument): boolean {
  return fleetDocument.forges.some((forge) => forge.today !== null);
}

function figuresOf(fleetDocument: FleetDocument): AttentionFigure[] {
  const {
    waitingOnUser, agentsInFlight, machineLimit, readyTickets, deliveredToday, tokensToday, openIncidents, incompleteFor
  } = fleetDocument.figures;
  const todayFigures: AttentionFigure[] = aForgeReportsToday(fleetDocument)
    ? [
      { value: String(deliveredToday), label: 'done today', attention: false },
      { value: CountTextUtil.shortCountTextOf(tokensToday), label: 'tokens today', attention: false },
    ]
    : [];
  return [
    { value: `${waitingOnUser}${incompleteFor.length > 0 ? '+' : ''}`, label: 'waiting on you', attention: true },
    machineLimit === null
      ? { value: String(agentsInFlight), label: 'agents', attention: false }
      : { value: `${agentsInFlight} / ${machineLimit}`, label: 'agents', attention: false },
    { value: String(readyTickets), label: 'tickets ready', attention: false },
    ...todayFigures,
    { value: String(openIncidents), label: 'open incidents', attention: false },
  ];
}

/** A row read as last reported keeps the stamp as a clock time, since an age would keep growing past what Gaia knows. */
function metaTextOf(item: FleetDocumentFleetAttentionItem, forge: FleetDocumentForge, isStale: boolean, clock: ClockReading): string {
  if (isStale) {
    const lastReported = StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock);
    const stampClock = StampTextUtil.clockTextAtReadingOf(item.stamp, clock);
    return [
      lastReported === null ? 'as last reported' : `as last reported ${lastReported}`,
      stampClock === null ? null : `${item.stampWord} ${stampClock}`,
    ].filter((part) => part !== null).join(META_SEPARATOR);
  }
  const age = StampTextUtil.ageTextOf(item.stamp, clock.nowEpochMilliseconds);
  const lead = item.metaText ?? item.decisionKind;
  const leadNamesTheStampWord = lead !== null && lead.split(' ')[0] === item.stampWord;
  const ageText = age === null || leadNamesTheStampWord ? age : `${item.stampWord} ${age}`;
  return [lead, ageText].filter((part) => part !== null).join(META_SEPARATOR);
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
      kindTone:      item.kind === 'merge-accept' ? 'pass' : 'warn',
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

function commandAction(label: string, emphasis: ButtonEmphasis, command: CommandBody, forgeAcceptsIt = true, icon: LookActionIcon | null = null): LookAction {
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
    kind: 'link', label, emphasis: 'quiet', href
  };
}

function openInNewTabAction(trackerId: string): LookAction {
  return commandAction('Open in new tab', 'quiet', { kind: 'forge-open-in-browser', trackerId }, true, 'open-in-new-tab');
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
    ...ForgeTextUtil.unreachableCalloutTextOf(forge, StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock)),
    actions: [commandAction('Look again', 'quiet', { kind: 'fleet-look-again' })],
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
    forge.attentionCount === null ? null : CountTextUtil.countedPhrase(forge.attentionCount, 'entry waits on you', 'entries wait on you'),
    CountTextUtil.countedPhrase(forge.agents.length, 'agent runs', 'agents run'),
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
        machineLine: agentsRunning === 0 ? null : `${CountTextUtil.countedPhrase(agentsRunning, 'agent keeps', 'agents keep')} running through the update`,
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
        actions:     [openInNewTabAction(trackerId), commandAction('Update forge', 'quiet', { kind: 'forge-update', trackerId })],
      };
    case 'dormant-with-ready-tickets':
      return {
        tone:     'neutral' as const,
        word:     'Dormant',
        sentence: forge.readyTicketCount === null
          ? 'This forge is not running.'
          : `This forge is not running. ${CountTextUtil.countedPhrase(forge.readyTicketCount, 'ticket is', 'tickets are')} ready and nothing drives them.`,
        machineLine: forge.lastCommand === null ? null : `last command: ${forge.lastCommand}`,
        actions:     [commandAction('Start forge', 'quiet', { kind: 'forge-start', trackerId })],
      };
    case 'machine-limit-reached':
      return null;
  }
}

/** Restart reaches the forge only through its Overseer, in the control contract Gaia knows. */
function restartAfterUpdateOf(forge: FleetDocumentForge, actions: readonly LookAction[]): LookAction | null {
  const offersAnUpdate = actions.some((action) => action.kind === 'command' && action.command.kind === 'forge-update');
  if (!offersAnUpdate) return null;
  const { restartLabel } = ForgeCommandTextUtil.RESTART_PENDING;
  return commandAction(restartLabel, 'primary', { kind: 'forge-restart', trackerId: forge.trackerId }, ForgeContractUtil.controlContractIsKnown(forge));
}

/** The machine at its limit shows once, on the machine panel, never as a forge's callout. */
function looksOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): LookCallout[] {
  return fleetDocument.needsALook.flatMap((look) => {
    const forge = forgesById.get(look.trackerId);
    const parts = forge === undefined ? null : calloutPartsOf(look, forge, fleetDocument, clock);
    if (forge === undefined || parts === null) return [];
    return [{
      trackerId:          forge.trackerId,
      lookKind:           look.kind,
      condition:          ForgeTextUtil.dotConditionOf(forge.condition),
      project:            forge.project,
      ...parts,
      restartAfterUpdate: restartAfterUpdateOf(forge, parts.actions),
    }];
  });
}

/** A job that waits on a decision asks User, so its chip is drawn as what needs User and named for that, not for its role. */
function jobRoleOf(role: string | null, waitingOnDecisionId: string | null): DotRole {
  if (waitingOnDecisionId !== null) return 'needs-user';
  if (role === 'builder' || role === 'reviewer') return role;
  return 'forge';
}

function runningJobOf(row: FleetDocumentForge['agents'][number]): RunningJob {
  return {
    jobId:    row.jobId,
    role:     jobRoleOf(row.role, row.waitingOnDecisionId),
    roleWord: row.waitingOnDecisionId === null ? row.role ?? row.kind : ASKS_WORD,
  };
}

/**
 * A forge Gaia no longer hears from says when it last reported, since its jobs are only what it said then; a forge read by its summary
 * says that its card holds counts only.
 */
function runningConditionWordOf(forge: FleetDocumentForge, clock: ClockReading): string {
  if (forge.fidelity === 'counts-only') return COUNTS_ONLY_WORD;
  const lastReported = forge.fidelity === 'unreachable' ? StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock) : null;
  return lastReported === null ? ForgeTextUtil.conditionWordOf(forge.condition) : `as last reported ${lastReported}`;
}

/** Its slots against its limit, or, for a forge that reports no limit, its agents alone. */
function slotsTextOf(forge: FleetDocumentForge): string {
  return forge.concurrency === null
    ? CountTextUtil.countedPhrase(forge.agents.length, 'agent', 'agents')
    : `${forge.concurrency.agentsInFlight} / ${forge.concurrency.limit}`;
}

function runningBrainLineOf(forge: FleetDocumentForge, clock: ClockReading): RunningBrainLine | null {
  if (forge.brain === 'not-reported' || forge.brain.state !== 'running') return null;
  return {
    model:     forge.brain.model,
    countdown: forge.brain.endsAt === null ? null : StampTextUtil.countdownTextOf(forge.brain.endsAt, clock.nowEpochMilliseconds),
  };
}

/** A card is for a forge that runs agents: a brain running in a forge with no job has none (SCREENS A1). */
function runningCardsOf(forges: readonly FleetDocumentForge[], clock: ClockReading): RunningCard[] {
  return forges.filter((forge) => forge.agents.length > 0).map((forge) => {
    const waitingCount = FleetDocumentUtil.waitingCountOf(forge) ?? 0;
    return {
      trackerId:     forge.trackerId,
      project:       forge.project,
      condition:     ForgeTextUtil.dotConditionOf(forge.condition),
      conditionWord: runningConditionWordOf(forge, clock),
      href:          forgeInPlaceHrefOf(forge.trackerId, null),
      slotsText:     slotsTextOf(forge),
      jobs:          forge.agents.map(runningJobOf),
      waitingText:   waitingCount === 0 ? null : CountTextUtil.countedPhrase(waitingCount, 'waits on you', 'wait on you'),
      isStale:       forge.fidelity === 'unreachable',
      brain:         runningBrainLineOf(forge, clock),
    };
  });
}

/** Flint's brain shows on A1 only as its Running card's line, so its entries stay on Activity and every other part of A1 is unchanged. */
function recentOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): RecentEntry[] {
  const entries = fleetDocument.activity.filter((entry) => entry.kind !== 'flint-brain');
  return entries.slice(0, RECENT_ENTRIES_SHOWN).map((entry) => ({
    key:       `${entry.trackerId}/${entry.logPosition}`,
    clockText: StampTextUtil.clockTextAtReadingOf(entry.at, clock),
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
      const lastReported = StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock);
      return `Nothing since ${lastReported ?? 'it stopped answering'}. Its rows show as last reported.`;
    }
    case 'counts-only':
      return 'Counts and jobs only. No questions or reviews by name.';
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
    condition:              ForgeTextUtil.dotConditionOf(forge.condition),
    contractText:           contractTextOf(forge),
    readingText:            readingTextOf(forge, clock),
    totalsCannotVouchForIt: leftOut.has(forge.trackerId),
  }));
}

function attentionContentOf(fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[], clock: ClockReading): AttentionContent {
  const forgesById = new Map(forges.map((forge) => [forge.trackerId, forge]));
  const { waitingOnUser, incompleteFor } = fleetDocument.figures;
  const morePossible = incompleteFor.length > 0;
  const waitingCount = morePossible ? `${waitingOnUser} known, more possible` : String(waitingOnUser);
  const looks = looksOf(fleetDocument, forgesById, clock);
  const running = runningCardsOf(forges, clock);
  const readings = readingsOf(fleetDocument, forges, clock);
  return {
    banners: forges.filter((forge) => forge.fidelity === 'unreachable').map((forge) => ({
      trackerId:         forge.trackerId,
      project:           forge.project,
      lastReportedClock: StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock),
    })),
    figures:     figuresOf(fleetDocument),
    figuresForm: morePossible ? 'line' : 'row',
    waitingHead: `Waiting on you${HEAD_SEPARATOR}${waitingCount}`,
    waitingCount,
    rows:        rowsOf(fleetDocument, forgesById, clock),
    nothingText: morePossible ? 'Nothing that Gaia can read waits on you.' : 'Nothing waits on you.',
    looksHead:   `Forges that need a look${HEAD_SEPARATOR}${looks.length}`,
    looks,
    runningHead: `Running${HEAD_SEPARATOR}${running.length}`,
    runningForm: readings === null ? 'full' : 'compact',
    running,
    recent:      recentOf(fleetDocument, forgesById, clock),
    readings,
  };
}

/** The figures the page title shows: none while a forge is not fully read, when they fold into the main column instead (B3). */
function titleFiguresOf(fleetDocument: FleetDocument): AttentionFigure[] {
  return fleetDocument.figures.incompleteFor.length > 0 ? [] : figuresOf(fleetDocument);
}

function noForgeContentOf(fleetDocument: FleetDocument): NoForgeContent {
  const forgeProgramPath = fleetDocument.gaia.forgeProgramInUse ?? fleetDocument.settings.forgeProgramPath;
  return {
    forgeProgramIsMissing: AddRepositoryForm.forgeProgramIsMissingIn(fleetDocument),
    forgeProgramText:      forgeProgramPath === null ? null : PathTextUtil.homeRelativePathOf(forgeProgramPath, fleetDocument.gaia.homeFolder),
  };
}

/** The server leaves hidden forges out of the document, so a fleet whose every forge is hidden is still a fleet, not B4. */
function noForgeIsRegisteredIn(fleetDocument: FleetDocument): boolean {
  return fleetDocument.forges.length === 0 && fleetDocument.settings.hiddenTrackerIds.length === 0;
}

function screenOf(fleetDocument: FleetDocument, clock: ClockReading): AttentionScreen {
  if (noForgeIsRegisteredIn(fleetDocument)) {
    return { kind: 'no-forge', content: noForgeContentOf(fleetDocument) };
  }
  return { kind: 'fleet', content: attentionContentOf(fleetDocument, visibleForgesOf(fleetDocument), clock) };
}

export const AttentionModel = {
  noForgeIsRegisteredIn,
  screenOf,
  titleFiguresOf,
} as const;
