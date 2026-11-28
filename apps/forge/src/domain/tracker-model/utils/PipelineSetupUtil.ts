/** The setup record's plain readings and copies: its steps' order and states, its entity parts and questions, and the agent and billing it keeps. */
import type { EntityKey, PipelineAgent, PipelineBilling } from '../@types/Pipeline.ts';
import type {
  PipelineSetup,
  PipelineSetupEntity,
  PipelineSetupStep,
  PipelineSetupStepState,
  SetupQuestion,
  SourceAnnotation
} from '../@types/PipelineSetup.ts';
import { BoardRefusal }         from '../BoardRefusal.ts';
import { PIPELINE_SETUP_STEPS } from '../constants/PipelineSetupVocabulary.ts';
import { EntityValidationUtil } from './EntityValidationUtil.ts';

function stepIndexOf(step: PipelineSetupStep): number {
  return PIPELINE_SETUP_STEPS.indexOf(step);
}

/** A step the record does not walk is never started. */
function stepStateOf(setup: Readonly<PipelineSetup>, step: PipelineSetupStep): PipelineSetupStepState {
  return setup.stepStates[step] ?? 'not-started';
}

function entityPartsOf(setup: Readonly<PipelineSetup>): [EntityKey, PipelineSetupEntity][] {
  return Object.entries(setup.entities ?? {});
}

/** The draft may hold entities the validator refuses while User works on them; Continue and Apply wait until none stands. */
function refuseStandingEntityRefusals(setup: Readonly<PipelineSetup>): void {
  const reasons = EntityValidationUtil.refusalsOf(setup.draft?.entities ?? {}).map((refusal) => refusal.reason);
  if (reasons.length > 0) throw new BoardRefusal({ reason: 'entity-refusals-stand', setupId: setup.setupId, reasons });
}

function agentCopyOf(agent: Readonly<PipelineAgent>): PipelineAgent {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function billingCopyOf(billing: PipelineBilling): PipelineBilling {
  if (billing.mode === 'api' && billing.maxBudgetUsd !== undefined && !(billing.maxBudgetUsd > 0)) {
    throw new BoardRefusal({ reason: 'billing-cap-not-positive', maxBudgetUsd: billing.maxBudgetUsd });
  }
  return { ...billing };
}

/** The forge's questions first, then each entity's, in the record's order. */
function everyQuestionOf(setup: Readonly<PipelineSetup>): SetupQuestion[] {
  return [...setup.questions, ...entityPartsOf(setup).flatMap(([, part]) => part.questions)];
}

function linesOf(markdown: string): string[] {
  return markdown.split(/\r?\n/u);
}

function occurrencesOf(markdown: string, lineText: string): number {
  return linesOf(markdown).filter((line) => line === lineText).length;
}

/** An annotation keeps its line while that line's text still occurs at least `occurrence` times; an edited line loses its tag. */
function reanchoredAnnotationsOf(markdown: string, annotations: readonly SourceAnnotation[]): SourceAnnotation[] {
  return annotations.filter((annotation) => occurrencesOf(markdown, annotation.lineText) >= annotation.occurrence).map((annotation) => ({ ...annotation }));
}

export const PipelineSetupUtil = Object.freeze({
  stepIndexOf,
  stepStateOf,
  entityPartsOf,
  refuseStandingEntityRefusals,
  agentCopyOf,
  billingCopyOf,
  everyQuestionOf,
  occurrencesOf,
  reanchoredAnnotationsOf,
});
