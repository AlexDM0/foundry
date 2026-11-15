/**
 * What the Agents view shows of each forge's Flint brain (SCREENS A2): its part of the forge's group head (the "+ brain" pill, Wake, the
 * starting note or the forge's refusal), its row under the forge's jobs, and its panel when selected. The brain counts in no figure, and its
 * Wake and Stop exist only where the forge serves the brain's commands. Its times count from the forge's stamps for display and decide
 * nothing: the row leaves when the forge's document drops it.
 */
import type { ForgeCommandBody } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentBrain,
  FleetDocumentFleetAgentRow,
  FleetDocumentForge
} from '../../@types/FleetDocument.ts';
import { CommandSender, type CommandStates }        from '../../api/CommandSender.ts';
import type { ClockReading }                        from '../../shared/@types/ClockReading.ts';
import { HashRouter }                               from '../../shared/HashRouter.ts';
import { CommandFailureTextUtil, type RefusalText } from '../../shared/utils/CommandFailureTextUtil.ts';
import { CountTextUtil }                            from '../../shared/utils/CountTextUtil.ts';
import { FleetDocumentUtil }                        from '../../shared/utils/FleetDocumentUtil.ts';
import { ForgeCommandTextUtil }                     from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }                        from '../../shared/utils/ForgeContractUtil.ts';
import { StampTextUtil }                            from '../../shared/utils/StampTextUtil.ts';
import { type AgentFilters, AgentsFilters }         from './AgentsFilters.ts';
import { BrainTextUtil }                            from './utils/BrainTextUtil.ts';

/** The page contract's names for a running brain's agent row (`FleetDocumentFleetAgentRow`). */
const BRAIN_ROLE = 'brain';
const BRAIN_JOB_ID = 'flint-brain';

/** The Bridge's own Agents view, where the forge shows its brain beside its jobs and a job at `#agents/<jobId>`. */
export const AGENTS_ROUTE_OF_THE_BRIDGE = '#agents';

type BrainCommandKind = Extract<ForgeCommandBody['kind'], 'forge-brain-start' | 'forge-brain-stop'>;

const BRAIN_COMMAND_KINDS: ReadonlySet<string> = new Set<BrainCommandKind>(['forge-brain-start', 'forge-brain-stop']);

/** Wake or Stop: the command it sends that one forge, disabled while a command to that forge is on its way. */
export interface BrainCommandButton {
  readonly command:  ForgeCommandBody;
  readonly disabled: boolean;
}

/** What a forge's group head shows of its brain, each state replacing the last as in B1's bar; `none` where the forge reports no brain. */
export type GroupBrainContent =
  | { readonly kind: 'none' }
  | { readonly kind: 'off'; readonly wake: BrainCommandButton }
  | { readonly kind: 'starting' }
  | { readonly kind: 'running' }
  | { readonly kind: 'refused'; readonly refusedBy: 'forge'; readonly sentence: string; readonly code: string; readonly wake: BrainCommandButton | null };

/** A refused brain command as Gaia's answer gave it, with the refused command's own name. */
export interface BrainCommandRefusal extends RefusalText {
  readonly commandLabel: string;
}

export interface BrainRowContent {
  readonly key:            string;
  readonly project:        string;
  readonly selectHref:     string;
  readonly isSelected:     boolean;
  readonly runTimeText:    string | null;
  readonly newestMoveText: string | null;
  readonly timeLeftText:   string | null;
  readonly model:          string | null;
  readonly effort:         string | null;
  readonly calls:          number | null;
  readonly tokensText:     string;
  readonly stop:           BrainCommandButton | null;
}

/** A fact the forge reports of its brain: a machine value, in mono, then the words after it. */
export interface BrainFact {
  readonly label:        string;
  readonly machineValue: string;
  readonly words:        string | null;
}

export interface BrainMoveContent {
  readonly key:    string;
  readonly atText: string;
  readonly text:   string;
}

export type SelectedBrainContent =
  | {
    readonly kind:               'brain-running';
    readonly project:            string;
    readonly timeLeftText:       string | null;
    readonly model:              string | null;
    readonly effort:             string | null;
    /** The effort's level on the four-bar mark, `null` for an effort the mark does not know. */
    readonly effortLevel:        number | null;
    readonly spanText:           string | null;
    readonly facts:              readonly BrainFact[];
    /** The machine's agents against its limit, which the brain is not counted in; `null` when the machine reports no limit. */
    readonly machineLimitFigure: string | null;
    readonly moves:              readonly BrainMoveContent[];
    readonly stop:               BrainCommandButton | null;
    readonly openHref:           string;
  }
  | { readonly kind: 'brain-no-longer-running'; readonly project: string; readonly openHref: string };

