/**
 * The research step's model, pure. The research runs nothing: no finding offers to run a script. Continue is always offered; the agent's
 * `readyToContinue` only draws attention to it.
 */
import { PAGE_CONTRACT_VERSIONS }                                        from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardJobNotLaunchedDocument }                              from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                                     from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardJobDocument }                                         from '../../../../@types/board/BoardJobDocuments.ts';
import type { BoardPipelineSetupDocument, BoardResearchFindingDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardFindingTopic, BoardSetupStep }                        from '../../../../@types/board/BoardVocabulary.ts';
import { ElapsedTimeUtil }                                               from '../../../utils/ElapsedTimeUtil.ts';
import type { PanelStatus }                                              from '../PipelinePanel.tsx';
import { NOT_LAUNCHED_PANEL_STATUS, type AgentSessionState }             from '../agent-panel/AgentSessionModel.ts';

/** Scripts are rows of their own, and the layout belongs to the `entities` step. */
export type CardTopic = Exclude<BoardFindingTopic, 'scripts' | 'layout'>;

/** The topics a card shows, in the order drawn; scripts are rows of their own. */
const CARD_TOPICS: readonly CardTopic[] = ['stack', 'conventions', 'continuous-integration', 'note'];

const TOPIC_TITLES: Readonly<Record<CardTopic, string>> = {
  'stack':                  'Stack',
  'conventions':            'Conventions',
  'continuous-integration': 'Continuous integration',
  'note':                   'Notes',
};

const SHORT_COMMIT_LENGTH = 7;

const SESSION_PER_ENTITY_TEXT = 'one session per entity';

export type ResearchState = 'researching' | 'ready' | 'not-launched' | 'stopped';

export interface FindingItem {
  readonly findingId:   string;
  readonly label:       string;
  readonly value:       string | null;
  readonly sourcePaths: readonly string[];
  readonly recheck:     boolean;
}

export interface FindingSection {
  readonly topic:       CardTopic;
  readonly title:       string;
  /** Every source path of the section's findings, once each, in the order found. */
  readonly sourcePaths: readonly string[];
  readonly items:       readonly FindingItem[];
}

export interface ScriptRow {
  readonly findingId: string;
  readonly name:      string;
  readonly run:       string;
  readonly meaning:   string;
  /** "Needs network and Postgres" for a script that needs more than the tree; `null` for one that needs nothing else. */
  readonly needsNote: string | null;
  readonly notAGate:  boolean;
  readonly recheck:   boolean;
}

export interface ResearchFacts {
  readonly setup:           BoardPipelineSetupDocument;
  readonly sessionState:    AgentSessionState;
  /** The stamp of the agent job's newest launch, only shown; `null` when the board does not carry it. */
  readonly agentLaunchedAt: string | null;
}

function uniqueSourcePathsOf(findings: readonly BoardResearchFindingDocument[]): string[] {
  return [...new Set(findings.flatMap((finding) => finding.sourcePaths))];
}

function findingSectionsOf(findings: readonly BoardResearchFindingDocument[]): FindingSection[] {
  return CARD_TOPICS.flatMap((topic) => {
    const ofTopic = findings.filter((finding) => finding.topic === topic && finding.script === null);
    if (ofTopic.length === 0) return [];
    return [{
      topic,
      title:       TOPIC_TITLES[topic],
      sourcePaths: uniqueSourcePathsOf(ofTopic),
      items:       ofTopic.map((finding) => ({
        findingId: finding.findingId, label: finding.label, value: finding.value, sourcePaths: finding.sourcePaths, recheck: finding.needsRecheck,
      })),
    }];
  });
}

function scriptFindingsOf(findings: readonly BoardResearchFindingDocument[]): BoardResearchFindingDocument[] {
  return findings.filter((finding) => finding.script !== null);
}

function needsNoteOf(needs: readonly string[]): string | null {
  if (needs.length === 0) return null;
  const last = needs.at(-1) ?? '';
  return needs.length === 1 ? `Needs ${last}` : `Needs ${needs.slice(0, -1).join(', ')} and ${last}`;
}

function scriptRowsOf(findings: readonly BoardResearchFindingDocument[]): ScriptRow[] {
  return scriptFindingsOf(findings).flatMap((finding) => {
    const { script } = finding;
    if (script === null) return [];
    return [{
      findingId: finding.findingId,
      name:      script.name,
      run:       script.run,
      meaning:   script.meaning,
      needsNote: needsNoteOf(script.needs),
      notAGate:  script.gateCandidate === 'not-a-gate',
      recheck:   finding.needsRecheck,
    }];
  });
}

/** "found in package.json; none is run here". */
function scriptsSourceTextOf(findings: readonly BoardResearchFindingDocument[]): string {
  const paths = uniqueSourcePathsOf(scriptFindingsOf(findings));
  return paths.length === 0 ? 'none is run here' : `found in ${paths.join(', ')}; none is run here`;
}

function scriptCountTextOf(findings: readonly BoardResearchFindingDocument[]): string {
  return `${scriptFindingsOf(findings).length} found`;
}

