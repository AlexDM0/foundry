/**
 * The board's pipeline facts mapped into the contract's board document: the stored pipeline as read, the open setup record with what the
 * forge reads around it, the flow a view draws, the gates' profile runs, cache marks and step run times, the pipeline records a view's
 * history shows, the choices a step may take and the product owner's entity assignment. A log record of a kind the contract does not
 * declare maps to no history entry.
 */
import type {
  AgentPairDocument,
  AgentStepSettingsDocument,
  ApplyRequestDocument,
  BoardAppliedPipelineDocument,
  BoardDraftEntityFactsDocument,
  BoardEntityAssignmentDocument,
  BoardGateCacheMarkDocument,
  BoardGateProfileRunDocument,
  BoardPipelineChoicesDocument,
  BoardPipelineFlowDocument,
  BoardPipelineHistoryEntryDocument,
  BoardPipelineSetupDocument,
  BoardPipelineStepRunTimeDocument,
  ConstitutionDraftDocument,
  InstructionEntryDocument,
  PipelineAirlockDocument,
  PipelineBillingDocument,
  PipelineCheckDocument,
  PipelineDefinitionDocument,
  PipelineEntityDocument,
  PipelineEntityFlowDocument,
  PipelineFlowEdgeDocument,
  PipelineFlowNodeDocument,
  PipelineGateDocument,
  PipelineGateRowsDocument,
  PipelinePhaseOrdersDocument,
  PipelineReviewDocument,
  PipelineSetupEntityDocument,
  PipelineSetupEntityFactsDocument,
  PipelineSetupRecordDocument,
  PipelineSetupSummaryDocument,
  PipelineStepDocument,
  ResearchFindingDocument,
  ResolvedSourceAnnotationDocument,
  SetupQuestionDocument,
  SourceAnnotationDocument
} from 'forge-contracts/BoardPipelineDocuments';
import type { ForgeRefusalDocument } from 'forge-contracts/ForgeRefusalDocument';

import type { DraftAnswer } from '../../../lib/tracker-model/@types/Draft.ts';
import type { GatePhase }   from '../../../lib/tracker-model/@types/GatePhase.ts';
import type { LogRecord }   from '../../../lib/tracker-model/@types/LogRecord.ts';
import {
  ENTITY_AGENT_ROLES,
  PIPELINE_AGENT_ROLES,
  type AgentStepSettings,
  type InstructionEntry,
  type Pipeline,
  type PipelineAirlock,
  type PipelineBilling,
  type PipelineEntity,
  type PipelineGate,
  type PipelinePhaseOrders,
  type PipelineReview,
  type PipelineStep
} from '../../../lib/tracker-model/@types/Pipeline.ts';
import type {
  AppliedPipelineFacts,
  ApplyRefusalFacts,
  ApplyStateFacts,
  EntityAssignmentFacts,
  GateCacheMarkFacts,
  GateProfileRunFacts,
  PipelineChoices,
  PipelineEntityFlowFacts,
  PipelineFlowEdge,
  PipelineFlowFacts,
  PipelineFlowNode,
  PipelineGateRow,
  PipelineSetupEntityFacts,
  PipelineSetupFacts,
  PipelineSetupSummary,
  PipelineStepRunTimeFacts,
  ResolvedSourceAnnotation
} from '../../../lib/tracker-model/@types/PipelineFacts.ts';
import type {
  ApplyRequest,
  ConstitutionDraft,
  PipelineCheck,
  PipelineSetup,
  PipelineSetupEntity,
  ResearchFinding,
  SetupQuestion,
  SourceAnnotation
} from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import type { AgentPair }                from '../../../lib/tracker-model/@types/Ticket.ts';
import { EntityOwnershipUtil }           from '../../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineUtil }                  from '../../../lib/tracker-model/utils/PipelineUtil.ts';
import type { ToolFacts }                from '../../../shared/@types/AgentFacts.ts';
import { OperationRefusal }              from '../../../shared/OperationRefusal.ts';
import { RefusalDocumentUtil }           from '../../utils/RefusalDocumentUtil.ts';
import { BoardAgentMappingUtil }         from './BoardAgentMappingUtil.ts';
import { BoardEntityRefusalMappingUtil } from './BoardEntityRefusalMappingUtil.ts';

