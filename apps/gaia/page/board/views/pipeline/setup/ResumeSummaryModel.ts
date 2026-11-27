/**
 * The resume summary's model, pure. Every word comes from the facts' counts and values; the record's statuses decide, a time never does.
 */
import { PAGE_CONTRACT_VERSIONS }                                                                 from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                                                              from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardBillingDocument, BoardPipelineDefinitionDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardJobState, BoardSetupStep }                                                     from '../../../../@types/board/BoardVocabulary.ts';
import type { StepperStatus }                                                                     from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { BoardRoute }                                                                        from '../../../../shared/BoardRouter.ts';
import { CountTextUtil }                                                                          from '../../../../shared/utils/CountTextUtil.ts';
import { PipelineViewModel, SETUP_STEP_LABELS }                                                   from '../PipelineViewModel.ts';
import type { AgentSessionState }                                                                 from '../agent-panel/AgentSessionModel.ts';
import { ApplyPendingStateModel }                                                                 from '../apply/ApplyPendingStateModel.ts';

export type ResumeChipTone = 'question' | 'neutral';

export interface ResumeChip {
  readonly text: string;
  readonly tone: ResumeChipTone;
}

export interface ResumeStep {
  readonly step:      BoardSetupStep;
  readonly label:     string;
  readonly status:    StepperStatus;
  /** A step that `needs-recheck`: its detail leads with the word "recheck". */
  readonly recheck:   boolean;
  readonly summary:   string | null;
  /** Only on the current step. */
  readonly chips:     readonly ResumeChip[];
  /** Where Open reopens a done or recheck step. */
  readonly openRoute: BoardRoute | null;
}

const JOB_STATE_WORDS: Readonly<Record<BoardJobState, string>> = {
  'launching':          'starting',
  'preparing':          'starting',
  'running':            'running',
  'waiting-for-answer': 'waiting for an answer',
  'interrupted':        'interrupted',
  'awaiting-answer':    'waiting for an answer',
  'in-customs':         'in customs',
  'gating':             'gating',
  'merging-main':       'merging main',
  'merging':            'merging',
  'landing':            'landing',
  'stopping':           'stopping',
};

function billingTextOf(billing: BoardBillingDocument): string {
  if (billing.mode === 'subscription') return 'Subscription';
  return billing.maximumBudgetDollars === null ? 'API key' : `API key · cap $${billing.maximumBudgetDollars} per launch`;
}

/** "6 entities: 2 apps, 3 packages and the root", the root counted though the draft may only imply it. */
function entitiesSummaryOf(draft: Pick<BoardPipelineDefinitionDocument, 'entities'> | null): string {
  const entities = Object.values(draft?.entities ?? {});
  if (entities.length === 0) return 'No entity proposed yet';
  const appCount = entities.filter((entity) => entity.kind === 'app').length;
  const packageCount = entities.filter((entity) => entity.kind === 'package').length;
  return `${CountTextUtil.countedPhrase(appCount + packageCount + 1, 'entity', 'entities')}: ${CountTextUtil.countedPhrase(appCount, 'app', 'apps')}, `
    + `${CountTextUtil.countedPhrase(packageCount, 'package', 'packages')} and the root`;
}

/** The step's summary once it was reached; a step not started has none, except Apply's "not yet". */
function summaryOf(facts: BoardPipelineSetupDocument, step: BoardSetupStep): string | null {
  const { record, summary } = facts;
  const reached = record.stepStates[step] !== 'not-started' || record.currentStep === step;
  switch (step) {
    case 'agent':
      if (record.agent === null) return reached ? 'Not chosen yet' : null;
      return 'pinned' in record.agent.program ? `A program for this forge only: ${record.agent.program.pinned}` : 'This machine\'s program';
    case 'billing':
      if (record.billing === null) return reached ? 'Not chosen yet' : null;
      return billingTextOf(record.billing);
    case 'research':
      return reached
        ? `${CountTextUtil.countedPhrase(summary.stackItemCount, 'stack item', 'stack items')}, ${CountTextUtil.countedPhrase(summary.scriptCount, 'script', 'scripts')}, `
          + `${CountTextUtil.countedPhrase(summary.answeredResearchQuestionCount, 'question', 'questions')} answered`
        : null;
    case 'entities':
      return reached ? entitiesSummaryOf(record.draft) : null;
    case 'constitution':
      if (!reached) return null;
      return facts.constitutionOutline === null
        ? 'Not drafted yet'
        : `Drafted · ${CountTextUtil.countedPhrase(facts.constitutionOutline.sectionCount, 'section', 'sections')}, `
          + CountTextUtil.countedPhrase(facts.constitutionOutline.ruleCount, 'rule', 'rules');
    case 'design': {
      if (!reached) return null;
      if (record.draft === null) return 'No proposal yet';
      const { build, review, merge } = summary.gateCountByPhase;
      const proposal = `Proposal saved: ${CountTextUtil.countedPhrase(summary.prepareStepCount, 'prepare step', 'prepare steps')}, `
        + `${CountTextUtil.countedPhrase(build, 'build gate', 'build gates')}, ${CountTextUtil.countedPhrase(review, 'review gate', 'review gates')}, `
        + `${CountTextUtil.countedPhrase(merge, 'merge gate', 'merge gates')}.`;
      return summary.userEditsKeptCount === 0
        ? proposal
        : `${proposal} ${CountTextUtil.countedPhrase(summary.userEditsKeptCount, 'change', 'changes')} by User kept.`;
    }
    case 'apply':
      return facts.applyState === null ? 'not yet' : ApplyPendingStateModel.summaryTextOf(facts.applyState);
  }
}