export interface BrainSurroundings {
  readonly fleetDocument:      FleetDocument;
  readonly commandStates:      CommandStates;
  readonly readAtMilliseconds: number;
  /** The time zone a clock time is printed in; `undefined` is the browser's own. */
  readonly timeZone:           string | undefined;
}

/** The forge's sentence names a command Gaia has no words for (D10): the refusal then stands on its code. */
const REFUSAL_WITHOUT_A_SENTENCE = 'it did not wake Flint\'s brain';

function rowIsABrain(row: FleetDocumentFleetAgentRow): boolean {
  return !row.countsAgainstLimit && row.role === BRAIN_ROLE;
}

function selectionIsABrain(jobId: string): boolean {
  return jobId === BRAIN_JOB_ID;
}

function reportedBrainOf(forge: FleetDocumentForge | null): FleetDocumentBrain | null {
  return forge === null || forge.brain === 'not-reported' ? null : forge.brain;
}

function brainCommandButtonOf(forge: FleetDocumentForge, kind: BrainCommandKind, commandStates: CommandStates): BrainCommandButton | null {
  if (!ForgeContractUtil.brainCommandsAreServed(forge)) return null;
  const { onItsWay } = CommandSender.stateOf(commandStates, { trackerId: forge.trackerId });
  return { command: { kind, trackerId: forge.trackerId }, disabled: onItsWay !== null };
}

/** Wake is offered only to a live forge, never a held or paused one, and only where the forge serves the brain's commands. */
function wakeOf(forge: FleetDocumentForge, commandStates: CommandStates): BrainCommandButton | null {
  return forge.condition === 'live' ? brainCommandButtonOf(forge, 'forge-brain-start', commandStates) : null;
}

function groupBrainOf(forge: FleetDocumentForge | null, commandStates: CommandStates): GroupBrainContent {
  const brain = reportedBrainOf(forge);
  if (forge === null || brain === null) return { kind: 'none' };
  switch (brain.state) {
    case 'starting':
    case 'running':
      return { kind: brain.state };
    case 'refused':
      return {
        kind:      'refused',
        refusedBy: 'forge',
        sentence:  brain.refusal?.sentence ?? REFUSAL_WITHOUT_A_SENTENCE,
        code:      brain.refusal?.code ?? brain.state,
        wake:      wakeOf(forge, commandStates),
      };
    case 'off':
    case 'ended': {
      const wake = wakeOf(forge, commandStates);
      return wake === null ? { kind: 'none' } : { kind: 'off', wake };
    }
  }
}

/** Gaia's answer to the forge's last brain command, while it did not succeed; the forge's own refused state stands in its place. */
function brainCommandRefusalOf(forge: FleetDocumentForge | null, commandStates: CommandStates): BrainCommandRefusal | null {
  if (forge === null || reportedBrainOf(forge)?.state === 'refused') return null;
  const { failure } = CommandSender.stateOf(commandStates, { trackerId: forge.trackerId });
  if (failure === null || !BRAIN_COMMAND_KINDS.has(failure.kind)) return null;
  return { ...CommandFailureTextUtil.refusalTextOf(failure), commandLabel: ForgeCommandTextUtil.commandLabelOf(failure.kind) ?? failure.kind };
}

/** The brain in its forge's own Agents view when the forge opens in place, else the forge's row on the Forges view. */
function openHrefOf(forge: FleetDocumentForge | null, trackerId: string): string {
  if (forge !== null && ForgeContractUtil.canOpenInPlace(forge)) {
    return HashRouter.fragmentOf({ view: 'forge', trackerId, bridgeFragment: AGENTS_ROUTE_OF_THE_BRIDGE });
  }
  return HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: trackerId });
}