function stepOf(step: PipelineStep): PipelineStepDocument {
  return { name: step.name, run: step.run, ...(step.in === undefined ? {} : { in: step.in }) };
}

function gateOf(gate: PipelineGate): PipelineGateDocument {
  return {
    name: gate.name,
    run:  gate.run,
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
    ...(gate.in === undefined ? {} : { in: gate.in }),
    ...(gate.definedBy === undefined ? {} : { definedBy: [...gate.definedBy] }),
    ...(gate.network === undefined ? {} : { network: [...gate.network] }),
    ...(gate.writes === undefined ? {} : { writes: [...gate.writes] }),
    ...(gate.forgeOnly === undefined ? {} : { forgeOnly: gate.forgeOnly }),
  };
}

function byPhaseOf<Value, Mapped>(values: Readonly<Record<GatePhase, Value>>, map: (value: Value) => Mapped): Record<GatePhase, Mapped> {
  return { build: map(values.build), review: map(values.review), merge: map(values.merge) };
}

function phasesOf(phases: PipelinePhaseOrders): PipelinePhaseOrdersDocument {
  return byPhaseOf(phases, (names) => [...names]);
}

function reviewOf(review: PipelineReview): PipelineReviewDocument {
  return { name: review.name, ...(review.reReview === undefined ? {} : { reReview: { thresholdLines: review.reReview.thresholdLines } }) };
}

function airlockOf(airlock: PipelineAirlock): PipelineAirlockDocument {
  return airlock.reReview === undefined ? {} : { reReview: { thresholdLines: airlock.reReview.thresholdLines } };
}

function instructionEntryOf(entry: InstructionEntry): InstructionEntryDocument {
  switch (entry.kind) {
    case 'constitution':
      return { kind: 'constitution' };
    case 'default-brief':
      return { kind: 'default-brief', role: entry.role };
    case 'file':
      return { kind: 'file', path: entry.path };
  }
}

function agentSettingsOf(settings: AgentStepSettings): AgentStepSettingsDocument {
  return {
    ...(settings.model === undefined ? {} : { model: settings.model }),
    ...(settings.effort === undefined ? {} : { effort: settings.effort }),
    ...(settings.instructions === undefined ? {} : { instructions: settings.instructions.map(instructionEntryOf) }),
  };
}

function agentsOf<Role extends string>(agents: Partial<Record<Role, AgentStepSettings>>, roles: readonly Role[]): Partial<Record<Role, AgentStepSettingsDocument>> {
  const mapped: Partial<Record<Role, AgentStepSettingsDocument>> = {};
  for (const role of roles) {
    const settings = agents[role];
    if (settings !== undefined) mapped[role] = agentSettingsOf(settings);
  }
  return mapped;
}

function billingOf(billing: PipelineBilling): PipelineBillingDocument {
  if (billing.mode === 'subscription') return { mode: 'subscription' };
  return { mode: 'api', ...(billing.maxBudgetUsd === undefined ? {} : { maxBudgetUsd: billing.maxBudgetUsd }) };
}

function entityOf(entity: PipelineEntity): PipelineEntityDocument {
  return {
    kind:    entity.kind,
    home:    [...entity.home],
    ...(entity.summary === undefined ? {} : { summary: entity.summary }),
    ...(entity.constitution === undefined ? {} : { constitution: { path: entity.constitution.path } }),
    prepare: entity.prepare.map(stepOf),
    gates:   entity.gates.map(gateOf),
    phases:  phasesOf(entity.phases),
    ...(entity.review === undefined ? {} : { review: reviewOf(entity.review) }),
    ...(entity.agents === undefined ? {} : { agents: agentsOf(entity.agents, ENTITY_AGENT_ROLES) }),
    ...(entity.whitelist === undefined ? {} : { whitelist: [...entity.whitelist] }),
    ...(entity.reach === undefined ? {} : { reach: [...entity.reach] }),
    ...(entity.dependsOn === undefined ? {} : { dependsOn: [...entity.dependsOn] }),
    ...(entity.concurrency === undefined ? {} : { concurrency: entity.concurrency }),
  };
}