function researchStateOf(setup: BoardPipelineSetupDocument, sessionState: AgentSessionState): ResearchState {
  if (sessionState === 'stopped' || sessionState === 'not-launched') return sessionState;
  return setup.record.readyToContinue.includes('research') ? 'ready' : 'researching';
}

/** Whether the research's agent is under way, so the time since its launch counts. */
function researchIsUnderWay(state: ResearchState): boolean {
  return state === 'researching' || state === 'ready';
}

const STATE_WORDS: Readonly<Record<ResearchState, string>> = {
  'researching':  'researching',
  'ready':        'research done',
  'not-launched': 'not launched',
  'stopped':      'stopped',
};

/**
 * The status line: the pipeline agent's job, its state, the snapshot of main and its time, or "not launched" while forge refused its launch;
 * the time only while the agent runs and its launch is known.
 * Once entities have sessions of their own, the line says so after the state.
 */
function statusLineOf(facts: ResearchFacts, now: Date): string {
  const { record } = facts.setup;
  const state = researchStateOf(facts.setup, facts.sessionState);
  const agent = record.agentJobId === null ? 'Pipeline agent' : `Pipeline agent ${record.agentJobId}`;
  const perEntity = Object.keys(record.entities ?? {}).length === 0 ? [] : [SESSION_PER_ENTITY_TEXT];
  const snapshot = record.snapshotCommit === null ? [] : [`snapshot of main at ${record.snapshotCommit.slice(0, SHORT_COMMIT_LENGTH)}`];
  const elapsed = researchIsUnderWay(state) ? ElapsedTimeUtil.elapsedSinceText(facts.agentLaunchedAt, now) : null;
  return [agent, STATE_WORDS[state], ...perEntity, ...snapshot, ...(elapsed === null ? [] : [elapsed])].join(' · ');
}

/** One stand-alone codebase the layout reports: its folder, and what it is when the agent said. */
export interface LayoutItem {
  readonly findingId:   string;
  readonly folder:      string;
  readonly description: string | null;
}

/** The layout the agent reports first, in the order found: the codebases from which the `entities` step proposes entities. */
function layoutItemsOf(findings: readonly BoardResearchFindingDocument[]): LayoutItem[] {
  return findings
    .filter((finding) => finding.topic === 'layout')
    .map((finding) => ({ findingId: finding.findingId, folder: finding.label, description: finding.value }));
}

function layoutSourcePathsOf(findings: readonly BoardResearchFindingDocument[]): string[] {
  return uniqueSourcePathsOf(findings.filter((finding) => finding.topic === 'layout'));
}

/** The step Continue opens: the next one the record walks, `entities` while monorepo mode is open, else `constitution`. */
function continueStepOf(walkedSteps: readonly BoardSetupStep[]): BoardSetupStep {
  return walkedSteps[walkedSteps.indexOf('research') + 1] ?? 'constitution';
}

const PANEL_STATUSES: Readonly<Record<ResearchState, PanelStatus>> = {
  'researching':  { tone: 'working', text: 'Researching' },
  'ready':        { tone: 'ready', text: 'Research done' },
  'not-launched': NOT_LAUNCHED_PANEL_STATUS,
  'stopped':      { tone: 'idle', text: 'Stopped' },
};

/** Why the pipeline agent's job stands not launched, as forge words it; `null` while it launched or no job stands. */
function notLaunchedOf(setup: BoardPipelineSetupDocument, jobs: readonly Pick<BoardJobDocument, 'id' | 'notLaunched'>[]): BoardJobNotLaunchedDocument | null {
  return jobs.find((job) => job.id === setup.record.agentJobId)?.notLaunched ?? null;
}

/** The panel head's dot and word: "Researching", or "Not launched" while forge refused its launch. */
function panelStatusOf(state: ResearchState): PanelStatus {
  return PANEL_STATUSES[state];
}

function headingOf(project: string): string {
  return project === '' ? 'What the repository is made of' : `What ${project} is made of`;
}

/** Offered at every moment of the research: User moves on when ready, and the step marks itself done. */
function continueCommandOf(setup: BoardPipelineSetupDocument): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-step', setupId: setup.record.setupId, step: 'research', move: 'continue'
  };
}

function continueHasAttention(setup: BoardPipelineSetupDocument): boolean {
  return setup.record.readyToContinue.includes('research');
}

/** `null` once the agent stopped or never started: there is nothing to stop. */
function stopCommandOf(setup: BoardPipelineSetupDocument): BoardCommandDocument | null {
  const { agentJobId } = setup.record;
  if (agentJobId === null || setup.agentJobState === null) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-stop', jobId: agentJobId, mode: 'stop'
  };
}

export const ResearchStepModel = Object.freeze({
  findingSectionsOf,
  scriptRowsOf,
  scriptsSourceTextOf,
  scriptCountTextOf,
  researchStateOf,
  statusLineOf,
  layoutItemsOf,
  layoutSourcePathsOf,
  continueStepOf,
  panelStatusOf,
  researchIsUnderWay,
  notLaunchedOf,
  headingOf,
  continueCommandOf,
  continueHasAttention,
  stopCommandOf,
});
