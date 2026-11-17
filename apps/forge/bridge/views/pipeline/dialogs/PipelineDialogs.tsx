/**
 * The dialog an open request names, over the pipeline the board is designing or running: the agent step, review step, merge step or gate
 * dialog, or the open question a node waits on. Its Saves go to the open setup record; on a live board the first one opens an update
 * (`pipeline-update-start`) and its edits go once the record shows. A dialog closes once its edits are applied, and stays open showing
 * the refusal when they are not. At a monorepo level the constitution's link opens that level's, the merge step dialog sets only the
 * level's part of the merge train's re-review, and the product owner's dialog at the forge says it routes each ticket to an entity.
 */
import { GATE_PHASES, type GatePhase }                                      from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { PipelineFlowFacts, PipelineFlowNode, PipelineNodeMark }       from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetup }                                               from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { PipelineViewFacts }                                           from '../PipelineViewModel.ts';
import { PipelineViewModel }                                                from '../PipelineViewModel.ts';
import { PipelineAgentPanelModel }                                          from '../agent-panel/PipelineAgentPanelModel.ts';
import { ConstitutionStateTagModel, type ConstitutionState }                from '../entities/ConstitutionStateTagModel.ts';
import { entityKeyOfScope, useMonorepoLevelScope, type MonorepoLevelScope } from '../entities/MonorepoLevelContext.ts';
import { PipelineLevelModel }                                               from '../entities/PipelineLevelModel.ts';
import { usePipelineFlowEditSender }                                        from '../flow/PipelineFlowEditSender.ts';
import type { FlowOpenRequest }                                             from '../flow/PipelineFlowModel.ts';
import { PipelineFlowModel }                                                from '../flow/PipelineFlowModel.ts';
import type { GatesOpenRequest }                                            from '../gates/GatesAreaModel.ts';

import { AgentStepDialog }                from './AgentStepDialog.tsx';
import { AgentStepDialogModel }           from './AgentStepDialogModel.ts';
import { GateDialog }                     from './GateDialog.tsx';
import type { GateDialogSubject }         from './GateDialogModel.ts';
import { InstructionsEditorModel }        from './InstructionsEditorModel.ts';
import { MergeStepDialog }                from './MergeStepDialog.tsx';
import { MergeStepDialogModel }           from './MergeStepDialogModel.ts';
import { NodeQuestionDialog }             from './NodeQuestionDialog.tsx';
import { usePipelineAgentQuestionSender } from './PipelineAgentQuestionSender.ts';
import type { ProfileLogFollower }        from './ProfileBox.tsx';
import { ReviewStepDialog }               from './ReviewStepDialog.tsx';

export interface PipelineDialogsProps {
  readonly facts:      PipelineViewFacts;
  readonly request:    FlowOpenRequest | GatesOpenRequest | null;
  readonly onClose:    () => void;
  readonly followLog?: ProfileLogFollower;
}

/** Prepare steps run before every phase's gates and are added from the Build tab; a prepare dialog has no phase of its own. */
const PREPARE_STEP_PHASE: GatePhase = 'build';

function gateSubjectOf(request: FlowOpenRequest | GatesOpenRequest): GateDialogSubject | null {
  switch (request.kind) {
    case 'gate':
      return { rowKind: 'gate', name: request.gateName, phase: request.phase };
    case 'prepare-step':
      return { rowKind: 'prepare', name: request.name, phase: PREPARE_STEP_PHASE };
    case 'new-gate':
      return { rowKind: 'gate', name: null, phase: request.phase };
    case 'new-prepare-step':
      return { rowKind: 'prepare', name: null, phase: PREPARE_STEP_PHASE };
    case 'node':
    case 'question':
      return null;
  }
}

/** The row's mark in the subject's phase, else in any phase that shows it (a prepare row stands in every phase with gates). */
function rowMarkOf(gateRows: PipelineFlowFacts['gateRows'], subject: GateDialogSubject): PipelineNodeMark {
  if (subject.name === null) return 'unchanged';
  const phases = [subject.phase, ...GATE_PHASES.filter((phase) => phase !== subject.phase)];
  const row = phases.flatMap((phase) => gateRows[phase]).find((candidate) => candidate.rowKind === subject.rowKind && candidate.name === subject.name);
  return row?.mark ?? 'unchanged';
}

/** The merge node a merge step dialog is about: the node itself, or for a re-review node the merge before it. */
function mergeNodeFor(nodes: readonly PipelineFlowNode[], node: PipelineFlowNode): PipelineFlowNode | null {
  if (node.nodeKind === 'merge-main-into-tree') return node;
  const index = nodes.indexOf(node);
  return nodes.slice(0, index).reverse().find((candidate) => candidate.nodeKind === 'merge-main-into-tree') ?? null;
}