function byEntityOf<Value, Mapped>(byEntity: Readonly<Record<string, Value>>, map: (value: Value) => Mapped): Record<string, Mapped> {
  return Object.fromEntries(Object.entries(byEntity).map(([entityKey, value]) => [entityKey, map(value)]));
}

function pipelineDefinitionOf(pipeline: Pipeline): PipelineDefinitionDocument {
  const { approvals } = pipeline;
  return {
    version: pipeline.version,
    prepare: pipeline.prepare.map(stepOf),
    gates:   pipeline.gates.map(gateOf),
    phases:  phasesOf(pipeline.phases),
    ...(pipeline.review === undefined ? {} : { review: reviewOf(pipeline.review) }),
    ...(pipeline.airlock === undefined ? {} : { airlock: airlockOf(pipeline.airlock) }),
    ...(pipeline.constitution === undefined ? {} : { constitution: { path: pipeline.constitution.path } }),
    ...(pipeline.agents === undefined ? {} : { agents: agentsOf(pipeline.agents, PIPELINE_AGENT_ROLES) }),
    ...(approvals === undefined ? {} : {
      approvals: {
        ...(approvals.tickets === undefined ? {} : { tickets: approvals.tickets }),
        ...(approvals.merge === undefined ? {} : { merge: approvals.merge }),
      }
    }),
    ...(pipeline.billing === undefined ? {} : { billing: billingOf(pipeline.billing) }),
    ...(pipeline.reach === undefined ? {} : { reach: [...pipeline.reach] }),
    ...(pipeline.entities === undefined ? {} : { entities: byEntityOf(pipeline.entities, entityOf) }),
    ...(pipeline.assistant === undefined ? {} : { assistant: pipeline.assistant }),
    ...(pipeline.agent === undefined ? {} : { agent: BoardAgentMappingUtil.pipelineAgentOf(pipeline.agent) }),
    ...(pipeline.tools === undefined ? {} : { tools: pipeline.tools.map(BoardAgentMappingUtil.pipelineToolOf) }),
  };
}

/** Each entity's pipeline as it runs, the forge's merge train, approvals and billing joined to its own; empty without entities. */
function entityPipelinesOf(pipeline: Pipeline): Record<string, PipelineDefinitionDocument> {
  return Object.fromEntries(Object.keys(pipeline.entities ?? {}).flatMap((entityKey) => {
    const entityPipeline = PipelineUtil.pipelineOfEntity(pipeline, entityKey);
    return entityPipeline === null ? [] : [[entityKey, pipelineDefinitionOf(entityPipeline)] as const];
  }));
}

function appliedPipelineOf(applied: AppliedPipelineFacts): BoardAppliedPipelineDocument {
  switch (applied.readingVerdict) {
    case 'absent':
      return { readingVerdict: 'absent' };
    case 'older':
      return { readingVerdict: 'older', fileText: applied.fileText };
    case 'malformed':
      return { readingVerdict: 'malformed', reason: applied.reason, fileText: applied.fileText };
    case 'readable':
      return {
        readingVerdict: 'readable',
        pipeline:       pipelineDefinitionOf(applied.pipeline),
        contentHash:    applied.contentHash,
        fileText:       applied.fileText,
        application:    applied.application === null ? null : {
          appliedRevision:    applied.application.appliedRevision,
          appliedAt:          applied.application.appliedAt,
          appliedBy:          applied.application.appliedBy,
          constitutionCommit: applied.application.constitutionCommit,
        },
        entityPipelines: entityPipelinesOf(applied.pipeline),
      };
  }
}

function findingOf(finding: ResearchFinding): ResearchFindingDocument {
  const { script } = finding;
  return {
    findingId:   finding.findingId,
    topic:       finding.topic,
    label:       finding.label,
    value:       finding.value,
    sourcePaths: [...finding.sourcePaths],
    script:      script === null ? null : {
      name: script.name, run: script.run, meaning: script.meaning, gateCandidate: script.gateCandidate, needs: [...script.needs]
    },
    needsRecheck: finding.needsRecheck,
  };
}

