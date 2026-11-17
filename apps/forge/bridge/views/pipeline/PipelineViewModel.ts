/**
 * The Pipeline view's model, pure: which screen the facts and the route pick, the setup steps in their order with their words, and the
 * fragment of each step's route (`#pipeline/setup/<step>`). The screen follows the facts first: a record in `setup` mode opens the route's
 * step, or the resume summary on the bare `#pipeline`; a record in `update` or `advise` mode is the flow being edited; a readable pipeline
 * is the live flow; anything else is the setup landing, which names an unreadable file's reason. In monorepo mode a route leads with its
 * level (`PipelineLevelModel`), and the screen reads the item under it.
 */
import type { StepperStatus } from 'design-system/Stepper';

import type { LogRecord }                           from '../../../src/lib/tracker-model/@types/LogRecord.ts';
import type { EntityKey, Pipeline, PipelineEntity } from '../../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  AppliedPipelineFacts,
  EntityAssignmentFacts,
  GateCacheMarkFacts,
  GateProfileRunFacts,
  PipelineChoices,
  PipelineFlowFacts,
  PipelineFlowStage,
  PipelineSetupFacts
} from '../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetup, PipelineSetupMode, PipelineSetupStep } from '../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { AgentPair }                                           from '../../../src/lib/tracker-model/@types/Ticket.ts';
import { HashRouter, type BridgeRoute }                             from '../../shell/HashRouter.ts';
import type { TimestampSlices }                                     from '../../utils/TimeUtil.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel }      from './entities/PipelineLevelModel.ts';
import type { EntityWorkBoardFacts }                                from './live/EntityWorkModel.ts';
import { MinimalPipelineNoteModel }                                 from './live/MinimalPipelineNoteModel.ts';

/** The setup steps in their order; single mode leaves out `entities` (`setupStepsOf`). */
export const PIPELINE_SETUP_STEPS: readonly PipelineSetupStep[] = ['billing', 'research', 'entities', 'constitution', 'design', 'apply'];

export const SETUP_STEP_LABELS: Readonly<Record<PipelineSetupStep, string>> = {
  billing:      'Billing',
  research:     'Research',
  entities:     'Entities',
  constitution: 'Constitution',
  design:       'Pipeline design',
  apply:        'Apply',
};

const SETUP_ITEM_PREFIX = 'setup/';

const CONSTITUTION_EDIT_ITEM = 'edit/constitution';

/** A board job as the research step reads it: the pipeline agent's newest launch, for the elapsed time it only shows. */
export interface PipelineViewJob {
  readonly id:          string;
  readonly launchedAt?: string | null;
}

/** The facts the view reads; an Overseer that serves no pipeline facts leaves both out. */
export interface PipelineViewFacts {
  readonly project?:               string;
  readonly jobs?:                  readonly PipelineViewJob[];
  readonly pipeline?:              AppliedPipelineFacts;
  readonly pipelineSetup?:         PipelineSetupFacts | null;
  readonly pipelineFlow?:          PipelineFlowFacts | null;
  readonly profileRuns?:           readonly GateProfileRunFacts[];
  /** The cache mark of each gate in each phase whose newest run, a job's or a profile's, reported one. */
  readonly gateCacheMarks?:        readonly GateCacheMarkFacts[];
  readonly pipelineChoices?:       PipelineChoices;
  /** The pipeline agent's model and effort while no draft names them. */
  readonly pipelineAgentDefaults?: AgentPair;
  /** The newest pipeline records, newest first, for the live flow's "Earlier" list. */
  readonly pipelineHistory?:       readonly LogRecord[];
  /** The setup landing and the first Apply count the pending tickets in it; the live flow cuts its stamps by the payload's limits. */
  readonly page?:            {
    readonly tickets:  readonly { readonly status: string; readonly entity?: string }[];
    readonly payload?: { readonly limits?: TimestampSlices; readonly boardFacts?: EntityWorkBoardFacts };
  };
  /** The first Apply says how many tickets start building at a time. */
  readonly concurrency?:      { readonly limit: number };
  /** The product owner's progress after the first Apply over entities. */
  readonly entityAssignment?: EntityAssignmentFacts;
}

