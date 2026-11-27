/**
 * The live pipeline's footer and toast, pure. An Apply counts as landed once the facts show a newer applied version. On a forge over entities a
 * ticket on the flow belongs to the entity its job runs, and to the forge where the forge acts for every entity: ticket creation, the Airlock
 * and the landing on main.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }        from '../../../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }     from '../../../../@types/board/BoardJobDocuments.ts';
import type {
  BoardAppliedPipelineDocument,
  BoardFlowNodeDocument,
  BoardFlowOccupantDocument,
  BoardGateProfileRunDocument,
  BoardPipelineApplicationDocument,
  BoardPipelineDefinitionDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardGatePhase }                                 from '../../../../@types/board/BoardVocabulary.ts';
import { TimeUtil }                                            from '../../../utils/TimeUtil.ts';
import type { FlowPageWords, PipelineViewFacts }               from '../PipelineViewModel.ts';
import { ApplyChangesDialogModel }                             from '../apply/ApplyChangesDialogModel.ts';
import { EntityLevelFactsModel }                               from '../entities/EntityLevelFactsModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';
import { FlowActivityPanelModel, type StampFormat }            from './FlowActivityPanelModel.ts';

const SHORT_HASH_LENGTH = 8;

const SHORT_COMMIT_LENGTH = 7;

/** Only the user applies a pipeline; the board serves no applier beside it. */
const APPLIER_TEXT = 'User';

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