function answerOf(answer: DraftAnswer | null): SetupQuestionDocument['answer'] {
  if (answer === null) return null;
  return 'text' in answer ? { text: answer.text, answeredAt: answer.answeredAt } : { letters: [...answer.letters], answeredAt: answer.answeredAt };
}

function setupQuestionOf(question: SetupQuestion): SetupQuestionDocument {
  return {
    questionId:  question.questionId,
    step:        question.step,
    subject:     question.subject === null ? null : { kind: question.subject.kind, reference: question.subject.reference },
    question:    question.question,
    context:     question.context,
    options:     question.options.map((option) => ({ letter: option.letter, text: option.text })),
    recommended: [...question.recommended],
    multiple:    question.multiple,
    answer:      answerOf(question.answer),
  };
}

function annotationOf(annotation: SourceAnnotation): SourceAnnotationDocument {
  return {
    lineText: annotation.lineText, occurrence: annotation.occurrence, kind: annotation.kind, path: annotation.path
  };
}

function resolvedAnnotationOf(annotation: ResolvedSourceAnnotation): ResolvedSourceAnnotationDocument {
  return { ...annotationOf(annotation), lineIndex: annotation.lineIndex };
}

function constitutionDraftOf(constitution: ConstitutionDraft | null): ConstitutionDraftDocument | null {
  if (constitution === null) return null;
  const { draftedFrom } = constitution;
  return {
    markdown:    constitution.markdown,
    annotations: constitution.annotations.map(annotationOf),
    draftedFrom: { contributing: draftedFrom.contributing, research: draftedFrom.research, installedDefault: draftedFrom.installedDefault },
    baseBlob:    constitution.baseBlob,
    revision:    constitution.revision,
  };
}

function checkOf(check: PipelineCheck | undefined): PipelineCheckDocument | null {
  if (check === undefined) return null;
  const { result } = check;
  return {
    draftRevision: check.draftRevision,
    gateNames:     [...check.gateNames],
    state:         check.state,
    result:        result === null ? null : {
      snapshotCommit: result.snapshotCommit,
      prepare:        { failedSteps: [...result.prepare.failedSteps], output: result.prepare.output },
      gates:          result.gates.map((gate) => ({
        name:                  gate.name,
        outcomes:              [...gate.outcomes],
        durationsMilliseconds: [...gate.durationsMilliseconds],
        verdict:               gate.verdict,
        output:                gate.output,
      })),
    },
    reason: check.reason,
  };
}

function applyRequestOf(applyRequest: ApplyRequest): ApplyRequestDocument {
  return {
    draftRevision: applyRequest.draftRevision,
    resumesBoard:  applyRequest.resumesBoard,
    commitJobId:   applyRequest.commitJobId,
    state:         applyRequest.state,
    reason:        applyRequest.reason,
  };
}

function setupEntityOf(entity: PipelineSetupEntity): PipelineSetupEntityDocument {
  return {
    agentJobId:   entity.agentJobId,
    findings:     entity.findings.map(findingOf),
    questions:    entity.questions.map(setupQuestionOf),
    constitution: constitutionDraftOf(entity.constitution),
    check:        checkOf(entity.check),
  };
}

function setupRecordOf(record: PipelineSetup, tools: readonly ToolFacts[]): PipelineSetupRecordDocument {
  const { stepStates } = record;
  return {
    setupId:         record.setupId,
    mode:            record.mode,
    baseContentHash: record.baseContentHash,
    stepStates:      {
      billing:      stepStates.billing,
      agent:        stepStates.agent,
      research:     stepStates.research,
      constitution: stepStates.constitution,
      design:       stepStates.design,
      apply:        stepStates.apply,
      ...(stepStates.entities === undefined ? {} : { entities: stepStates.entities }),
    },
    currentStep:     record.currentStep,
    billing:         billingOf(record.billing),
    agent:           record.agent === null ? null : BoardAgentMappingUtil.pipelineAgentOf(record.agent),
    tools:           tools.map(BoardAgentMappingUtil.toolOf),
    agentJobId:      record.agentJobId,
    snapshotCommit:  record.snapshotCommit,
    readyToContinue: [...record.readyToContinue],
    findings:        record.findings.map(findingOf),
    questions:       record.questions.map(setupQuestionOf),
    constitution:    constitutionDraftOf(record.constitution),
    draft:           record.draft === null ? null : pipelineDefinitionOf(record.draft),
    draftRevision:   record.draftRevision,
    edits:           record.edits.map((edit) => ({
      editId:  edit.editId,
      by:      edit.by,
      field:   edit.field,
      summary: edit.summary,
      undone:  edit.undone,
      ...(edit.batch === undefined ? {} : { batch: edit.batch }),
    })),
    replacesUnreadablePipeline: record.replacesUnreadablePipeline,
    applyRequest:               record.applyRequest === null ? null : applyRequestOf(record.applyRequest),
    check:                      checkOf(record.check),
    ...(record.entities === undefined ? {} : { entities: byEntityOf(record.entities, setupEntityOf) }),
    ...(record.openedAtEntity === undefined ? {} : { openedAtEntity: record.openedAtEntity }),
  };
}

