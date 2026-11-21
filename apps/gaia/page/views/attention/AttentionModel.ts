/**
 * What the Attention view shows of a fleet document (SCREENS A1, B3, B4): the figures, what waits on User in the fleet's own order, the forges that need
 * a look with their actions, the running forges, the newest activity, and for a forge Gaia cannot read in full, its banner
 * and what Gaia reads of each forge. The page's clock only prints ages and clock times; no order reads it. A value the document does not hold is absent,
 * never zero.
 */
import type { ButtonEmphasis } from 'design-system/Button';

import type { CommandAnswerDocument, CommandBody, OutageResumeOutcome } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentAttentionKind,
  FleetDocumentBoardRoute,
  FleetDocumentContracts,
  FleetDocumentFleetAttentionItem,
  FleetDocumentForge,
  FleetDocumentLook,
  FleetDocumentLookKind,
} from '../../@types/FleetDocument.ts';
import type { CalloutTone }      from '../../design-system/Callout.tsx';
import type { DotCondition }     from '../../design-system/ConditionDot.tsx';
import type { DotRole }          from '../../design-system/RoleDot.tsx';
import type { ClockReading }     from '../../shared/@types/ClockReading.ts';
import { HashRouter }            from '../../shared/HashRouter.ts';
import { AddRepositoryForm }     from '../../shared/add-repository/AddRepositoryForm.ts';
import { CountTextUtil }         from '../../shared/utils/CountTextUtil.ts';
import { FleetDocumentUtil }     from '../../shared/utils/FleetDocumentUtil.ts';
import { ForgeCommandTextUtil }  from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }     from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }         from '../../shared/utils/ForgeTextUtil.ts';
import { ForgeVersionsTextUtil } from '../../shared/utils/ForgeVersionsTextUtil.ts';
import type { VersionsText }     from '../../shared/utils/ForgeVersionsTextUtil.ts';
import { PathTextUtil }          from '../../shared/utils/PathTextUtil.ts';
import { StampTextUtil }         from '../../shared/utils/StampTextUtil.ts';

/** The one drawn shape a look's button carries. */

export interface AttentionFigure {
  readonly value:     string;
  readonly label:     string;
  /** The value waits on User. */
  readonly attention: boolean;
}

/** A kind pill's tone: orange for what User decides, green for work that waits only on User's accept. */
export type AttentionKindTone = 'warn' | 'pass';

/**
 * One entry that waits on User. A row of an unreachable forge is stale: it can be read, not acted on. The fleet's alert of the agents a
 * network outage stopped belongs to no one forge, so its `trackerId` is `null` and its forge cell names every forge it counts.
 */
export interface AttentionRow {
  readonly key:           string;
  readonly trackerId:     string | null;
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
  /** The command the row's button sends in place of opening `href`: a crashed or down forge's start. */
  readonly command:       CommandBody | null;
  readonly isStale:       boolean;
  readonly isPrimary:     boolean;
}

/** A callout's action: a command Gaia sends, or a place the page goes. A command its forge cannot be sent is shown, disabled. */
export type LookAction =
  | {
    readonly kind:           'command';
    readonly label:          string;
    readonly emphasis:       ButtonEmphasis;
    readonly command:        CommandBody;
    readonly forgeAcceptsIt: boolean;
  }
  | { readonly kind: 'link'; readonly label: string; readonly emphasis: ButtonEmphasis; readonly href: string };

/** A callout's word: a sentence of its own, "Launches held.", or a quiet pill, "Dormant". */
export type LookWordForm = 'sentence' | 'pill';

/** What a callout of a forge older than this Gaia says while its Update forge is on its way and once its restart is pending. */
export interface UpdateForgeStepsText {
  readonly pendingText:        string;
  readonly pendingButtonLabel: string;
  readonly doneSentence:       string;
  readonly doneStepSentence:   string;
}

