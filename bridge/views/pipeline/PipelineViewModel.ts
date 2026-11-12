/**
 * The Pipeline view's model, pure: which screen the facts and the route pick, the setup steps in their order with their words, and the
 * fragment of each step's route (`#pipeline/setup/<step>`). The screen follows the facts first: a record in `setup` mode opens the route's
 * step, or the resume summary on the bare `#pipeline`; a record in `update` or `advise` mode is the flow being edited; a readable pipeline
 * is the live flow; anything else is the setup landing, which names an unreadable file's reason.
 */
import type {
  AppliedPipelineFacts,
  GateProfileRunFacts,
  PipelineChoices,
  PipelineFlowFacts,
  PipelineSetupFacts
} from '../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetup, PipelineSetupStep } from '../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { StepperStatus }                    from '../../design-system/Stepper.tsx';
import { HashRouter, type BridgeRoute }          from '../../shell/HashRouter.ts';

/** The setup steps in their order. */
export const PIPELINE_SETUP_STEPS: readonly PipelineSetupStep[] = ['billing', 'research', 'constitution', 'design', 'apply'];

export const SETUP_STEP_LABELS: Readonly<Record<PipelineSetupStep, string>> = {
  billing:      'Billing',
  research:     'Research',
  constitution: 'Constitution',
  design:       'Pipeline design',
  apply:        'Apply',
};

const SETUP_ITEM_PREFIX = 'setup/';

const CONSTITUTION_EDIT_ITEM = 'edit/constitution';

/** The facts the view reads; an Overseer that serves no pipeline facts leaves both out. */
export interface PipelineViewFacts {
  readonly pipeline?:        AppliedPipelineFacts;
  readonly pipelineSetup?:   PipelineSetupFacts | null;
  readonly pipelineFlow?:    PipelineFlowFacts | null;
  readonly profileRuns?:     readonly GateProfileRunFacts[];
  readonly pipelineChoices?: PipelineChoices;
  /** The setup landing counts the pending tickets in it. */
  readonly page?:            { readonly tickets: readonly { readonly status: string }[] };
}

export type UnreadablePipeline =
  | { readonly readingVerdict: 'older' }
  | { readonly readingVerdict: 'malformed'; readonly reason: string };

export type PipelineScreen =
  | { readonly screen: 'setup-landing'; readonly unreadable: UnreadablePipeline | null }
  | { readonly screen: 'setup-resume' }
  | { readonly screen: 'setup-step'; readonly step: PipelineSetupStep }
  | { readonly screen: 'constitution-edit' }
  | { readonly screen: 'flow'; readonly stage: 'live' | 'editing' };

function isSetupStep(text: string): text is PipelineSetupStep {
  return (PIPELINE_SETUP_STEPS as readonly string[]).includes(text);
}

/** The step the route names, while the record has reached it: the current step, or one that is not `not-started`. */
function routedStepOf(item: string | null, record: PipelineSetup): PipelineSetupStep | null {
  if (item?.startsWith(SETUP_ITEM_PREFIX) !== true) return null;
  const step = item.slice(SETUP_ITEM_PREFIX.length);
  if (!isSetupStep(step)) return null;
  return step === record.currentStep || record.stepStates[step] !== 'not-started' ? step : null;
}

function unreadablePipelineOf(pipeline: AppliedPipelineFacts | undefined): UnreadablePipeline | null {
  if (pipeline?.readingVerdict === 'older') return { readingVerdict: 'older' };
  if (pipeline?.readingVerdict === 'malformed') return { readingVerdict: 'malformed', reason: pipeline.reason };
  return null;
}

function screenOf(facts: PipelineViewFacts, route: BridgeRoute): PipelineScreen {
  const record = facts.pipelineSetup?.record ?? null;
  if (record !== null && record.mode === 'setup') {
    const step = routedStepOf(route.item, record);
    return step === null ? { screen: 'setup-resume' } : { screen: 'setup-step', step };
  }
  if (record !== null) return route.item === CONSTITUTION_EDIT_ITEM ? { screen: 'constitution-edit' } : { screen: 'flow', stage: 'editing' };
  if (facts.pipeline?.readingVerdict === 'readable') return { screen: 'flow', stage: 'live' };
  return { screen: 'setup-landing', unreadable: unreadablePipelineOf(facts.pipeline) };
}

/** The record's current step is current, a done step done and a `needs-recheck` step recheck; with no record, Billing is current. */
function setupStepStatusOf(record: PipelineSetup | null, step: PipelineSetupStep): StepperStatus {
  if (record === null) return step === PIPELINE_SETUP_STEPS[0] ? 'current' : 'upcoming';
  if (step === record.currentStep) return 'current';
  switch (record.stepStates[step]) {
    case 'done':
      return 'done';
    case 'needs-recheck':
      return 'recheck';
    default:
      return 'upcoming';
  }
}

function setupStepRouteOf(step: PipelineSetupStep): BridgeRoute {
  return { tab: 'pipeline', item: `${SETUP_ITEM_PREFIX}${step}` };
}

/** Where a setup step reopens, `#pipeline/setup/<step>`. */
function setupStepFragmentOf(step: PipelineSetupStep): string {
  return HashRouter.fragmentOf(setupStepRouteOf(step));
}

function screenTitleOf(screen: PipelineScreen): string {
  switch (screen.screen) {
    case 'setup-landing':
      return 'Set up the pipeline';
    case 'setup-resume':
      return 'Resume setup';
    case 'setup-step':
      return SETUP_STEP_LABELS[screen.step];
    case 'constitution-edit':
      return 'Constitution';
    case 'flow':
      return screen.stage === 'live' ? 'Pipeline' : 'Editing the pipeline';
  }
}

/** The landing's banner for a `pipeline.json` that cannot be read: its reason, and that setting up replaces the file. */
function unreadableTextOf(unreadable: UnreadablePipeline): string {
  const reason = unreadable.readingVerdict === 'older' ? 'it is in an older format' : unreadable.reason;
  return `pipeline.json cannot be read: ${reason}. A new setup replaces the file when it is applied.`;
}

export const PipelineViewModel = Object.freeze({
  screenOf, setupStepStatusOf, setupStepRouteOf, setupStepFragmentOf, screenTitleOf, unreadableTextOf,
});