function setupSummaryOf(summary: Omit<PipelineSetupSummary, 'userEditsKeptCount'>): Omit<PipelineSetupSummaryDocument, 'userEditsKeptCount'> {
  return {
    stackItemCount:                summary.stackItemCount,
    scriptCount:                   summary.scriptCount,
    answeredResearchQuestionCount: summary.answeredResearchQuestionCount,
    prepareStepCount:              summary.prepareStepCount,
    gateCountByPhase:              byPhaseOf(summary.gateCountByPhase, (count) => count),
  };
}

function outlineOf(outline: PipelineSetupFacts['constitutionOutline']): BoardPipelineSetupDocument['constitutionOutline'] {
  return outline === null ? null : { sectionCount: outline.sectionCount, ruleCount: outline.ruleCount };
}

function setupEntityFactsOf(facts: PipelineSetupEntityFacts): PipelineSetupEntityFactsDocument {
  return {
    summary:              setupSummaryOf(facts.summary),
    openQuestionCount:    facts.openQuestionCount,
    agentJobState:        facts.agentJobState,
    constitutionMarkdown: facts.constitutionMarkdown,
    constitutionOutline:  outlineOf(facts.constitutionOutline),
    annotations:          facts.annotations.map(resolvedAnnotationOf),
    readByRoles:          [...facts.readByRoles],
  };
}

function applyStateOf(applyState: ApplyStateFacts | null): BoardPipelineSetupDocument['applyState'] {
  if (applyState === null) return null;
  return { ...applyRequestOf(applyState), blockingFiles: [...applyState.blockingFiles], ticketIdHoldingMain: applyState.ticketIdHoldingMain };
}

/** Each entity of the draft with the pipeline it would run and every entity that consumes it, which a crossing or a fold shows. */
function draftEntitiesOf(draft: Pipeline | null): Record<string, BoardDraftEntityFactsDocument> {
  const entities = draft?.entities;
  if (draft === null || entities === undefined) return {};
  return Object.fromEntries(Object.keys(entities).flatMap((entityKey) => {
    const effectivePipeline = PipelineUtil.pipelineOfEntity(draft, entityKey);
    return effectivePipeline === null ? [] : [[entityKey, {
      effectivePipeline:   pipelineDefinitionOf(effectivePipeline),
      dependentEntityKeys: EntityOwnershipUtil.dependentsOf(entities, [entityKey]),
    }] as const];
  }));
}

/** Worded as the command answers it: the Board's refusal, or main's constitution that git could not read. */
function applyRefusalOf(refusal: ApplyRefusalFacts | null): ForgeRefusalDocument | null {
  if (refusal === null) return null;
  return RefusalDocumentUtil.refusalDocumentOf(new OperationRefusal(refusal.kind === 'board-refusal' ? 'refused' : 'unrepaired', refusal));
}