function brainRowContentOf(surroundings: BrainSurroundings, row: FleetDocumentFleetAgentRow, filters: AgentFilters, isSelected: boolean): BrainRowContent {
  const { fleetDocument, commandStates, readAtMilliseconds } = surroundings;
  const forge = FleetDocumentUtil.forgeOf(fleetDocument, row.trackerId);
  const brain = reportedBrainOf(forge);
  const [newestMove] = brain?.recentMoves ?? [];
  return {
    key:            `${row.trackerId}/${row.jobId}`,
    project:        forge?.project ?? row.trackerId,
    selectHref:     HashRouter.fragmentOf({ view: 'agents', selectedAgent: { trackerId: row.trackerId, jobId: row.jobId }, query: AgentsFilters.queryOf(filters) }),
    isSelected,
    runTimeText:    BrainTextUtil.runTimeText(row.startedAt, readAtMilliseconds),
    newestMoveText: newestMove === undefined ? null : BrainTextUtil.moveTextOf(newestMove),
    timeLeftText:   BrainTextUtil.timeLeftText(brain?.endsAt ?? null, readAtMilliseconds),
    model:          brain?.model ?? null,
    effort:         brain?.effort ?? null,
    calls:          row.calls,
    tokensText:     CountTextUtil.shortCountTextOf(row.tokens),
    stop:           forge === null ? null : brainCommandButtonOf(forge, 'forge-brain-stop', commandStates),
  };
}

function brainFactsOf(brain: FleetDocumentBrain | null, row: FleetDocumentFleetAgentRow, surroundings: BrainSurroundings): BrainFact[] {
  const clock: ClockReading = { nowEpochMilliseconds: surroundings.readAtMilliseconds, timeZone: surroundings.timeZone };
  const startedAtText = StampTextUtil.clockTextAtReadingOf(row.startedAt ?? brain?.startedAt ?? null, clock);
  const endsAtText = StampTextUtil.clockTextAtReadingOf(brain?.endsAt ?? null, clock);
  const model = brain?.model ?? null;
  const effort = brain?.effort ?? null;
  const facts: readonly (BrainFact | null)[] = [
    startedAtText === null ? null : { label: 'Started', machineValue: startedAtText, words: BrainTextUtil.startedByPlaceOf(brain?.startedBy ?? null) },
    endsAtText === null ? null : { label: 'Ends', machineValue: endsAtText, words: 'at the latest' },
    model === null ? null : { label: effort === null ? 'Model' : 'Model, effort', machineValue: model, words: effort === null ? null : `· ${effort}` },
    { label: 'Tokens so far', machineValue: CountTextUtil.shortCountTextOf(row.tokens), words: null },
    row.calls === null ? null : { label: 'Calls so far', machineValue: String(row.calls), words: null },
  ];
  return facts.filter((fact) => fact !== null);
}

function machineLimitFigureOf(fleetDocument: FleetDocument): string | null {
  const { machineLimit } = fleetDocument.figures;
  if (machineLimit === null) return null;
  return `${fleetDocument.agents.filter((row) => row.countsAgainstLimit).length} / ${machineLimit}`;
}

/** The selected brain's panel: running while the forge's document holds its row, and no longer running once the forge drops it. */
function selectedBrainOf(surroundings: BrainSurroundings, trackerId: string): SelectedBrainContent {
  const {
    fleetDocument, commandStates, readAtMilliseconds, timeZone
  } = surroundings;
  const forge = FleetDocumentUtil.forgeOf(fleetDocument, trackerId);
  const project = forge?.project ?? trackerId;
  const openHref = openHrefOf(forge, trackerId);
  const row = fleetDocument.agents.find((candidate) => candidate.trackerId === trackerId && rowIsABrain(candidate));
  if (row === undefined) return { kind: 'brain-no-longer-running', project, openHref };
  const brain = reportedBrainOf(forge);
  const effort = brain?.effort ?? null;
  return {
    kind:               'brain-running',
    project,
    timeLeftText:       BrainTextUtil.timeLeftText(brain?.endsAt ?? null, readAtMilliseconds),
    model:              brain?.model ?? null,
    effort,
    effortLevel:        effort === null ? null : BrainTextUtil.effortLevelOf(effort),
    spanText:           BrainTextUtil.spanText(brain?.startedAt ?? row.startedAt, brain?.endsAt ?? null),
    facts:              brainFactsOf(brain, row, surroundings),
    machineLimitFigure: machineLimitFigureOf(fleetDocument),
    moves:              (brain?.recentMoves ?? []).map((move, i) => ({
      key:    `${i}`,
      atText: BrainTextUtil.clockTimeToTheSecondOf(move.at, timeZone) ?? move.at,
      text:   BrainTextUtil.moveTextOf(move),
    })),
    stop: forge === null ? null : brainCommandButtonOf(forge, 'forge-brain-stop', commandStates),
    openHref,
  };
}

export const BrainModel = {
  rowIsABrain,
  selectionIsABrain,
  groupBrainOf,
  brainCommandRefusalOf,
  brainRowContentOf,
  selectedBrainOf,
} as const;