/**
 * A job whose launch forge refused reads as not launched, never as the starting its state names; a record no agent served yet has none to
 * resume.
 */
function agentChipTextOf(facts: BoardPipelineSetupDocument, sessionState: AgentSessionState): string {
  if (facts.record.agentJobId === null) return 'Pipeline agent not started';
  const agent = `Pipeline agent ${facts.record.agentJobId}`;
  if (sessionState === 'not-launched') return `${agent} not launched`;
  return facts.agentJobState === null
    ? `${agent} stopped · resumes with its conversation`
    : `${agent} ${JOB_STATE_WORDS[facts.agentJobState]}`;
}

function currentChipsOf(facts: BoardPipelineSetupDocument, sessionState: AgentSessionState): ResumeChip[] {
  const questionChips: ResumeChip[] = facts.openQuestionCount === 0
    ? []
    : [{ text: `${CountTextUtil.countedPhrase(facts.openQuestionCount, 'question', 'questions')} open`, tone: 'question' }];
  return [...questionChips, { text: agentChipTextOf(facts, sessionState), tone: 'neutral' }];
}

function resumeStepsOf(facts: BoardPipelineSetupDocument, sessionState: AgentSessionState): ResumeStep[] {
  return PipelineViewModel.setupStepsOf(facts.record).map((step) => {
    const status = PipelineViewModel.setupStepStatusOf(facts.record, step);
    const reopens = status === 'done' || status === 'recheck';
    return {
      step,
      label:     SETUP_STEP_LABELS[step],
      status,
      recheck:   status === 'recheck',
      summary:   summaryOf(facts, step),
      chips:     status === 'current' ? currentChipsOf(facts, sessionState) : [],
      openRoute: reopens ? PipelineViewModel.setupStepRouteOf(step) : null,
    };
  });
}

function stepWordsOf(step: BoardSetupStep): string {
  return SETUP_STEP_LABELS[step].toLowerCase();
}

const LEAD_PLACES: Readonly<Record<AgentSessionState, (stepWords: string) => string>> = {
  'running':      (stepWords) => `The pipeline agent works on the ${stepWords}.`,
  'stopping':     (stepWords) => `The pipeline agent works on the ${stepWords}.`,
  'not-launched': (stepWords) => `The pipeline agent of the ${stepWords} is not launched.`,
  'stopped':      (stepWords) => `Setup stopped during the ${stepWords}.`,
};

function leadTextOf(facts: BoardPipelineSetupDocument, sessionState: AgentSessionState): string {
  const where = LEAD_PLACES[sessionState](stepWordsOf(facts.record.currentStep));
  return `Every step was saved as it happened. ${where}`;
}

function resumeLabelOf(facts: BoardPipelineSetupDocument): string {
  return `Resume ${stepWordsOf(facts.record.currentStep)}`;
}

/**
 * The resume command; `null` for a first setup with no billing yet, which forge refuses to resume, since no pipeline agent starts before the
 * billing step chose one: Resume then only goes to the current step.
 */
function resumeCommandOf(facts: BoardPipelineSetupDocument): BoardCommandDocument | null {
  if (facts.record.mode === 'setup' && facts.record.billing === null) return null;
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-resume', setupId: facts.record.setupId };
}

function startOverCommandOf(facts: BoardPipelineSetupDocument): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-start-over', setupId: facts.record.setupId };
}

/** "3 of 5 steps done", for the footer; a step to recheck was done. */
function doneStepsTextOf(facts: BoardPipelineSetupDocument): string {
  const steps = PipelineViewModel.setupStepsOf(facts.record);
  const doneCount = steps.map((step) => PipelineViewModel.setupStepStatusOf(facts.record, step)).filter((status) => status === 'done' || status === 'recheck').length;
  return `${doneCount} of ${steps.length} steps done`;
}

/** Shown only while main moved since the snapshot, which the facts count before Resume moves it. */
function mainMovedTextOf(facts: BoardPipelineSetupDocument): string | null {
  if (facts.mainMovedByCommits <= 0) return null;
  return `Main moved ${CountTextUtil.countedPhrase(facts.mainMovedByCommits, 'commit', 'commits')} since the research. The pipeline agent rechecks the scripts when it resumes.`;
}

export const ResumeSummaryModel = Object.freeze({
  resumeStepsOf,
  leadTextOf,
  resumeLabelOf,
  resumeCommandOf,
  startOverCommandOf,
  mainMovedTextOf,
  doneStepsTextOf,
});