/** `tools` are the record's tools as Hephaestus found them, which the design step lists. */
function pipelineSetupOf(setup: PipelineSetupFacts | null, tools: readonly ToolFacts[] = []): BoardPipelineSetupDocument | null {
  if (setup === null) return null;
  return {
    record:               setupRecordOf(setup.record, tools),
    summary:              { ...setupSummaryOf(setup.summary), userEditsKeptCount: setup.summary.userEditsKeptCount },
    openQuestionCount:    setup.openQuestionCount,
    agentJobState:        setup.agentJobState,
    mainMovedByCommits:   setup.mainMovedByCommits,
    constitutionMarkdown: setup.constitutionMarkdown,
    constitutionOutline:  outlineOf(setup.constitutionOutline),
    annotations:          setup.annotations.map(resolvedAnnotationOf),
    readByRoles:          [...setup.readByRoles],
    applyState:           applyStateOf(setup.applyState),
    draftEntities:        draftEntitiesOf(setup.record.draft),
    applyRefusal:         applyRefusalOf(setup.applyRefusal),
    entityRefusals:       BoardEntityRefusalMappingUtil.entityRefusalsOf(setup.record.setupId, setup.record.draft),
    ...(setup.entities === undefined ? {} : { entities: byEntityOf(setup.entities, setupEntityFactsOf) }),
  };
}

function agentPairOf(pair: AgentPair): AgentPairDocument {
  return { model: pair.model, effort: pair.effort };
}

function flowNodeOf(node: PipelineFlowNode): PipelineFlowNodeDocument {
  return {
    nodeId:             node.nodeId,
    nodeKind:           node.nodeKind,
    role:               node.role,
    settings:           node.settings === null ? null : agentPairOf(node.settings),
    instructionEntries: node.instructionEntries.map((instruction) => ({
      entry:       instructionEntryOf(instruction.entry),
      fileName:    instruction.fileName,
      readByRoles: [...instruction.readByRoles],
      text:        instruction.text,
      textIsCut:   instruction.textIsCut,
    })),
    derivedFrom:    node.derivedFrom,
    mergePlacement: node.mergePlacement,
    phase:          node.phase,
    conditional:    node.conditional,
    thresholdLines: node.thresholdLines,
    switchState:    node.switchState,
    gateChips:      node.gateChips.map((chip) => ({ gateName: chip.gateName, mark: chip.mark })),
    mark:           node.mark,
    dialogTarget:   node.dialogTarget,
    questionIds:    [...node.questionIds],
  };
}

function flowEdgeOf(edge: PipelineFlowEdge): PipelineFlowEdgeDocument {
  return {
    edgeId: edge.edgeId, from: edge.from, to: edge.to, tone: edge.tone, labelKind: edge.labelKind, active: edge.active
  };
}

function gateRowsOf(gateRows: Readonly<Record<GatePhase, readonly PipelineGateRow[]>>): PipelineGateRowsDocument {
  return byPhaseOf(gateRows, (rows) => rows.map((row) => ({
    rowKind:      row.rowKind,
    name:         row.name,
    run:          row.run,
    fix:          row.fix,
    in:           row.in,
    network:      [...row.network],
    alsoInPhases: [...row.alsoInPhases],
    mark:         row.mark,
  })));
}

function entityFlowOf(flow: PipelineEntityFlowFacts): PipelineEntityFlowDocument {
  return {
    nodes:       flow.nodes.map(flowNodeOf),
    edges:       flow.edges.map(flowEdgeOf),
    insertSlots: flow.insertSlots.map((slot) => ({ slotId: slot.slotId, after: slot.after, offeredSteps: [...slot.offeredSteps] })),
    gateRows:    gateRowsOf(flow.gateRows),
  };
}

function pipelineFlowOf(flow: PipelineFlowFacts | null): BoardPipelineFlowDocument | null {
  if (flow === null) return null;
  return {
    ...entityFlowOf(flow),
    occupants: flow.occupants.map((occupant) => ({
      occupantKind: occupant.occupantKind, occupantId: occupant.occupantId, nodeId: occupant.nodeId, jobId: occupant.jobId, since: occupant.since
    })),
    changeList:        flow.changeList.map((change) => ({ field: change.field, changeKind: change.changeKind, editId: change.editId })),
    ticketIdsInFlight: [...flow.ticketIdsInFlight],
    toolbarStage:      flow.toolbarStage,
    ...(flow.entityFlows === undefined ? {} : { entityFlows: byEntityOf(flow.entityFlows, entityFlowOf) }),
  };
}

