/**
 * The live pipeline's footer and toast, pure: the applied version with its time and who applied it, the content hash and the commit
 * that the newest Apply landed `CONSTITUTION.md` in; the Apply this view sent counts as landed once the facts show a newer applied
 * version, and its toast says "Board resumed" only when that Apply resumed the board.
 * On a forge over entities (MonoLive) the live flow is one level's: a ticket or draft on the flow belongs to the entity its job runs, and
 * to the forge while it stands where the forge acts for every entity (ticket creation, the Airlock, the landing on main); an entity's
 * level shows only its own tickets, on its own flow. The page words, the pipeline agent's tab, the advise command and the gate profiles
 * under way follow the level. An occupant whose job names no entity belongs to no entity yet.
 */
import type { GatePhase } from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { EntityKey } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  AppliedPipelineFacts,
  GateProfileRunFacts,
  PipelineApplication,
  PipelineFlowNode,
  PipelineOccupant
} from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ControlCommandBody }                             from '../../../api/CommandClient.ts';
import { TimeUtil }                                            from '../../../utils/TimeUtil.ts';
import type { FlowPageWords, PipelineViewFacts }               from '../PipelineViewModel.ts';
import { ApplyChangesDialogModel }                             from '../apply/ApplyChangesDialogModel.ts';
import { EntityLevelFactsModel }                               from '../entities/EntityLevelFactsModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';
import { FlowActivityPanelModel, type StampFormat }            from './FlowActivityPanelModel.ts';

const SHORT_HASH_LENGTH = 8;

const SHORT_COMMIT_LENGTH = 7;

const APPLIER_WORDS: Readonly<Record<PipelineApplication['appliedBy'], string>> = Object.freeze({ user: 'User' });

export interface LiveFooterView {
  readonly versionText: string;
  readonly hashText:    string;
  /** Null when the newest Apply made no constitution commit. */
  readonly commitText:  string | null;
  readonly fileText:    string;
}

export interface LiveToastView {
  readonly title: string;
  readonly text:  string;
}

const ADVISE_COMMAND: ControlCommandBody = Object.freeze({ kind: 'pipeline-agent-advise' });

/** "Version 2 · applied 10:30 by User"; the time is left out when the page carries no stamp slices. */
function versionTextOf(application: PipelineApplication | null, stampFormat: StampFormat | null): string {
  if (application === null) return 'Set with the gate verbs, never applied here';
  const applier = APPLIER_WORDS[application.appliedBy];
  const time = stampFormat === null ? '' : ` ${TimeUtil.shortStampText(application.appliedAt, stampFormat.todayCalendarDate, stampFormat.slices)}`;
  return `Version ${String(application.appliedRevision)} · applied${time} by ${applier}`;
}

/** The footer of a readable pipeline; null for any other reading. */
function footerOf(pipeline: AppliedPipelineFacts | undefined, stampFormat: StampFormat | null): LiveFooterView | null {
  if (pipeline?.readingVerdict !== 'readable') return null;
  const constitutionCommit = pipeline.application?.constitutionCommit ?? null;
  return {
    versionText: versionTextOf(pipeline.application, stampFormat),
    hashText:    `content hash ${pipeline.contentHash.slice(0, SHORT_HASH_LENGTH)}`,
    commitText:  constitutionCommit === null ? null : `CONSTITUTION.md ${constitutionCommit.slice(0, SHORT_COMMIT_LENGTH)}`,
    fileText:    pipeline.fileText,
  };
}

/** The applied version once it is newer than the one before the Apply was sent; null while the Apply has not landed. */
function landedRevisionOf(revisionBefore: number | null, pipeline: AppliedPipelineFacts | undefined): number | null {
  const revision = ApplyChangesDialogModel.appliedRevisionOf(pipeline);
  if (revision === null) return null;
  return revisionBefore === null || revision > revisionBefore ? revision : null;
}

function toastOf(resumesBoard: boolean, appliedRevision: number): LiveToastView {
  const version = `Version ${String(appliedRevision)} is live.`;
  return { title: 'Pipeline applied', text: resumesBoard ? `Board resumed · ${version}` : version };
}

/** A board job as the live flow reads it: the entity whose stage it runs, once the Overseer set one. */
export interface LiveFlowJob {
  readonly id:          string;
  readonly launchedAt?: string | null;
  readonly entity?:     EntityKey;
}

/** The view's facts with what the live flow of a forge over entities reads beside them: each job's entity and the jobs in flight. */
export type LivePipelineFacts = Omit<PipelineViewFacts, 'jobs' | 'concurrency'> & {
  readonly jobs?:        readonly LiveFlowJob[];
  readonly concurrency?: { readonly limit: number; readonly agentsInFlight?: number };
};

const AGENT_TAB_LABEL = 'Pipeline agent';

const ASK_LABEL = 'Ask the pipeline agent';

/** Where the forge acts for every entity: the product owner and ticket review, the merge train's own steps and the landing on main. */
function nodeIsTheForges(node: Pick<PipelineFlowNode, 'nodeKind' | 'mergePlacement' | 'role'>): boolean {
  switch (node.nodeKind) {
    case 'ticket-creation':
    case 'human-ticket-review':
    case 'airlock':
    case 'fast-forward-main':
      return true;
    case 'merge-main-into-tree':
      return node.mergePlacement === 'airlock';
    case 're-review':
      return node.role === 'conflictReReviewer';
    default:
      return false;
  }
}

