/**
 * The resume summary's model, pure: each setup step with its status and the summary the facts give it, the current step's chips (open
 * questions, the pipeline agent's job), the footer's count of the done steps, the commands of Resume and Start over, and the note that
 * main moved since the research. Every word comes from the facts' counts and values; the record's statuses decide, a time never does.
 */
import { PAGE_CONTRACT_VERSIONS }                                                                 from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                                                              from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardBillingDocument, BoardPipelineDefinitionDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardJobState, BoardSetupStep }                                                     from '../../../../@types/board/BoardVocabulary.ts';
import type { StepperStatus }                                                                     from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { BoardRoute }                                                                        from '../../../shell/BoardRouter.ts';
import { PipelineViewModel, SETUP_STEP_LABELS }                                                   from '../PipelineViewModel.ts';
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

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function billingTextOf(billing: BoardBillingDocument): string {
  if (billing.mode === 'subscription') return 'Subscription';
  return billing.maximumBudgetDollars === undefined ? 'API key' : `API key · cap $${billing.maximumBudgetDollars} per launch`;
}

/** "6 entities: 2 apps, 3 packages and the root", the root counted though the draft may only imply it. */
function entitiesSummaryOf(draft: Pick<BoardPipelineDefinitionDocument, 'entities'> | null): string {
  const entities = Object.values(draft?.entities ?? {});
  if (entities.length === 0) return 'No entity proposed yet';
  const appCount = entities.filter((entity) => entity.kind === 'app').length;
  const packageCount = entities.filter((entity) => entity.kind === 'package').length;
  return `${countText(appCount + packageCount + 1, 'entity', 'entities')}: ${countText(appCount, 'app', 'apps')}, `
    + `${countText(packageCount, 'package', 'packages')} and the root`;
}

/** The step's summary once it was reached; a step not started has none, except Apply's "not yet". */
function summaryOf(facts: BoardPipelineSetupDocument, step: BoardSetupStep): string | null {
  const { record, summary } = facts;
  const reached = record.stepStates[step] !== 'not-started' || record.currentStep === step;
  switch (step) {
    case 'billing':
      return billingTextOf(record.billing);
    case 'agent':
      if (record.agent === null) return reached ? 'Not chosen yet' : null;
      return 'pinned' in record.agent.program ? `A program for this forge only: ${record.agent.program.pinned}` : 'This machine\'s program';
    case 'research':
      return reached
        ? `${countText(summary.stackItemCount, 'stack item', 'stack items')}, ${countText(summary.scriptCount, 'script', 'scripts')}, `
          + `${countText(summary.answeredResearchQuestionCount, 'question', 'questions')} answered`
        : null;
    case 'entities':
      return reached ? entitiesSummaryOf(record.draft) : null;
    case 'constitution':
      if (!reached) return null;
      return facts.constitutionOutline === null
        ? 'Not drafted yet'
        : `Drafted · ${countText(facts.constitutionOutline.sectionCount, 'section', 'sections')}, ${countText(facts.constitutionOutline.ruleCount, 'rule', 'rules')}`;
    case 'design': {
      if (!reached) return null;
      if (record.draft === null) return 'No proposal yet';
      const { build, review, merge } = summary.gateCountByPhase;
      const proposal = `Proposal saved: ${countText(summary.prepareStepCount, 'prepare step', 'prepare steps')}, `
        + `${countText(build, 'build gate', 'build gates')}, ${countText(review, 'review gate', 'review gates')}, ${countText(merge, 'merge gate', 'merge gates')}.`;
      return summary.userEditsKeptCount === 0
        ? proposal
        : `${proposal} ${countText(summary.userEditsKeptCount, 'change', 'changes')} by User kept.`;
    }
    case 'apply':
      return facts.applyState === null ? 'not yet' : ApplyPendingStateModel.summaryTextOf(facts.applyState);
  }
}

function agentChipTextOf(facts: BoardPipelineSetupDocument): string {
  const agent = facts.record.agentJobId === null ? 'Pipeline agent' : `Pipeline agent ${facts.record.agentJobId}`;
  return facts.agentJobState === null
    ? `${agent} stopped · resumes with its conversation`
    : `${agent} ${JOB_STATE_WORDS[facts.agentJobState]}`;
}

function currentChipsOf(facts: BoardPipelineSetupDocument): ResumeChip[] {
  const questionChips: ResumeChip[] = facts.openQuestionCount === 0
    ? []
    : [{ text: `${countText(facts.openQuestionCount, 'question', 'questions')} open`, tone: 'question' }];
  return [...questionChips, { text: agentChipTextOf(facts), tone: 'neutral' }];
}

function resumeStepsOf(facts: BoardPipelineSetupDocument): ResumeStep[] {
  return PipelineViewModel.setupStepsOf(facts.record).map((step) => {
    const status = PipelineViewModel.setupStepStatusOf(facts.record, step);
    const reopens = status === 'done' || status === 'recheck';
    return {
      step,
      label:     SETUP_STEP_LABELS[step],
      status,
      recheck:   status === 'recheck',
      summary:   summaryOf(facts, step),
      chips:     status === 'current' ? currentChipsOf(facts) : [],
      openRoute: reopens ? PipelineViewModel.setupStepRouteOf(step) : null,
    };
  });
}

function stepWordsOf(step: BoardSetupStep): string {
  return SETUP_STEP_LABELS[step].toLowerCase();
}

function leadTextOf(facts: BoardPipelineSetupDocument): string {
  const where = facts.agentJobState === null
    ? `Setup stopped during the ${stepWordsOf(facts.record.currentStep)}.`
    : `The pipeline agent works on the ${stepWordsOf(facts.record.currentStep)}.`;
  return `Every step was saved as it happened. ${where}`;
}

function resumeLabelOf(facts: BoardPipelineSetupDocument): string {
  return `Resume ${stepWordsOf(facts.record.currentStep)}`;
}

function resumeCommandOf(facts: BoardPipelineSetupDocument): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-resume', setupId: facts.record.setupId };
}

function startOverCommandOf(facts: BoardPipelineSetupDocument): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-start-over', setupId: facts.record.setupId };
}

/** "3 of 5 steps done", for the footer; a step to recheck was done. */
function doneStepsTextOf(facts: BoardPipelineSetupDocument): string {
  const steps = resumeStepsOf(facts);
  const doneCount = steps.filter((step) => step.status === 'done' || step.status === 'recheck').length;
  return `${doneCount} of ${steps.length} steps done`;
}

/** Shown only while main moved since the snapshot, which the facts count before Resume moves it. */
function mainMovedTextOf(facts: BoardPipelineSetupDocument): string | null {
  if (facts.mainMovedByCommits <= 0) return null;
  return `Main moved ${countText(facts.mainMovedByCommits, 'commit', 'commits')} since the research. The pipeline agent rechecks the scripts when it resumes.`;
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
