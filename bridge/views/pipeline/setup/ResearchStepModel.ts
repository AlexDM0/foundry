/**
 * The research step's model, pure: the findings by topic with their source paths, the scripts as rows (a script that needs a network or a
 * service carries that note), the status line over the page and the one in the footer, and the commands of Continue and Stop. The research
 * runs nothing: no finding offers to run a script. Continue is always offered; the agent's `readyToContinue` only draws attention to it.
 */
import type { PipelineSetupFacts }                                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ResearchFinding, ResearchFindingTopic, SetupQuestion } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                                   from '../../../api/CommandClient.ts';
import { ChatTurnWordingUtil }                                       from '../../../conversation/ChatTurnWordingUtil.ts';
import { ElapsedTimeUtil }                                           from '../../../utils/ElapsedTimeUtil.ts';

export type CardTopic = Exclude<ResearchFindingTopic, 'scripts'>;

/** The topics a card shows, in the order drawn; scripts are rows of their own. */
const CARD_TOPICS: readonly CardTopic[] = ['stack', 'conventions', 'continuous-integration', 'note'];

const TOPIC_TITLES: Readonly<Record<CardTopic, string>> = {
  'stack':                  'Stack',
  'conventions':            'Conventions',
  'continuous-integration': 'Continuous integration',
  'note':                   'Notes',
};

const SHORT_COMMIT_LENGTH = 7;

export type ResearchState = 'researching' | 'ready' | 'stopped';

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
  readonly setup:           PipelineSetupFacts;
  /** The stamp of the agent job's newest launch, only shown; `null` when the board does not carry it. */
  readonly agentLaunchedAt: string | null;
}

function uniqueSourcePathsOf(findings: readonly ResearchFinding[]): string[] {
  return [...new Set(findings.flatMap((finding) => finding.sourcePaths))];
}

function findingSectionsOf(findings: readonly ResearchFinding[]): FindingSection[] {
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

function scriptFindingsOf(findings: readonly ResearchFinding[]): ResearchFinding[] {
  return findings.filter((finding) => finding.script !== null);
}

function needsNoteOf(needs: readonly string[]): string | null {
  if (needs.length === 0) return null;
  const last = needs.at(-1) ?? '';
  return needs.length === 1 ? `Needs ${last}` : `Needs ${needs.slice(0, -1).join(', ')} and ${last}`;
}

function scriptRowsOf(findings: readonly ResearchFinding[]): ScriptRow[] {
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
function scriptsSourceTextOf(findings: readonly ResearchFinding[]): string {
  const paths = uniqueSourcePathsOf(scriptFindingsOf(findings));
  return paths.length === 0 ? 'none is run here' : `found in ${paths.join(', ')}; none is run here`;
}

function scriptCountTextOf(findings: readonly ResearchFinding[]): string {
  return `${scriptFindingsOf(findings).length} found`;
}

function researchStateOf(setup: PipelineSetupFacts): ResearchState {
  if (setup.agentJobState === null) return 'stopped';
  return setup.record.readyToContinue.includes('research') ? 'ready' : 'researching';
}

const STATE_WORDS: Readonly<Record<ResearchState, string>> = {
  researching: 'researching',
  ready:       'research done',
  stopped:     'stopped',
};

function openResearchQuestionsOf(questions: readonly SetupQuestion[]): SetupQuestion[] {
  return questions.filter((question) => question.step === 'research' && question.answer === null);
}

/** "Pipeline agent J4 · researching · snapshot of main at 1111111 · 2m 40s"; the time only while the agent runs and its launch is known. */
function statusLineOf(facts: ResearchFacts, now: Date): string {
  const { record } = facts.setup;
  const state = researchStateOf(facts.setup);
  const agent = record.agentJobId === null ? 'Pipeline agent' : `Pipeline agent ${record.agentJobId}`;
  const snapshot = record.snapshotCommit === null ? [] : [`snapshot of main at ${record.snapshotCommit.slice(0, SHORT_COMMIT_LENGTH)}`];
  const elapsed = state === 'stopped' ? null : ElapsedTimeUtil.elapsedSinceText(facts.agentLaunchedAt, now);
  return [agent, STATE_WORDS[state], ...snapshot, ...(elapsed === null ? [] : [elapsed])].join(' · ');
}

const FOOTER_STATE_WORDS: Readonly<Record<ResearchState, string>> = {
  researching: 'Researching',
  ready:       'Research done',
  stopped:     'Pipeline agent stopped',
};

/** "Researching · 6 scripts found · 1 open question". */
function footerStatusOf(setup: PipelineSetupFacts): string {
  const { record } = setup;
  const scriptCount = scriptFindingsOf(record.findings).length;
  const openQuestionCount = openResearchQuestionsOf(record.questions).length;
  const questions = openQuestionCount === 0 ? [] : [ChatTurnWordingUtil.countTextOf(openQuestionCount, 'open question', 'open questions')];
  return [FOOTER_STATE_WORDS[researchStateOf(setup)], `${ChatTurnWordingUtil.countTextOf(scriptCount, 'script', 'scripts')} found`, ...questions].join(' · ');
}

function headingOf(project: string): string {
  return project === '' ? 'Getting to know the repository' : `Getting to know ${project}`;
}

/** Offered at every moment of the research: User moves on when ready, and the step marks itself done. */
function continueCommandOf(setup: PipelineSetupFacts): ControlCommandBody {
  return {
    kind: 'pipeline-setup-step', setupId: setup.record.setupId, step: 'research', move: 'continue'
  };
}

function continueHasAttention(setup: PipelineSetupFacts): boolean {
  return setup.record.readyToContinue.includes('research');
}

/** `null` once the agent stopped or never started: there is nothing to stop. */
function stopCommandOf(setup: PipelineSetupFacts): ControlCommandBody | null {
  const { agentJobId } = setup.record;
  if (agentJobId === null || setup.agentJobState === null) return null;
  return { kind: 'job-stop', jobId: agentJobId, mode: 'stop' };
}

export const ResearchStepModel = Object.freeze({
  findingSectionsOf,
  scriptRowsOf,
  scriptsSourceTextOf,
  scriptCountTextOf,
  researchStateOf,
  statusLineOf,
  footerStatusOf,
  headingOf,
  continueCommandOf,
  continueHasAttention,
  stopCommandOf,
});