/** The entity the occupant's job runs a stage of; null while no job holds it or its job names none. */
function occupantEntityOf(occupant: Pick<PipelineOccupant, 'jobId'>, jobs: readonly LiveFlowJob[]): EntityKey | null {
  if (occupant.jobId === null) return null;
  return jobs.find((job) => job.id === occupant.jobId)?.entity ?? null;
}

/** The level an occupant is at: the forge on a step the forge holds, else its job's entity; null while it belongs to no entity yet. */
function occupantLevelOf(
  occupant: Pick<PipelineOccupant, 'jobId'>,
  node: Pick<PipelineFlowNode, 'nodeKind' | 'mergePlacement' | 'role'>,
  jobs: readonly LiveFlowJob[],
): PipelineLevel | null {
  if (nodeIsTheForges(node)) return FORGE_LEVEL;
  const entityKey = occupantEntityOf(occupant, jobs);
  return entityKey === null ? null : PipelineLevelModel.entityLevelOf(entityKey);
}

/** The entity's live facts: its own flow and gates as single mode draws them, with only its own tickets standing on the steps it draws. */
function factsLiveAtEntityOf(facts: LivePipelineFacts, entityKey: EntityKey): PipelineViewFacts {
  const forgeFlow = facts.pipelineFlow ?? null;
  const entityFacts = EntityLevelFactsModel.factsAtEntityOf(facts, entityKey);
  const entityFlow = entityFacts.pipelineFlow ?? null;
  if (forgeFlow === null || entityFlow === null) return entityFacts;
  const jobs = facts.jobs ?? [];
  const drawnNodeIds = new Set(entityFlow.nodes.map((node) => node.nodeId));
  const occupants = forgeFlow.occupants.filter((occupant) => drawnNodeIds.has(occupant.nodeId) && occupantEntityOf(occupant, jobs) === entityKey);
  return { ...entityFacts, pipelineFlow: { ...entityFlow, occupants } };
}

function homeTextOf(homes: readonly string[]): string {
  return homes.map((home) => (home === '/' ? 'the repository root' : home.slice(1))).join(', ');
}

/** The level's title and lead on the live page: the entity's summary, its home and the version that is live, or what the forge holds. */
function levelPageWordsOf(level: PipelineLevel, pipeline: AppliedPipelineFacts | undefined): FlowPageWords {
  if (PipelineLevelModel.isForgeLevel(level)) {
    return {
      title: PipelineLevelModel.levelNameOf(level),
      lead:  'What every entity shares: the product owner, approvals, the merge train and how many jobs run at once. Gates belong to an entity; pick one on the left.',
    };
  }
  const readable = pipeline?.readingVerdict === 'readable' ? pipeline : null;
  const entities = readable?.pipeline.entities ?? {};
  const entity = Object.hasOwn(entities, level.key) ? entities[level.key] : undefined;
  const revision = readable?.application?.appliedRevision ?? null;
  const sentences = [
    ...(entity?.summary === undefined ? [] : [entity.summary.trim()]),
    ...(entity === undefined ? [] : [`Home: ${homeTextOf(entity.home)}.`]),
    ...(revision === null ? [] : [`Version ${String(revision)} is live.`]),
    `Each step shows ${level.key}’s tickets at it now.`,
  ];
  return { title: level.key, lead: sentences.join(' ') };
}

/** The pipeline agent asked at an entity reads that entity; at the forge, the forge. */
function adviseCommandOf(level: PipelineLevel): ControlCommandBody {
  return level.kind === 'entity' ? { kind: 'pipeline-agent-advise', entity: level.key } : ADVISE_COMMAND;
}

/** "Pipeline agent · web". */
function agentTabLabelOf(level: PipelineLevel | null): string {
  return level === null ? AGENT_TAB_LABEL : `${AGENT_TAB_LABEL} · ${PipelineLevelModel.levelNameOf(level)}`;
}

/** "Ask the pipeline agent about web", "Ask the pipeline agent about the Forge level". */
function askLabelOf(level: PipelineLevel | null): string {
  if (level === null) return ASK_LABEL;
  return `${ASK_LABEL} about ${level.kind === 'entity' ? level.key : `the ${PipelineLevelModel.levelNameOf(level)} level`}`;
}

/** "test being profiled", for each profile of a gate of the phase that is queued or running. */
function profilesUnderWayTextsOf(profileRuns: readonly Pick<GateProfileRunFacts, 'gateName' | 'phase' | 'state'>[], phase: GatePhase): string[] {
  return profileRuns
    .filter((run) => run.phase === phase && FlowActivityPanelModel.profileRunIsUnderWay(run))
    .map((run) => `${run.gateName} being profiled`);
}

export const LivePipelineModel = Object.freeze({
  adviseCommand: ADVISE_COMMAND,
  footerOf,
  landedRevisionOf,
  toastOf,
  nodeIsTheForges,
  occupantEntityOf,
  occupantLevelOf,
  factsLiveAtEntityOf,
  levelPageWordsOf,
  adviseCommandOf,
  agentTabLabelOf,
  askLabelOf,
  profilesUnderWayTextsOf,
});