/** The Focus layout's title row: the page title and the sentence under it. */
export interface FlowPageWords {
  readonly title: string;
  readonly lead:  string;
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

/**
 * Monorepo mode is a fact, never a choice: the record holds entities in its own keys or its draft, or walks the `entities` step. A record
 * whose `entities` step is done while it holds no entity declined monorepo mode there, and is in single mode.
 */
function setupHasEntities(record: PipelineSetup | null): boolean {
  if (record === null) return false;
  if (record.entities !== undefined || record.draft?.entities !== undefined) return true;
  const entitiesState = record.stepStates.entities;
  if (entitiesState === undefined) return false;
  return entitiesState !== 'done' || record.currentStep === 'entities';
}

/** What the shown entities are read from: the draft of an open record, else the stored pipeline. */
export interface ShownEntitiesFacts {
  readonly pipeline?:      AppliedPipelineFacts;
  readonly pipelineSetup?: { readonly record: { readonly draft: Pick<Pipeline, 'entities'> | null } } | null;
}

/** The entities a monorepo screen shows: the draft's while a record holds a draft, else the stored pipeline's; none in single mode. */
function entitiesShownOf(facts: ShownEntitiesFacts): Readonly<Record<EntityKey, PipelineEntity>> {
  const draft = facts.pipelineSetup?.record.draft ?? null;
  if (draft !== null) return draft.entities ?? {};
  return facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline.entities ?? {} : {};
}

/** Monorepo mode is a fact, never a choice: the setup record has entities, or the stored pipeline holds them. */
function monorepoModeOf(facts: Pick<PipelineViewFacts, 'pipeline' | 'pipelineSetup'>): boolean {
  if (setupHasEntities(facts.pipelineSetup?.record ?? null)) return true;
  return facts.pipeline?.readingVerdict === 'readable' && facts.pipeline.pipeline.entities !== undefined;
}

/** The level a monorepo screen shows: the route's, else the forge; `null` in single mode, whatever the route names. */
function levelShownOf(facts: Pick<PipelineViewFacts, 'pipeline' | 'pipelineSetup'>, route: BridgeRoute): PipelineLevel | null {
  if (!monorepoModeOf(facts)) return null;
  return PipelineLevelModel.leveledItemOf(route.item).level ?? FORGE_LEVEL;
}

/** The steps the stepper shows, in order: single mode has no `entities` step. */
function setupStepsOf(record: PipelineSetup | null): readonly PipelineSetupStep[] {
  return setupHasEntities(record) ? PIPELINE_SETUP_STEPS : PIPELINE_SETUP_STEPS.filter((step) => step !== 'entities');
}

/** The step the route names, while the record has reached it: the current step, or one it walks that is not `not-started`. */
function routedStepOf(item: string | null, record: PipelineSetup): PipelineSetupStep | null {
  if (item?.startsWith(SETUP_ITEM_PREFIX) !== true) return null;
  const step = setupStepsOf(record).find((candidate) => candidate === item.slice(SETUP_ITEM_PREFIX.length));
  if (step === undefined) return null;
  const state = record.stepStates[step] ?? 'not-started';
  return step === record.currentStep || state !== 'not-started' ? step : null;
}

function unreadablePipelineOf(pipeline: AppliedPipelineFacts | undefined): UnreadablePipeline | null {
  if (pipeline?.readingVerdict === 'older') return { readingVerdict: 'older' };
  if (pipeline?.readingVerdict === 'malformed') return { readingVerdict: 'malformed', reason: pipeline.reason };
  return null;
}

function screenOf(facts: PipelineViewFacts, route: BridgeRoute): PipelineScreen {
  const record = facts.pipelineSetup?.record ?? null;
  const item = PipelineLevelModel.itemWithinLevelOf(route.item);
  if (record !== null && record.mode === 'setup') {
    const step = routedStepOf(item, record);
    return step === null ? { screen: 'setup-resume' } : { screen: 'setup-step', step };
  }
  if (record !== null) return item === CONSTITUTION_EDIT_ITEM ? { screen: 'constitution-edit' } : { screen: 'flow', stage: 'editing' };
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

/** A step's route, at the level given in monorepo mode. */
function setupStepRouteOf(step: PipelineSetupStep, level: PipelineLevel | null = null): BridgeRoute {
  const item = `${SETUP_ITEM_PREFIX}${step}`;
  return level === null ? { tab: 'pipeline', item } : PipelineLevelModel.routeAtLevel(level, item);
}

/** Where a setup step reopens, `#pipeline/setup/<step>`, or under the level given in monorepo mode. */
function setupStepFragmentOf(step: PipelineSetupStep, level: PipelineLevel | null = null): string {
  return HashRouter.fragmentOf(setupStepRouteOf(step, level));
}

/** Where the constitution is edited: its setup step in a first setup, else `#pipeline/edit/constitution` (an update, advise or a live board). */
function constitutionFragmentOf(mode: PipelineSetupMode | null, level: PipelineLevel | null = null): string {
  if (mode === 'setup') return setupStepFragmentOf('constitution', level);
  if (level !== null) return PipelineLevelModel.fragmentAtLevel(level, CONSTITUTION_EDIT_ITEM);
  return HashRouter.fragmentOf({ tab: 'pipeline', item: CONSTITUTION_EDIT_ITEM });
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

/** "Version 2 is live." while an Apply stored a version; nothing before one did. */
function liveVersionTextOf(appliedRevision: number | null): string {
  return appliedRevision === null ? '' : `Version ${appliedRevision} is live. `;
}

/**
 * The title row of a stage that draws the flow, worded as its board: the proposal designs, the live flow shows the tickets on its steps,
 * and an edit updates, the smallest pipeline saying what it lacks.
 */
function flowPageWordsOf(
  stage: PipelineFlowStage,
  flow: Pick<PipelineFlowFacts, 'nodes' | 'gateRows'> | null,
  appliedRevision: number | null
): FlowPageWords {
  if (stage === 'proposal') {
    return { title: 'Design your pipeline', lead: 'Every ticket goes through four phases. Open a phase to see who does what, and change it.' };
  }
  if (stage === 'live') {
    return { title: 'Your pipeline', lead: `${liveVersionTextOf(appliedRevision)}Each step shows the tickets at it now. Click a ticket to open it.` };
  }
  if (flow !== null && MinimalPipelineNoteModel.noteIsShownFor(flow)) {
    const gateCount = flow.gateRows.build.length + flow.gateRows.review.length + flow.gateRows.merge.length;
    const lacks = gateCount === 0 ? 'no gates and no review' : 'no review';
    return { title: 'Update your pipeline', lead: `A minimal pipeline: ${lacks}. Each phase shows where a step can go.` };
  }
  const runsOn = appliedRevision === null ? 'the applied pipeline' : `version ${appliedRevision}`;
  return { title: 'Update your pipeline', lead: `Changes show on the steps and gates. The board runs on ${runsOn} until you apply.` };
}

/** The landing's banner for a `pipeline.json` that cannot be read: its reason, and that setting up replaces the file. */
function unreadableTextOf(unreadable: UnreadablePipeline): string {
  const reason = unreadable.readingVerdict === 'older' ? 'it is in an older format' : unreadable.reason;
  return `pipeline.json cannot be read: ${reason}. A new setup replaces the file when it is applied.`;
}

/** The live flow under a `#pipeline/setup/<step>` route: the setup was applied, so the route goes back to `#pipeline`. */
function setupRouteIsLeftOf(screen: PipelineScreen, route: BridgeRoute): boolean {
  return screen.screen === 'flow' && screen.stage === 'live' && PipelineLevelModel.itemWithinLevelOf(route.item)?.startsWith(SETUP_ITEM_PREFIX) === true;
}

const LIVE_ROUTE: BridgeRoute = Object.freeze({ tab: 'pipeline', item: null });

/** Where a left setup route goes: the live flow at the route's level, or `#pipeline` on a single-mode route. */
function liveRouteOf(route: BridgeRoute): BridgeRoute {
  const { level } = PipelineLevelModel.leveledItemOf(route.item);
  return level === null ? LIVE_ROUTE : PipelineLevelModel.routeAtLevel(level, null);
}

export const PipelineViewModel = Object.freeze({
  liveRoute: LIVE_ROUTE,
  liveRouteOf,
  setupRouteIsLeftOf,
  screenOf,
  setupHasEntities,
  entitiesShownOf,
  monorepoModeOf,
  levelShownOf,
  setupStepsOf,
  setupStepStatusOf,
  setupStepRouteOf,
  setupStepFragmentOf,
  constitutionFragmentOf,
  flowPageWordsOf,
  screenTitleOf,
  unreadableTextOf,
});