function profileRunOf(run: GateProfileRunFacts): BoardGateProfileRunDocument {
  return {
    profileRunId:        run.profileRunId,
    ...(run.entity === undefined ? {} : { entity: run.entity }),
    gateName:            run.gateName,
    phase:               run.phase,
    state:               run.state,
    elapsedMilliseconds: run.elapsedMilliseconds,
    cacheReport:         run.cacheReport,
  };
}

function gateCacheMarkOf(mark: GateCacheMarkFacts): BoardGateCacheMarkDocument {
  return {
    ...(mark.entity === undefined ? {} : { entity: mark.entity }), gateName: mark.gateName, phase: mark.phase, cacheReport: mark.cacheReport
  };
}

function stepRunTimeOf(runTime: PipelineStepRunTimeFacts): BoardPipelineStepRunTimeDocument {
  return {
    ...(runTime.entity === undefined ? {} : { entity: runTime.entity }),
    stepKind:        runTime.stepKind,
    stepName:        runTime.stepName,
    ...(runTime.phase === undefined ? {} : { phase: runTime.phase }),
    runMilliseconds: runTime.runMilliseconds,
    ending:          runTime.ending,
    at:              runTime.at,
  };
}

/** One entry for a record of a kind the contract declares, none for any other. */
function pipelineHistoryEntriesOf(record: LogRecord): BoardPipelineHistoryEntryDocument[] {
  switch (record.kind) {
    case 'pipeline-gate-added':
      return [{ kind: record.kind, at: record.at, fields: { name: record.fields.name, run: record.fields.run } }];
    case 'pipeline-gate-removed':
      return [{ kind: record.kind, at: record.at, fields: { name: record.fields.name } }];
    case 'pipeline-gates-none':
      return [{ kind: record.kind, at: record.at }];
    case 'pipeline-gates-ordered':
      return [{ kind: record.kind, at: record.at, fields: { phase: record.fields.phase, names: [...record.fields.names] } }];
    case 'pipeline-prepare-step-set':
      return [{ kind: record.kind, at: record.at, fields: { name: record.fields.name, run: record.fields.run } }];
    case 'pipeline-approval-set':
      return [{ kind: record.kind, at: record.at, fields: { approval: record.fields.approval, state: record.fields.state } }];
    case 'pipeline-assistant-set':
      return [{ kind: record.kind, at: record.at, fields: { state: record.fields.state } }];
    case 'pipeline-setup-opened':
      return [{
        kind:    record.kind,
        at:      record.at,
        setupId: record.setupId,
        fields:  { mode: record.fields.mode, replacesUnreadablePipeline: record.fields.replacesUnreadablePipeline },
      }];
    case 'pipeline-draft-discarded':
      return [{
        kind: record.kind, at: record.at, setupId: record.setupId, fields: { revision: record.fields.revision }
      }];
    case 'pipeline-setup-discarded':
      return [{ kind: record.kind, at: record.at, setupId: record.setupId }];
    case 'hephaestus-set':
      return [{ kind: record.kind, at: record.at, fields: { state: record.fields.state } }];
    default:
      return [];
  }
}

function pipelineHistoryOf(records: readonly LogRecord[]): BoardPipelineHistoryEntryDocument[] {
  return records.flatMap(pipelineHistoryEntriesOf);
}

function pipelineChoicesOf(choices: PipelineChoices): BoardPipelineChoicesDocument {
  return { models: [...choices.models], efforts: [...choices.efforts] };
}

function entityAssignmentOf(assignment: EntityAssignmentFacts | undefined): BoardEntityAssignmentDocument | null {
  if (assignment === undefined) return null;
  return {
    jobId:    assignment.jobId,
    jobState: assignment.jobState,
    tickets:  assignment.tickets.map((ticket) => ({
      ticketId: ticket.ticketId, title: ticket.title, entity: ticket.entity, reason: ticket.reason, assignedBy: ticket.assignedBy
    })),
  };
}

export const BoardPipelineMappingUtil = Object.freeze({
  pipelineDefinitionOf,
  instructionEntryOf,
  appliedPipelineOf,
  pipelineSetupOf,
  pipelineFlowOf,
  profileRunOf,
  gateCacheMarkOf,
  stepRunTimeOf,
  pipelineHistoryOf,
  pipelineChoicesOf,
  agentPairOf,
  entityAssignmentOf,
});