const ADVISE_COMMAND: BoardCommandDocument = Object.freeze({ boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-agent-advise', entity: null });

/** "Version 2 · applied 10:30 by User"; the time is left out when the page carries no stamp slices. */
function versionTextOf(application: BoardPipelineApplicationDocument | null, stampFormat: StampFormat | null): string {
  if (application === null) return 'Set with the gate verbs, never applied here';
  const time = stampFormat === null ? '' : ` ${TimeUtil.shortStampText(application.appliedAt, stampFormat.todayCalendarDate, stampFormat.slices)}`;
  return `Version ${String(application.appliedRevision)} · applied${time} by ${APPLIER_TEXT}`;
}

/** What the constitution commit held: the forge's one file, or over entities each entity's own, since the forge has none there. */
function committedFilesTextOf(pipeline: Pick<BoardPipelineDefinitionDocument, 'entities'>): string {
  return pipeline.entities === null ? 'CONSTITUTION.md' : 'constitutions';
}

/** The footer of a readable pipeline; null for any other reading. */
function footerOf(pipeline: BoardAppliedPipelineDocument, stampFormat: StampFormat | null): LiveFooterView | null {
  if (pipeline.readingVerdict !== 'readable') return null;
  const constitutionCommit = pipeline.application?.constitutionCommit ?? null;
  return {
    versionText: versionTextOf(pipeline.application, stampFormat),
    hashText:    `content hash ${pipeline.contentHash.slice(0, SHORT_HASH_LENGTH)}`,
    commitText:  constitutionCommit === null ? null : `${committedFilesTextOf(pipeline.pipeline)} ${constitutionCommit.slice(0, SHORT_COMMIT_LENGTH)}`,
    fileText:    pipeline.fileText,
  };
}

/** The applied version once it is newer than the one before the Apply was sent; null while the Apply has not landed. */
function landedRevisionOf(revisionBefore: number | null, pipeline: BoardAppliedPipelineDocument): number | null {
  const revision = ApplyChangesDialogModel.appliedRevisionOf(pipeline);
  if (revision === null) return null;
  return revisionBefore === null || revision > revisionBefore ? revision : null;
}

function toastOf(resumesBoard: boolean, appliedRevision: number): LiveToastView {
  const version = `Version ${String(appliedRevision)} is live.`;
  return { title: 'Pipeline applied', text: resumesBoard ? `Board resumed · ${version}` : version };
}

/** The view's facts with the jobs that hold a launch slot, which each entity's jobs count against its cap on a forge over entities. */
export type LivePipelineFacts = PipelineViewFacts & Pick<BoardDocument, 'launchSlots'>;

const AGENT_TAB_LABEL = 'Pipeline agent';

const ASK_LABEL = 'Ask the pipeline agent';

/** Where the forge acts for every entity: the product owner and ticket review, the merge train's own steps and the landing on main. */
function nodeIsTheForges(node: Pick<BoardFlowNodeDocument, 'nodeKind' | 'mergePlacement' | 'role'>): boolean {
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
function occupantEntityOf(occupant: Pick<BoardFlowOccupantDocument, 'jobId'>, jobs: readonly Pick<BoardJobDocument, 'id' | 'entity'>[]): string | null {
  if (occupant.jobId === null) return null;
  return jobs.find((job) => job.id === occupant.jobId)?.entity ?? null;
}

/** The level an occupant is at: the forge on a step the forge holds, else its job's entity; null while it belongs to no entity yet. */
function occupantLevelOf(
  occupant: Pick<BoardFlowOccupantDocument, 'jobId'>,
  node: Pick<BoardFlowNodeDocument, 'nodeKind' | 'mergePlacement' | 'role'>,
  jobs: readonly Pick<BoardJobDocument, 'id' | 'entity'>[],
): PipelineLevel | null {
  if (nodeIsTheForges(node)) return FORGE_LEVEL;
  const entityKey = occupantEntityOf(occupant, jobs);
  return entityKey === null ? null : PipelineLevelModel.entityLevelOf(entityKey);
}

/** The entity's live facts: its own flow and gates as single mode draws them, with only its own tickets standing on the steps it draws. */
function factsLiveAtEntityOf(facts: LivePipelineFacts, entityKey: string): PipelineViewFacts {
  const forgeFlow = facts.pipeline.flow;
  const entityFacts = EntityLevelFactsModel.factsAtEntityOf(facts, entityKey);
  const entityFlow = entityFacts.pipeline.flow;
  if (forgeFlow === null || entityFlow === null) return entityFacts;
  const { jobs } = facts;
  const drawnNodeIds = new Set(entityFlow.nodes.map((node) => node.nodeId));
  const occupants = forgeFlow.occupants.filter((occupant) => drawnNodeIds.has(occupant.nodeId) && occupantEntityOf(occupant, jobs) === entityKey);
  return { ...entityFacts, pipeline: { ...entityFacts.pipeline, flow: { ...entityFlow, occupants } } };
}

function homeTextOf(homes: readonly string[]): string {
  return homes.map((home) => (home === '/' ? 'the repository root' : home.slice(1))).join(', ');
}

/** The level's title and lead on the live page: the entity's summary, its home and the version that is live, or what the forge holds. */
function levelPageWordsOf(level: PipelineLevel, pipeline: BoardAppliedPipelineDocument): FlowPageWords {
  if (PipelineLevelModel.isForgeLevel(level)) {
    return {
      title: PipelineLevelModel.levelNameOf(level),
      lead:  'What every entity shares: the product owner, approvals, the merge train and how many jobs run at once. Gates belong to an entity; pick one on the left.',
    };
  }
  const readable = pipeline.readingVerdict === 'readable' ? pipeline : null;
  const entities = readable?.pipeline.entities ?? {};
  const entity = Object.hasOwn(entities, level.key) ? entities[level.key] : undefined;
  const revision = readable?.application?.appliedRevision ?? null;
  const sentences = [
    ...(entity === undefined || entity.summary === null ? [] : [PipelineLevelModel.summarySentenceOf(entity.summary)]),
    ...(entity === undefined ? [] : [`Home: ${homeTextOf(entity.home)}.`]),
    ...(revision === null ? [] : [`Version ${String(revision)} is live.`]),
    `Each step shows ${level.key}’s tickets at it now.`,
  ];
  return { title: level.key, lead: sentences.join(' ') };
}

/** The pipeline agent asked at an entity reads that entity; at the forge, the forge. */
function adviseCommandOf(level: PipelineLevel): BoardCommandDocument {
  return level.kind === 'entity' ? { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-agent-advise', entity: level.key } : ADVISE_COMMAND;
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
function profilesUnderWayTextsOf(profileRuns: readonly Pick<BoardGateProfileRunDocument, 'gateName' | 'phase' | 'state'>[], phase: BoardGatePhase): string[] {
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