/** The conflict re-review that follows a merge, before the next merge or the end. */
function conflictReReviewAfter(nodes: readonly PipelineFlowNode[], mergeNode: PipelineFlowNode): PipelineFlowNode | null {
  const after = nodes.slice(nodes.indexOf(mergeNode) + 1);
  const nextMerge = after.findIndex((candidate) => candidate.nodeKind === 'merge-main-into-tree');
  return (nextMerge === -1 ? after : after.slice(0, nextMerge)).find((candidate) => candidate.role === 'conflictReReviewer') ?? null;
}

/** At an entity of the whole draft, the state of its constitution; `null` at the forge and in single mode. */
function entityConstitutionStateOf(scope: MonorepoLevelScope | null, record: PipelineSetup | null): ConstitutionState | null {
  const entityKey = entityKeyOfScope(scope);
  const entities = scope?.wholeDraft?.entities ?? {};
  const entity = entityKey === null || !Object.hasOwn(entities, entityKey) ? undefined : entities[entityKey];
  if (entityKey === null || entity === undefined) return null;
  return ConstitutionStateTagModel.stateOf(record, entityKey, entity);
}

export function PipelineDialogs({
  facts, request, onClose, followLog
}: PipelineDialogsProps) {
  const record = facts.pipelineSetup?.record ?? null;
  const flow = facts.pipelineFlow ?? null;
  const livePipeline = facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null;
  const draft = record?.draft ?? livePipeline;
  const editSender = usePipelineFlowEditSender(record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision }, onClose);
  const asker = usePipelineAgentQuestionSender(record?.agentJobId ?? null, onClose);
  const choices = facts.pipelineChoices ?? { models: [], efforts: [] };
  const scope = useMonorepoLevelScope();
  const constitution = InstructionsEditorModel.constitutionPlaceOf(
    draft,
    PipelineViewModel.constitutionFragmentOf(record?.mode ?? null, scope?.level ?? null),
    entityConstitutionStateOf(scope, record),
  );
  if (request === null || flow === null) return null;

  // A dialog opened on another subject starts from a fresh form.
  const dialogKey = JSON.stringify(request);
  const gateSubject = gateSubjectOf(request);
  if (gateSubject !== null) {
    return (
      <GateDialog
        key={dialogKey}
        subject={gateSubject}
        draft={draft}
        mark={rowMarkOf(flow.gateRows, gateSubject)}
        profileRuns={facts.profileRuns ?? []}
        setupId={record?.setupId ?? null}
        editSender={editSender}
        onClose={onClose}
        {...(followLog === undefined ? {} : { followLog })}
      />
    );
  }
  if (request.kind === 'question') {
    const askingNode = flow.nodes.find((candidate) => candidate.nodeId === request.nodeId) ?? null;
    if (askingNode === null || record === null) return null;
    const cards = PipelineAgentPanelModel.openQuestionCardsOf(record.questions, askingNode.questionIds, record.findings);
    if (cards.length === 0) return null;
    const nodeTitle = PipelineFlowModel.nodeViewOf(askingNode, choices.efforts).title;
    return <NodeQuestionDialog key={dialogKey} nodeTitle={nodeTitle} setupId={record.setupId} cards={cards} onClose={onClose} />;
  }
  if (request.kind !== 'node' || request.action.kind !== 'dialog') return null;
  const node = flow.nodes.find((candidate) => candidate.nodeId === request.nodeId) ?? null;
  if (node === null) return null;
  const { dialog, focusesReReview } = request.action;
  if (dialog === 'agent-step') {
    if (!AgentStepDialogModel.isAgentStepRole(node.role)) return null;
    return (
      <AgentStepDialog
        key={dialogKey}
        role={node.role}
        node={node}
        draft={draft}
        choices={choices}
        constitution={constitution}
        editSender={editSender}
        asker={asker}
        onClose={onClose}
        overEntities={scope !== null && PipelineLevelModel.isForgeLevel(scope.level)}
      />
    );
  }
  if (dialog === 'review-step') {
    const reviewNode = flow.nodes.find((candidate) => candidate.nodeKind === 'review') ?? null;
    if (reviewNode === null) return null;
    return (
      <ReviewStepDialog
        key={dialogKey}
        reviewNode={reviewNode}
        reReviewNode={flow.nodes.find((candidate) => candidate.role === 'reReviewer') ?? null}
        draft={draft}
        choices={choices}
        constitution={constitution}
        focusesReReview={focusesReReview}
        editSender={editSender}
        onClose={onClose}
      />
    );
  }
  const mergeNode = mergeNodeFor(flow.nodes, node);
  if (mergeNode === null) return null;
  return (
    <MergeStepDialog
      key={dialogKey}
      mergeNode={mergeNode}
      reReviewNode={conflictReReviewAfter(flow.nodes, mergeNode)}
      draft={draft}
      choices={choices}
      constitution={constitution}
      focusesReReview={focusesReReview}
      editSender={editSender}
      onClose={onClose}
      levelPart={MergeStepDialogModel.levelPartOf(scope?.level ?? null)}
      {...(scope?.level.kind === 'entity' ? { forgeLevelHref: scope.forgeLevelHref } : {})}
    />
  );
}
