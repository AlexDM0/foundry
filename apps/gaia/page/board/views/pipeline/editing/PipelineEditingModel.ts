/**
 * The model of editing an applied pipeline (A6Editing), pure: the footer's count of the changes with the version they make, the panel
 * head's version step and the agent's status, the note that the board keeps its version until Apply, what a change card reads from the
 * applied and the draft pipeline, and the commands of Ask the pipeline agent to check and Discard. Over entities (MonoEditing) the
 * changes are grouped by level, the footer also counts the levels, and the check names the entities the draft touches.
 */
import { PAGE_CONTRACT_VERSIONS }                 from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }              from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardPipelineDefinitionDocument }   from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardJobState }                     from '../../../../@types/board/BoardVocabulary.ts';
import { ChatTurnWordingUtil }                    from '../../../conversation/ChatTurnWordingUtil.ts';
import type { PanelStatus }                       from '../PipelinePanel.tsx';
import type { FlowPageWords, PipelineViewFacts }  from '../PipelineViewModel.ts';
import type { ChangeListEditing }                 from '../apply/ChangeListModel.ts';
import { ChangeGroupModel, type ChangeGroupView } from '../entities/ChangeGroupModel.ts';
import { PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';

/** "4 changes · version 2 → 3"; only the count for a pipeline that no Apply numbered. */
function footerSummaryOf(changeCount: number, appliedRevision: number | null): string {
  const countText = ChatTurnWordingUtil.countTextOf(changeCount, 'change', 'changes');
  return appliedRevision === null ? countText : `${countText} · version ${appliedRevision} → ${appliedRevision + 1}`;
}

/** "4 changes in 3 levels · version 2 → 3": the footer of a draft over entities. */
function levelsFooterSummaryOf(changeCount: number, levelCount: number, appliedRevision: number | null): string {
  const levelsText = `${ChatTurnWordingUtil.countTextOf(changeCount, 'change', 'changes')} in ${ChatTurnWordingUtil.countTextOf(levelCount, 'level', 'levels')}`;
  return appliedRevision === null ? levelsText : `${levelsText} · version ${appliedRevision} → ${appliedRevision + 1}`;
}

/** The Changes list of a draft over entities: the forge's group first, then each entity's in the draft's order. */
function levelGroupsOf(facts: PipelineViewFacts): ChangeGroupView[] {
  const record = facts.pipeline.setup?.record ?? null;
  if (record === null) return [];
  return ChangeGroupModel.groupsOf(facts.pipeline.flow?.changeList ?? [], record.edits, Object.keys(record.draft?.entities ?? {}));
}

/** "The check covers web and design-system: the entities this draft touches."; null while the draft touches no entity. */
function checkCoverageTextOf(groups: readonly ChangeGroupView[]): string | null {
  const names = groups.filter((group) => group.level.kind === 'entity').map((group) => group.name);
  if (names.length === 0) return null;
  const listed = names.length === 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
  return `The check covers ${listed}: the ${names.length === 1 ? 'entity' : 'entities'} this draft touches.`;
}

/**
 * The page head of one level while a draft over entities is edited: the forge shares its settings with every entity, and an entity
 * opens with its summary from the draft; both say where the changes show and which version the board runs on.
 */
function levelPageWordsOf(level: PipelineLevel, draft: Pick<BoardPipelineDefinitionDocument, 'entities'> | null, appliedRevision: number | null): FlowPageWords {
  const runsOn = `The board runs on ${appliedRevision === null ? 'the applied pipeline' : `version ${appliedRevision}`} until you apply.`;
  if (level.kind !== 'entity') {
    return {
      title: PipelineLevelModel.levelNameOf(level),
      lead:  `What every entity shares: the product owner, approvals, the merge train and how many jobs run at once. ${runsOn}`,
    };
  }
  const entities = draft?.entities ?? {};
  const summary = Object.hasOwn(entities, level.key) ? entities[level.key]?.summary?.trim() ?? '' : '';
  const summarySentences = summary === '' ? [] : [PipelineLevelModel.summarySentenceOf(summary)];
  return { title: level.key, lead: [...summarySentences, 'Changes show on the steps and gates.', runsOn].join(' ') };
}

/** "Version 2 → 3" beside the Changes panel's name, "Version 2 → 3 · by level" over entities; null for a pipeline no Apply numbered. */
function versionStepTextOf(appliedRevision: number | null, byLevel = false): string | null {
  if (appliedRevision === null) return null;
  const versionStep = `Version ${appliedRevision} → ${appliedRevision + 1}`;
  return byLevel ? `${versionStep} · by level` : versionStep;
}

/** The Pipeline agent tab's dot and word: whether the agent's job runs. */
function agentStatusOf(agentJobState: BoardJobState | null): PanelStatus {
  return agentJobState === null ? { tone: 'idle', text: 'Not running' } : { tone: 'working', text: 'Running' };
}

/** "The board keeps running on version 2 until Apply." */
function boardNoteOf(appliedRevision: number | null): string {
  const version = appliedRevision === null ? 'the applied pipeline' : `version ${appliedRevision}`;
  return `The board keeps running on ${version} until Apply.`;
}

/** What the change cards read beside the change list: the flow, the applied pipeline, the draft and the profile runs. */
function changeListEditingOf(facts: PipelineViewFacts): ChangeListEditing | null {
  const flow = facts.pipeline.flow ?? null;
  if (flow === null) return null;
  return {
    flow,
    base:        facts.pipeline.applied.readingVerdict === 'readable' ? facts.pipeline.applied.pipeline : null,
    draft:       facts.pipeline.setup?.record.draft ?? null,
    profileRuns: facts.pipeline.profileRuns ?? [],
  };
}

function checkCommandOf(setupId: string): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-check', setupId };
}

function discardCommandOf(setupId: string): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-draft-discard', setupId };
}

export const PipelineEditingModel = Object.freeze({
  footerSummaryOf,
  levelsFooterSummaryOf,
  levelGroupsOf,
  levelPageWordsOf,
  checkCoverageTextOf,
  versionStepTextOf,
  agentStatusOf,
  boardNoteOf,
  changeListEditingOf,
  checkCommandOf,
  discardCommandOf,
});