export interface LookCallout {
  readonly trackerId:          string;
  readonly lookKind:           FleetDocumentLookKind;
  readonly tone:               CalloutTone;
  readonly condition:          DotCondition;
  readonly project:            string;
  readonly word:               string;
  readonly wordForm:           LookWordForm;
  readonly sentence:           string;
  readonly machineLine:        string | null;
  /** In place of the machine line for a forge at a version Gaia cannot talk to: the forge's version beside the one this Gaia is built for. */
  readonly versionsLine:       VersionsText | null;
  readonly actions:            readonly LookAction[];
  /** The Restart a callout with Update forge offers once an update left the forge's restart pending; `null` without Update forge. */
  readonly restartAfterUpdate: LookAction | null;
  /** `null` but for a forge older than this Gaia, whose callout follows its Update forge step by step. */
  readonly updateSteps:        UpdateForgeStepsText | null;
}

export interface RunningJob {
  readonly jobId:    string;
  readonly role:     DotRole;
  /** The job's role as its forge names it, else its kind: `builder`, `reviewer`; `asks` while it waits on User's decision. */
  readonly roleWord: string;
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
}

export interface RecentEntry {
  readonly key:       string;
  readonly clockText: string | null;
  readonly project:   string;
  readonly text:      string;
}

/** A reading's right side: the forge's version, in orange while it waits on User's Update forge, or the contract it publishes. */
export type ReadingRightText =
  | { readonly kind: 'versions'; readonly text: VersionsText; readonly isWork: boolean }
  | { readonly kind: 'contract'; readonly text: string };

/**
 * One forge in "What Gaia reads of each forge": its version, or for a forge read without one its contract, and what Gaia reads of it.
 * The totals cannot vouch for a forge the figures name as incomplete.
 */
export interface ForgeReadingLine {
  readonly trackerId:              string;
  readonly project:                string;
  readonly condition:              DotCondition;
  readonly rightText:              ReadingRightText;
  readonly readingText:            string;
  readonly totalsCannotVouchForIt: boolean;
}

/** Under the readings: that Gaia never guesses a count, naming the forges the totals leave out, and the link to their versions. */
export interface ReadingsNote {
  readonly sentence:     string;
  /** `null` unless every forge left out is at a version Gaia cannot talk to. */
  readonly versionsHref: string | null;
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
  /** Under the running cards: the forges at a version Gaia cannot talk to, whose agents it cannot read; `null` without one. */
  readonly runningNote:  string | null;
  readonly recent:       readonly RecentEntry[];
  /** `null` while Gaia reads every forge in full. */
  readonly readings:     readonly ForgeReadingLine[] | null;
  readonly readingsNote: ReadingsNote | null;
}

/** One forge's line under the outage resume: a forge that held nothing to resume has none. */
export interface OutageResumeLine {
  readonly trackerId: string;
  readonly project:   string;
  readonly outcome:   Exclude<OutageResumeOutcome, 'nothing-to-do'>;
  /** Gaia's words for a resume or a forge it did not reach; a refusal is the forge's own sentence. */
  readonly text:      string;
}

/** What the last outage resume answered: a line per forge that resumed, refused or was not reached, or that there was nothing to resume. */
export interface OutageResumeAnswer {
  readonly lines:       readonly OutageResumeLine[];
  /** `null` while a forge has a line. */
  readonly nothingText: string | null;
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
const NEVER_GUESSES_A_COUNT = 'Gaia never guesses a count.';

const KIND_TEXTS: Readonly<Record<FleetDocumentAttentionKind, string>> = {
  'escalated-question':     'Escalated',
  'question':               'Question',
  'draft-ticket':           'Draft',
  'filing-draft':           'Draft',
  'review':                 'Review',
  'merge-accept':           'Accept',
  'forge-crashed':          'Crashed',
  'forge-down':             'Down',
  'forge-hung':             'Not supervised',
  'agents-ended-on-outage': 'Outage',
};

/** The alerts Gaia raises about a forge itself, from its served presence; the forge words none of them. */
const FORGE_ALERT_KINDS: ReadonlySet<FleetDocumentAttentionKind> = new Set<FleetDocumentAttentionKind>(['forge-crashed', 'forge-down', 'forge-hung']);

const SUSPECTED_CRASH_SUBJECT = 'Suspected crash before a reboot';

const OUTAGE_CONDITION_WORD = 'network outage';

/** The outage alert's place: the Agents view, where every forge's agents are listed. */
const OUTAGE_ALERT_HREF = HashRouter.fragmentOf({ view: 'agents', selectedAgent: null, query: '' });

/** Each alert's subject; a crash names its error after it, when the registry holds one. */
const FORGE_ALERT_SUBJECTS: Readonly<Record<'forge-crashed' | 'forge-down' | 'forge-hung', string>> = {
  'forge-crashed': 'Forge crashed. It stays off until it is started.',
  'forge-down':    'Forge is down: its Overseer is gone or hung.',
  'forge-hung':    'The forge stopped supervising its agents. They wait for a resume.',
};

const BATON_PASS_FAILED_WARNING_KIND = 'baton-pass-failed';
const NEW_CODE_NOTICE_KIND = 'new-code';

function visibleForgesOf(fleetDocument: FleetDocument): FleetDocumentForge[] {
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  return fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
}

function forgeInPlaceHrefOf(trackerId: string, boardRoute: FleetDocumentBoardRoute | null): string {
  return HashRouter.fragmentOf({ view: 'forge', trackerId, boardRoute });
}

/** The document sums today over the forges that report it, so with none reporting, its zero is not a count. */
function aForgeReportsToday(fleetDocument: FleetDocument): boolean {
  return fleetDocument.forges.some((forge) => forge.today !== null);
}

/**
 * While a forge is not read in full the figures fold into one line atop the main column, so B3 fits the window; a forge Gaia cannot talk
 * to at its version alone leaves them in the title, as the Versions boards draw A1.
 */
function figuresFoldIntoTheMainColumn(fleetDocument: FleetDocument): boolean {
  const leftOut = new Set(fleetDocument.figures.incompleteFor);
  return fleetDocument.forges.some((forge) => leftOut.has(forge.trackerId) && !FleetDocumentUtil.cannotTalkAtItsVersion(forge));
}

function figuresOf(fleetDocument: FleetDocument): AttentionFigure[] {
  const {
    waitingOnUser, agentsInFlight, machineLimit, readyTickets, deliveredToday, tokensToday, openIncidents, incompleteFor
  } = fleetDocument.figures;
  const agentsText = `${agentsInFlight}${FleetDocumentUtil.forgesWhoseAgentsAreNotCountedIn(fleetDocument).length > 0 ? '+' : ''}`;
  const todayFigures: AttentionFigure[] = aForgeReportsToday(fleetDocument)
    ? [
      { value: String(deliveredToday), label: 'done today', attention: false },
      { value: CountTextUtil.shortCountTextOf(tokensToday), label: 'tokens today', attention: false },
    ]
    : [];
  return [
    { value: `${waitingOnUser}${incompleteFor.length > 0 ? '+' : ''}`, label: 'waiting on you', attention: true },
    machineLimit === null
      ? { value: agentsText, label: 'agents', attention: false }
      : { value: `${agentsText} / ${machineLimit}`, label: 'agents', attention: false },
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

function forgeAlertSubjectOf(kind: 'forge-crashed' | 'forge-down' | 'forge-hung', forge: FleetDocumentForge): string {
  const { crashSummary } = forge;
  if (kind !== 'forge-crashed' || crashSummary === null) return FORGE_ALERT_SUBJECTS[kind];
  const lead = crashSummary.suspected ? `${SUSPECTED_CRASH_SUBJECT}.` : FORGE_ALERT_SUBJECTS[kind];
  return crashSummary.errorName === null ? lead : `${lead} ${crashSummary.errorName}`;
}

function isForgeAlert(kind: FleetDocumentAttentionKind): kind is 'forge-crashed' | 'forge-down' | 'forge-hung' {
  return FORGE_ALERT_KINDS.has(kind);
}

/** A forge alert is about the forge as it is now, so it is never stale; its Start sends the forge's start, the user's own. */
function forgeAlertRowOf(item: FleetDocumentFleetAttentionItem, kind: 'forge-crashed' | 'forge-down' | 'forge-hung', forge: FleetDocumentForge, clock: ClockReading) {
  return {
    subject:  forgeAlertSubjectOf(kind, forge),
    metaText: metaTextOf(item, forge, false, clock),
    command:  item.actionLabel === 'Start' ? { kind: 'forge-start', trackerId: forge.trackerId } as const : null,
    isStale:  false,
  };
}

/** The forges the outage alert names, each with its own count, in the document's order: `Example Storefront 2 · Invoice Service 1`. */
function outageForgesOf(forges: readonly FleetDocumentForge[]): FleetDocumentForge[] {
  return forges.filter((forge) => forge.outageEndings > 0);
}

/** One row for the whole fleet, worded from the served counts: the total, and each forge it names with its own. */
function outageAlertRowOf(item: FleetDocumentFleetAttentionItem, fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[]): AttentionRow {
  const named = outageForgesOf(forges);
  return {
    key:           `fleet/${item.key}`,
    trackerId:     null,
    project:       namesInASentenceOf(named.map((forge) => forge.project)),
    condition:     'held',
    conditionWord: OUTAGE_CONDITION_WORD,
    kindText:      KIND_TEXTS[item.kind],
    kindTone:      'warn',
    idText:        '',
    subject:       ForgeTextUtil.outageEndingsTextOf(fleetDocument.outageEndingsTotal),
    metaText:      named.map((forge) => `${forge.project} ${forge.outageEndings}`).join(META_SEPARATOR),
    actionLabel:   item.actionLabel,
    href:          OUTAGE_ALERT_HREF,
    command:       null,
    isStale:       false,
    isPrimary:     false,
  };
}

/** The fleet's own order, which the server sorts; only the first row whose button can act is primary. */
function rowsOf(fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[], clock: ClockReading): AttentionRow[] {
  const forgesById = new Map(forges.map((forge) => [forge.trackerId, forge]));
  let primaryIsGiven = false;
  return fleetDocument.attention.flatMap((item) => {
    if (item.trackerId === null) {
      const isPrimary = !primaryIsGiven;
      primaryIsGiven = true;
      return [{ ...outageAlertRowOf(item, fleetDocument, forges), isPrimary }];
    }
    const { trackerId } = item;
    const forge = forgesById.get(trackerId);
    if (forge === undefined) return [];
    const { kind } = item;
    const alert = isForgeAlert(kind) ? forgeAlertRowOf(item, kind, forge, clock) : null;
    const isStale = alert?.isStale ?? forge.fidelity === 'unreachable';
    const isPrimary = !isStale && !primaryIsGiven;
    if (isPrimary) primaryIsGiven = true;
    return [{
      key:           `${trackerId}/${item.key}`,
      trackerId,
      project:       forge.project,
      condition:     ForgeTextUtil.dotConditionOf(ForgeTextUtil.shownConditionOf(forge)),
      conditionWord: ForgeTextUtil.conditionWordOf(ForgeTextUtil.shownConditionOf(forge)),
      kindText:      KIND_TEXTS[item.kind],
      kindTone:      item.kind === 'merge-accept' ? 'pass' : 'warn',
      idText:        item.idText,
      subject:       alert?.subject ?? item.subject,
      metaText:      alert?.metaText ?? metaTextOf(item, forge, isStale, clock),
      actionLabel:   item.actionLabel,
      href:          forgeInPlaceHrefOf(trackerId, item.boardRoute),
      command:       alert?.command ?? null,
      isStale,
      isPrimary,
    }];
  });
}

function commandAction(label: string, emphasis: ButtonEmphasis, command: CommandBody, forgeAcceptsIt = true): LookAction {
  return {
    kind: 'command',
    label,
    emphasis,
    command,
    forgeAcceptsIt,
  };
}

function linkAction(label: string, href: string): LookAction {
  return {
    kind: 'link', label, emphasis: 'quiet', href
  };
}

const CONTRACT_NAMES: readonly (keyof FleetDocumentContracts)[] = ['monitor', 'control', 'summary'];

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

function unreachableCallout(forge: FleetDocumentForge, clock: ClockReading): CalloutParts {
  return {
    tone:    'error',
    ...ForgeTextUtil.unreachableCalloutTextOf(forge, StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock)),
    actions: [commandAction('Look again', 'quiet', { kind: 'fleet-look-again' })],
  };
}

/** A callout's parts by its look's kind; a part left out takes its plain value in `looksOf`. */
type CalloutParts = Pick<LookCallout, 'tone' | 'word' | 'sentence' | 'machineLine' | 'actions'> & Partial<Pick<LookCallout, 'wordForm' | 'versionsLine' | 'updateSteps'>>;

/**
 * Gaia cannot read the forge and Gaia is the one behind, so the callout is neutral and dashed, only explains and offers no update. A forge
 * whose version is newer says so in its own terms; one whose version Gaia talks to but whose document is of a newer contract names that
 * contract.
 */
function newerContractCallout(forge: FleetDocumentForge, fleetDocument: FleetDocument): CalloutParts {
  const word = ForgeVersionsTextUtil.verdictWordOf('newer');
  const actions: LookAction[] = [];
  const versionsCallout = forge.versions === null
    ? null
    : ForgeVersionsTextUtil.calloutTextOf({ project: forge.project, versions: forge.versions }, fleetDocument.gaia.versions);
  if (versionsCallout !== null) {
    return {
      tone:         'neutral',
      word,
      wordForm:     'sentence',
      sentence:     versionsCallout.sentence,
      machineLine:  null,
      versionsLine: versionsCallout.versionsLine,
      actions,
    };
  }
  const newer = newerContractsOf(forge, fleetDocument);
  const [leading = 'monitor'] = newer;
  return {
    tone:     'neutral',
    word,
    wordForm: 'sentence',
    sentence: `This forge publishes ${leading} contract ${forge.contracts[leading] ?? ''}. This Gaia reads ${fleetDocument.gaia.knownContracts[leading]}, `
      + 'so it shows nothing of it and sends it nothing.',
    machineLine: newer.map((name) => `${name} ${forge.contracts[name] ?? ''}`).join(META_SEPARATOR) || null,
    actions,
  };
}

const { UPDATE_FORGE_TEXT } = ForgeVersionsTextUtil;

const OLDER_FORGE_UPDATE_STEPS: UpdateForgeStepsText = {
  pendingText:        UPDATE_FORGE_TEXT.pendingInCallout,
  pendingButtonLabel: UPDATE_FORGE_TEXT.pendingButton,
  doneSentence:       UPDATE_FORGE_TEXT.doneCalloutSentence,
  doneStepSentence:   UPDATE_FORGE_TEXT.doneStandingAlone,
};

/** The forge's system version is older than the one this Gaia is built for, or it serves none: Update forge brings it level. */
function olderContractCallout(forge: FleetDocumentForge, fleetDocument: FleetDocument): CalloutParts {
  const versions = forge.versions ?? ForgeVersionsTextUtil.NO_VERSIONS_SERVED;
  const versionsCallout = ForgeVersionsTextUtil.calloutTextOf({ project: forge.project, versions }, fleetDocument.gaia.versions);
  return {
    tone:         'warn',
    word:         ForgeVersionsTextUtil.verdictWordOf('older'),
    sentence:     versionsCallout?.sentence ?? '',
    machineLine:  null,
    versionsLine: versionsCallout?.versionsLine ?? null,
    actions:      [commandAction('Update forge', 'primary', { kind: 'forge-update', trackerId: forge.trackerId })],
    updateSteps:  OLDER_FORGE_UPDATE_STEPS,
  };
}

function countsOnlySentenceOf(forge: FleetDocumentForge): string {
  const known = [
    forge.attentionCount === null ? null : CountTextUtil.countedPhrase(forge.attentionCount, 'entry waits on you', 'entries wait on you'),
    CountTextUtil.countedPhrase(forge.agents.length, 'agent runs', 'agents run'),
  ].filter((part) => part !== null).join(', ');
  return `This forge is older than the monitor contract. Gaia reads its summary: ${known}. Open it to see what waits.`;
}

function calloutPartsOf(look: FleetDocumentLook, forge: FleetDocumentForge, fleetDocument: FleetDocument, clock: ClockReading): CalloutParts | null {
  const { trackerId } = forge;
  switch (look.kind) {
    case 'unreachable':
      return unreachableCallout(forge, clock);
    case 'newer-contract':
      return newerContractCallout(forge, fleetDocument);
    case 'older-contract':
      return olderContractCallout(forge, fleetDocument);
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
        actions:     [commandAction('Update forge', 'quiet', { kind: 'forge-update', trackerId })],
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

/**
 * Restart reaches the forge only through its Overseer, in the control contract Gaia knows. Under an older forge's callout it is
 * secondary, since that callout keeps its own primary.
 */
function restartAfterUpdateOf(forge: FleetDocumentForge, parts: CalloutParts): LookAction | null {
  const offersAnUpdate = parts.actions.some((action) => action.kind === 'command' && action.command.kind === 'forge-update');
  if (!offersAnUpdate) return null;
  const { restartLabel } = ForgeCommandTextUtil.RESTART_PENDING;
  const emphasis = parts.updateSteps === undefined ? 'primary' : 'quiet';
  return commandAction(restartLabel, emphasis, { kind: 'forge-restart', trackerId: forge.trackerId }, ForgeContractUtil.controlContractIsKnown(forge));
}

/**
 * The callouts' order by kind, as B3 draws them: what Gaia cannot reach first, then what User updates or reads in another tab, then what
 * runs but shows less; forges of one kind keep the document's order.
 */
const LOOK_CALLOUT_ORDER: readonly FleetDocumentLookKind[] = [
  'unreachable',
  'baton-pass-failed',
  'launches-held',
  'older-contract',
  'newer-contract',
  'new-code',
  'counts-only',
  'dormant-with-ready-tickets',
  'machine-limit-reached',
];

function lookCalloutRankOf(look: FleetDocumentLook): number {
  return LOOK_CALLOUT_ORDER.indexOf(look.kind);
}

/** The machine at its limit shows once, on the machine panel, never as a forge's callout. */
function looksOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): LookCallout[] {
  const looksInCalloutOrder = [...fleetDocument.needsALook].sort((a, b) => lookCalloutRankOf(a) - lookCalloutRankOf(b));
  return looksInCalloutOrder.flatMap((look) => {
    const forge = forgesById.get(look.trackerId);
    const parts = forge === undefined ? null : calloutPartsOf(look, forge, fleetDocument, clock);
    if (forge === undefined || parts === null) return [];
    return [{
      trackerId:          forge.trackerId,
      lookKind:           look.kind,
      condition:          ForgeTextUtil.dotConditionOf(ForgeTextUtil.shownConditionOf(forge)),
      project:            forge.project,
      ...parts,
      wordForm:           parts.wordForm ?? (parts.tone === 'neutral' ? 'pill' : 'sentence'),
      versionsLine:       parts.versionsLine ?? null,
      restartAfterUpdate: restartAfterUpdateOf(forge, parts),
      updateSteps:        parts.updateSteps ?? null,
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

/** A card is for a forge that runs agents (SCREENS A1). */
function runningCardsOf(forges: readonly FleetDocumentForge[], clock: ClockReading): RunningCard[] {
  return forges.filter((forge) => forge.agents.length > 0).map((forge) => {
    const waitingCount = FleetDocumentUtil.waitingCountOf(forge) ?? 0;
    return {
      trackerId:     forge.trackerId,
      project:       forge.project,
      condition:     ForgeTextUtil.dotConditionOf(ForgeTextUtil.shownConditionOf(forge)),
      conditionWord: runningConditionWordOf(forge, clock),
      href:          forgeInPlaceHrefOf(forge.trackerId, null),
      slotsText:     slotsTextOf(forge),
      jobs:          forge.agents.map(runningJobOf),
      waitingText:   waitingCount === 0 ? null : CountTextUtil.countedPhrase(waitingCount, 'waits on you', 'wait on you'),
      isStale:       forge.fidelity === 'unreachable',
    };
  });
}

function recentOf(fleetDocument: FleetDocument, forgesById: ReadonlyMap<string, FleetDocumentForge>, clock: ClockReading): RecentEntry[] {
  return fleetDocument.activity.slice(0, RECENT_ENTRIES_SHOWN).map((entry) => ({
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
    case 'older-contract':
      return ForgeVersionsTextUtil.readingTextOf({ project: forge.project, versions: forge.versions ?? ForgeVersionsTextUtil.NO_VERSIONS_SERVED }).reading;
    case 'dormant':
      return 'Nothing while its Overseer is not running.';
    case 'repository-missing':
      return 'Nothing. Its repository is gone.';
  }
}

/**
 * A forge read in full, or one Gaia cannot talk to at its version, is named by its version; any other, read in part or not at all, by
 * the contract it publishes and what Gaia reads of it.
 */
function readingLineOf(forge: FleetDocumentForge, totalsCannotVouchForIt: boolean, clock: ClockReading): ForgeReadingLine {
  const facts = {
    trackerId: forge.trackerId,
    project:   forge.project,
    condition: ForgeTextUtil.dotConditionOf(ForgeTextUtil.shownConditionOf(forge)),
    totalsCannotVouchForIt,
  };
  // An older forge read without its versions is named as its callout names it: one that states no version.
  const versions = forge.versions ?? (forge.fidelity === 'older-contract' ? ForgeVersionsTextUtil.NO_VERSIONS_SERVED : null);
  const namedByItsVersion = forge.fidelity === 'full' || versions?.verdict === 'newer' || versions?.verdict === 'older';
  if (versions === null || !namedByItsVersion) {
    return { ...facts, rightText: { kind: 'contract', text: contractTextOf(forge) }, readingText: readingTextOf(forge, clock) };
  }
  const { versionsText, isWork, reading } = ForgeVersionsTextUtil.readingTextOf({ project: forge.project, versions });
  return { ...facts, rightText: { kind: 'versions', text: versionsText, isWork }, readingText: reading };
}

function readingsOf(fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[], clock: ClockReading): ForgeReadingLine[] | null {
  const leftOut = new Set(fleetDocument.figures.incompleteFor);
  if (leftOut.size === 0) return null;
  return forges.map((forge) => readingLineOf(forge, leftOut.has(forge.trackerId), clock));
}

/** A small count in a sentence is written as a word, "the three forges", as SCREENS B3 words the readings' footnote. */
const SMALL_COUNT_WORDS: readonly string[] = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** `Example Billing`, `Example Billing and Analytics Sandbox`, `A, B and C`. */
function namesInASentenceOf(names: readonly string[]): string {
  const last = names.at(-1) ?? '';
  return names.length < 2 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** Forges Gaia cannot talk to at their version are named, with the link to their versions; B3's forges read in part are counted. */
function readingsNoteOf(fleetDocument: FleetDocument, forges: readonly FleetDocumentForge[]): ReadingsNote | null {
  const leftOutIds = new Set(fleetDocument.figures.incompleteFor);
  const leftOut = forges.filter((forge) => leftOutIds.has(forge.trackerId));
  if (leftOut.length === 0) return null;
  if (leftOut.every(FleetDocumentUtil.cannotTalkAtItsVersion)) {
    return {
      sentence:     `${NEVER_GUESSES_A_COUNT} The totals leave out ${namesInASentenceOf(leftOut.map((forge) => forge.project))}.`,
      versionsHref: HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: null }),
    };
  }
  const leftOutText = `${SMALL_COUNT_WORDS[leftOut.length] ?? String(leftOut.length)} ${leftOut.length === 1 ? 'forge' : 'forges'}`;
  return { sentence: `${NEVER_GUESSES_A_COUNT} The totals leave out the ${leftOutText} it cannot read in full.`, versionsHref: null };
}

function runningNoteOf(forges: readonly FleetDocumentForge[]): string | null {
  const unread = forges.filter(FleetDocumentUtil.cannotTalkAtItsVersion);
  if (unread.length === 0) return null;
  const names = namesInASentenceOf(unread.map((forge) => forge.project));
  return unread.length === 1 ? `${names} runs too. This Gaia cannot read its agents.` : `${names} run too. This Gaia cannot read their agents.`;
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
    figures:      figuresOf(fleetDocument),
    figuresForm:  figuresFoldIntoTheMainColumn(fleetDocument) ? 'line' : 'row',
    waitingHead:  `Waiting on you${HEAD_SEPARATOR}${waitingCount}`,
    waitingCount,
    rows:         rowsOf(fleetDocument, forges, clock),
    nothingText:  morePossible ? 'Nothing that Gaia can read waits on you.' : 'Nothing waits on you.',
    looksHead:    `Forges that need a look${HEAD_SEPARATOR}${looks.length}`,
    looks,
    runningHead:  `Running${HEAD_SEPARATOR}${running.length}`,
    runningForm:  readings === null ? 'full' : 'compact',
    running,
    runningNote:  runningNoteOf(forges),
    recent:       recentOf(fleetDocument, forgesById, clock),
    readings,
    readingsNote: readingsNoteOf(fleetDocument, forges),
  };
}

/** The figures the page title shows: none while a forge is read only in part, when they fold into the main column instead (B3). */
function titleFiguresOf(fleetDocument: FleetDocument): AttentionFigure[] {
  return figuresFoldIntoTheMainColumn(fleetDocument) ? [] : figuresOf(fleetDocument);
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

const NOTHING_TO_RESUME = 'Nothing to resume';

const NOT_REACHED_TEXT = 'Did not answer. Nothing was resumed there.';

const REFUSED_WITHOUT_A_SENTENCE = 'Refused the resume.';

function outageResumeLineTextOf(forgeAnswer: CommandAnswerDocument['forges'][number]): string {
  switch (forgeAnswer.outcome) {
    case 'resumed':
      return forgeAnswer.resumedCount === 0 ? 'Resumed its agents' : `Resumed ${CountTextUtil.countedPhrase(forgeAnswer.resumedCount, 'agent', 'agents')}`;
    case 'refused':
      return forgeAnswer.refusalText ?? REFUSED_WITHOUT_A_SENTENCE;
    case 'not-reached':
    case 'nothing-to-do':
      return NOT_REACHED_TEXT;
  }
}

/** A forge the document leaves out, a hidden one, is named by its tracker id. */
function outageResumeAnswerOf(answer: CommandAnswerDocument | null, fleetDocument: FleetDocument): OutageResumeAnswer | null {
  if (answer === null) return null;
  const projectsById = new Map(fleetDocument.forges.map((forge) => [forge.trackerId, forge.project]));
  const lines = answer.forges.flatMap((forgeAnswer): OutageResumeLine[] => {
    const { outcome, trackerId } = forgeAnswer;
    if (outcome === 'nothing-to-do') return [];
    return [{
      trackerId, project: projectsById.get(trackerId) ?? trackerId, outcome, text: outageResumeLineTextOf(forgeAnswer)
    }];
  });
  return { lines, nothingText: lines.length === 0 ? NOTHING_TO_RESUME : null };
}

export const AttentionModel = {
  noForgeIsRegisteredIn,
  outageResumeAnswerOf,
  screenOf,
  titleFiguresOf,
} as const;
