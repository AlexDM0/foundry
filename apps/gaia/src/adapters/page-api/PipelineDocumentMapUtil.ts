/**
 * Maps the pipeline part of Gaia's board model out to the page's board contract, key by key, so a key the model gains reaches the page only
 * when the contract names it. A refusal leaves with the forge's sentence unchanged (decision 45).
 */
import type {
  BoardAgentPairDocument,
  BoardAgentStepSettingsDocument,
  BoardAppliedPipelineDocument,
  BoardApplyStateDocument,
  BoardBillingDocument,
  BoardCheckResultDocument,
  BoardConditionalReReviewDocument,
  BoardConstitutionDraftDocument,
  BoardConstitutionOutlineDocument,
  BoardConstitutionSourcesDocument,
  BoardDraftEditDocument,
  BoardDraftEntityFactsDocument,
  BoardEntityAssignmentDocument,
  BoardEntityDraftEditDocument,
  BoardEntityFlowDocument,
  BoardEntityRefusalDocument,
  BoardFlowNodeDocument,
  BoardGateRowsDocument,
  BoardInstructionDocument,
  BoardPipelineCheckDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineEntityDocument,
  BoardPipelineFactsDocument,
  BoardPipelineFlowDocument,
  BoardPipelineGateDocument,
  BoardPipelineHistoryEntryDocument,
  BoardPipelineReviewDocument,
  BoardPipelineSetupDocument,
  BoardPipelineStepDocument,
  BoardResearchFindingDocument,
  BoardSetupEntityDocument,
  BoardSetupEntityFactsDocument,
  BoardSetupEntitySummaryDocument,
  BoardSetupQuestionDocument,
  BoardSetupRecordDocument,
  BoardSourceAnnotationDocument,
  BoardStepsDraftEditDocument,
} from '../../../page/@types/board/BoardPipelineDocuments.ts';
import type { BoardForgeRefusalDocument }                                from '../../../page/@types/board/BoardRelayDocuments.ts';
import type { BoardQuestionAnswerDocument, BoardQuestionOptionDocument } from '../../../page/@types/board/BoardTicketDocuments.ts';
import type { MarkdownRendering }                                        from '../../lib/markdown-render/MarkdownRenderer.ts';
import type {
  BoardAgentPair,
  BoardAgentStepSettings,
  BoardAppliedPipeline,
  BoardApplyState,
  BoardBilling,
  BoardCheckResult,
  BoardConditionalReReview,
  BoardConstitutionDraft,
  BoardConstitutionOutline,
  BoardConstitutionSources,
  BoardDraftEdit,
  BoardDraftEntityFacts,
  BoardEntityAssignment,
  BoardEntityDraftEdit,
  BoardEntityFlow,
  BoardEntityRefusal,
  BoardFlowNode,
  BoardGateRows,
  BoardInstruction,
  BoardPipelineCheck,
  BoardPipelineDefinition,
  BoardPipelineEntity,
  BoardPipelineFacts,
  BoardPipelineFlow,
  BoardPipelineGate,
  BoardPipelineHistoryEntry,
  BoardPipelineReview,
  BoardPipelineSetup,
  BoardPipelineStep,
  BoardResearchFinding,
  BoardSetupEntity,
  BoardSetupEntityFacts,
  BoardSetupEntitySummary,
  BoardSetupQuestion,
  BoardSetupRecord,
  BoardSourceAnnotation,
  BoardStepsDraftEdit,
} from '../../shared/@types/board/BoardPipeline.ts';
import type { BoardRefusal }                             from '../../shared/@types/board/BoardRefusal.ts';
import type { BoardQuestionAnswer, BoardQuestionOption } from '../../shared/@types/board/BoardTicket.ts';

/** Each value of a record mapped, its keys kept. */
function recordOutOf<ModelValue, PageValue, Key extends string>(
  record: Readonly<Record<Key, ModelValue>>, pageValueOf: (modelValue: ModelValue) => PageValue,
): Readonly<Record<Key, PageValue>> {
  return Object.fromEntries(Object.entries<ModelValue>(record).map(([key, modelValue]) => [key, pageValueOf(modelValue)])) as Record<Key, PageValue>;
}

function partialRecordOutOf<ModelValue, PageValue, Key extends string>(
  record: Readonly<Partial<Record<Key, ModelValue>>>, pageValueOf: (modelValue: ModelValue) => PageValue,
): Readonly<Partial<Record<Key, PageValue>>> {
  const entries = Object.entries(record) as [Key, ModelValue | undefined][];
  return Object.fromEntries(entries.flatMap(([key, modelValue]) => modelValue === undefined ? [] : [[key, pageValueOf(modelValue)]])) as Partial<Record<Key, PageValue>>;
}

function nullableRecordOutOf<ModelValue, PageValue>(
  record: Readonly<Record<string, ModelValue>> | null, pageValueOf: (modelValue: ModelValue) => PageValue,
): Readonly<Record<string, PageValue>> | null {
  return record === null ? null : recordOutOf(record, pageValueOf);
}

/** A forge's refusal as the page shows it: its code, its fields and the forge's sentence, byte for byte. */
function refusalOut(refusal: BoardRefusal): BoardForgeRefusalDocument {
  return {
    refusedBy: 'forge',
    code:      refusal.code,
    fields:    refusal.fields,
    text:      refusal.sentence,
  };
}

function agentPairOut(pair: BoardAgentPair): BoardAgentPairDocument {
  return { model: pair.model, effort: pair.effort };
}

function stepOut(step: BoardPipelineStep): BoardPipelineStepDocument {
  return { name: step.name, run: step.run, runsIn: step.runsIn };
}

function gateOut(gate: BoardPipelineGate): BoardPipelineGateDocument {
  return {
    name:    gate.name,
    run:     gate.run,
    fix:     gate.fix,
    runsIn:  gate.runsIn,
    network: gate.network,
    writes:  gate.writes,
  };
}

function instructionOut(instruction: BoardInstruction): BoardInstructionDocument {
  switch (instruction.kind) {
    case 'constitution':
      return { kind: 'constitution' };
    case 'default-brief':
      return { kind: 'default-brief', role: instruction.role };
    case 'file':
      return { kind: 'file', path: instruction.path };
  }
}

function agentStepSettingsOut(settings: BoardAgentStepSettings): BoardAgentStepSettingsDocument {
  return {
    model:        settings.model,
    effort:       settings.effort,
    instructions: settings.instructions === null ? null : settings.instructions.map(instructionOut),
  };
}

function reReviewOut(reReview: BoardConditionalReReview | null): BoardConditionalReReviewDocument | null {
  return reReview === null ? null : { thresholdLines: reReview.thresholdLines };
}

function reviewOut(review: BoardPipelineReview | null): BoardPipelineReviewDocument | null {
  return review === null ? null : { name: review.name, reReview: reReviewOut(review.reReview) };
}

function billingOut(billing: BoardBilling): BoardBillingDocument {
  return billing.mode === 'subscription' ? { mode: 'subscription' } : { mode: 'api', maximumBudgetDollars: billing.maximumBudgetDollars };
}

function pipelineEntityOut(entity: BoardPipelineEntity): BoardPipelineEntityDocument {
  return {
    kind:             entity.kind,
    home:             entity.home,
    summary:          entity.summary,
    constitutionPath: entity.constitutionPath,
    prepare:          entity.prepare.map(stepOut),
    gates:            entity.gates.map(gateOut),
    phases:           recordOutOf(entity.phases, (names) => names),
    review:           reviewOut(entity.review),
    agents:           partialRecordOutOf(entity.agents, agentStepSettingsOut),
    whitelist:        entity.whitelist,
    reach:            entity.reach,
    dependsOn:        entity.dependsOn,
    concurrency:      entity.concurrency,
  };
}

function pipelineDefinitionOut(pipeline: BoardPipelineDefinition): BoardPipelineDefinitionDocument {
  return {
    version:          pipeline.version,
    prepare:          pipeline.prepare.map(stepOut),
    gates:            pipeline.gates.map(gateOut),
    phases:           recordOutOf(pipeline.phases, (names) => names),
    review:           reviewOut(pipeline.review),
    airlock:          pipeline.airlock === null ? null : { reReview: reReviewOut(pipeline.airlock.reReview) },
    constitutionPath: pipeline.constitutionPath,
    agents:           partialRecordOutOf(pipeline.agents, agentStepSettingsOut),
    approvals:        partialRecordOutOf(pipeline.approvals, (approved) => approved),
    billing:          pipeline.billing === null ? null : billingOut(pipeline.billing),
    reach:            pipeline.reach,
    entities:         nullableRecordOutOf(pipeline.entities, pipelineEntityOut),
  };
}

function appliedPipelineOut(applied: BoardAppliedPipeline): BoardAppliedPipelineDocument {
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
        pipeline:       pipelineDefinitionOut(applied.pipeline),
        contentHash:    applied.contentHash,
        fileText:       applied.fileText,
        application:    applied.application === null ? null : {
          appliedRevision:    applied.application.appliedRevision,
          appliedAt:          applied.application.appliedAt,
          constitutionCommit: applied.application.constitutionCommit,
        },
        entityPipelines: recordOutOf(applied.entityPipelines, pipelineDefinitionOut),
      };
  }
}

function researchFindingOut(finding: BoardResearchFinding): BoardResearchFindingDocument {
  return {
    findingId:   finding.findingId,
    topic:       finding.topic,
    label:       finding.label,
    value:       finding.value,
    sourcePaths: finding.sourcePaths,
    script:      finding.script === null ? null : {
      name:          finding.script.name,
      run:           finding.script.run,
      meaning:       finding.script.meaning,
      gateCandidate: finding.script.gateCandidate,
      needs:         finding.script.needs,
    },
    needsRecheck: finding.needsRecheck,
  };
}

function questionOptionOut(option: BoardQuestionOption): BoardQuestionOptionDocument {
  return { letter: option.letter, text: option.text };
}

function questionAnswerOut(answer: BoardQuestionAnswer | null): BoardQuestionAnswerDocument | null {
  if (answer === null) return null;
  if (answer.form === 'letters') return { form: 'letters', letters: answer.letters, answeredAt: answer.answeredAt };
  return { form: 'text', text: answer.text, answeredAt: answer.answeredAt };
}

function setupQuestionOut(question: BoardSetupQuestion): BoardSetupQuestionDocument {
  return {
    questionId:  question.questionId,
    step:        question.step,
    subject:     question.subject === null ? null : { kind: question.subject.kind, reference: question.subject.reference },
    question:    question.question,
    context:     question.context,
    options:     question.options.map(questionOptionOut),
    recommended: question.recommended,
    multiple:    question.multiple,
    answer:      questionAnswerOut(question.answer),
  };
}

function sourceAnnotationOut(annotation: BoardSourceAnnotation): BoardSourceAnnotationDocument {
  return {
    lineText:   annotation.lineText,
    occurrence: annotation.occurrence,
    kind:       annotation.kind,
    path:       annotation.path,
  };
}

function constitutionSourcesOut(sources: BoardConstitutionSources): BoardConstitutionSourcesDocument {
  return { contributing: sources.contributing, research: sources.research, installedDefault: sources.installedDefault };
}

function constitutionDraftOut(draft: BoardConstitutionDraft | null): BoardConstitutionDraftDocument | null {
  if (draft === null) return null;
  return {
    markdown:    draft.markdown,
    annotations: draft.annotations.map(sourceAnnotationOut),
    draftedFrom: constitutionSourcesOut(draft.draftedFrom),
    revision:    draft.revision,
  };
}

function checkResultOut(result: BoardCheckResult): BoardCheckResultDocument {
  return {
    snapshotCommit:     result.snapshotCommit,
    prepareFailedSteps: result.prepareFailedSteps,
    prepareOutput:      result.prepareOutput,
    gates:              result.gates.map((gate) => ({ name: gate.name, verdict: gate.verdict, output: gate.output })),
  };
}

function checkOut(check: BoardPipelineCheck | null): BoardPipelineCheckDocument | null {
  if (check === null) return null;
  return {
    draftRevision: check.draftRevision,
    gateNames:     check.gateNames,
    state:         check.state,
    result:        check.result === null ? null : checkResultOut(check.result),
    reason:        check.reason,
  };
}

function setupEntityOut(entity: BoardSetupEntity): BoardSetupEntityDocument {
  return {
    agentJobId:   entity.agentJobId,
    findings:     entity.findings.map(researchFindingOut),
    questions:    entity.questions.map(setupQuestionOut),
    constitution: constitutionDraftOut(entity.constitution),
    check:        checkOut(entity.check),
  };
}

function setupRecordOut(record: BoardSetupRecord): BoardSetupRecordDocument {
  return {
    setupId:    record.setupId,
    mode:       record.mode,
    stepStates: {
      billing:      record.stepStates.billing,
      research:     record.stepStates.research,
      entities:     record.stepStates.entities,
      constitution: record.stepStates.constitution,
      design:       record.stepStates.design,
      apply:        record.stepStates.apply,
    },
    currentStep:     record.currentStep,
    billing:         billingOut(record.billing),
    agentJobId:      record.agentJobId,
    snapshotCommit:  record.snapshotCommit,
    readyToContinue: record.readyToContinue,
    findings:        record.findings.map(researchFindingOut),
    questions:       record.questions.map(setupQuestionOut),
    constitution:    constitutionDraftOut(record.constitution),
    draft:           record.draft === null ? null : pipelineDefinitionOut(record.draft),
    draftRevision:   record.draftRevision,
    edits:           record.edits.map((edit) => ({
      editId:  edit.editId,
      by:      edit.by,
      field:   edit.field,
      summary: edit.summary,
      undone:  edit.undone,
      batch:   edit.batch,
    })),
    replacesUnreadablePipeline: record.replacesUnreadablePipeline,
    check:                      checkOut(record.check),
    entities:                   nullableRecordOutOf(record.entities, setupEntityOut),
  };
}

function setupEntitySummaryOut(summary: BoardSetupEntitySummary): BoardSetupEntitySummaryDocument {
  return {
    stackItemCount:                summary.stackItemCount,
    scriptCount:                   summary.scriptCount,
    answeredResearchQuestionCount: summary.answeredResearchQuestionCount,
    prepareStepCount:              summary.prepareStepCount,
    gateCountByPhase:              recordOutOf(summary.gateCountByPhase, (count) => count),
  };
}

function constitutionOutlineOut(outline: BoardConstitutionOutline | null): BoardConstitutionOutlineDocument | null {
  return outline === null ? null : { sectionCount: outline.sectionCount, ruleCount: outline.ruleCount };
}

function applyStateOut(applyState: BoardApplyState | null): BoardApplyStateDocument | null {
  if (applyState === null) return null;
  return {
    draftRevision:       applyState.draftRevision,
    resumesBoard:        applyState.resumesBoard,
    state:               applyState.state,
    reason:              applyState.reason,
    blockingFiles:       applyState.blockingFiles,
    ticketIdHoldingMain: applyState.ticketIdHoldingMain,
  };
}

function setupEntityFactsOut(facts: BoardSetupEntityFacts, renderMarkdown: MarkdownRendering): BoardSetupEntityFactsDocument {
  return {
    summary:             setupEntitySummaryOut(facts.summary),
    openQuestionCount:   facts.openQuestionCount,
    agentJobState:       facts.agentJobState,
    constitutionHtml:    facts.constitutionMarkdown === null ? null : renderMarkdown(facts.constitutionMarkdown),
    constitutionOutline: constitutionOutlineOut(facts.constitutionOutline),
    annotations:         facts.annotations.map(sourceAnnotationOut),
    readByRoles:         facts.readByRoles,
  };
}

function draftEntityFactsOut(facts: BoardDraftEntityFacts): BoardDraftEntityFactsDocument {
  return { effectivePipeline: pipelineDefinitionOut(facts.effectivePipeline), dependentEntityKeys: facts.dependentEntityKeys };
}

function stepsDraftEditOut(edit: BoardStepsDraftEdit): BoardStepsDraftEditDocument {
  switch (edit.target) {
    case 'gate':
      return { target: 'gate', name: edit.name, value: edit.value === null ? null : gateOut(edit.value) };
    case 'phase-order':
      return { target: 'phase-order', phase: edit.phase, names: edit.names };
    case 'prepare':
      return { target: 'prepare', name: edit.name, value: edit.value === null ? null : stepOut(edit.value) };
    case 'prepare-order':
      return { target: 'prepare-order', names: edit.names };
    case 'review':
      return { target: 'review', value: reviewOut(edit.value) };
    case 'constitution':
      return { target: 'constitution', constitutionPath: edit.constitutionPath };
  }
}

function entityDraftEditOut(edit: BoardEntityDraftEdit): BoardEntityDraftEditDocument {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: edit.role, value: edit.value === null ? null : agentStepSettingsOut(edit.value) };
    case 'whitelist':
    case 'reach':
    case 'depends-on':
      return { target: edit.target, value: edit.value };
    case 'concurrency':
      return { target: 'concurrency', value: edit.value };
    default:
      return stepsDraftEditOut(edit);
  }
}

function draftEditOut(edit: BoardDraftEdit): BoardDraftEditDocument {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: edit.role, value: edit.value === null ? null : agentStepSettingsOut(edit.value) };
    case 'airlock':
      return { target: 'airlock', value: edit.value === null ? null : { reReview: reReviewOut(edit.value.reReview) } };
    case 'approval':
      return { target: 'approval', approval: edit.approval, value: edit.value };
    case 'entity':
      return {
        target:    'entity',
        entityKey: edit.entityKey,
        value:     edit.value === null ? null : { kind: edit.value.kind, home: edit.value.home, summary: edit.value.summary },
      };
    case 'within-entity':
      return { target: 'within-entity', entityKey: edit.entityKey, edit: entityDraftEditOut(edit.edit) };
    default:
      return stepsDraftEditOut(edit);
  }
}

function entityRefusalOut(refusal: BoardEntityRefusal): BoardEntityRefusalDocument {
  return {
    reason:     refusal.reason,
    entityKeys: refusal.entityKeys,
    shownOn:    refusal.shownOn,
    text:       refusal.sentence,
    fix:        refusal.fix === null ? null : { label: refusal.fix.label, edits: refusal.fix.edits.map(draftEditOut) },
  };
}

function pipelineSetupOut(setup: BoardPipelineSetup | null, renderMarkdown: MarkdownRendering): BoardPipelineSetupDocument | null {
  if (setup === null) return null;
  return {
    record:              setupRecordOut(setup.record),
    summary:             { ...setupEntitySummaryOut(setup.summary), userEditsKeptCount: setup.summary.userEditsKeptCount },
    openQuestionCount:   setup.openQuestionCount,
    agentJobState:       setup.agentJobState,
    mainMovedByCommits:  setup.mainMovedByCommits,
    constitutionHtml:    setup.constitutionMarkdown === null ? null : renderMarkdown(setup.constitutionMarkdown),
    constitutionOutline: constitutionOutlineOut(setup.constitutionOutline),
    annotations:         setup.annotations.map(sourceAnnotationOut),
    readByRoles:         setup.readByRoles,
    applyState:          applyStateOut(setup.applyState),
    entities:            nullableRecordOutOf(setup.entities, (facts) => setupEntityFactsOut(facts, renderMarkdown)),
    draftEntities:       recordOutOf(setup.draftEntities, draftEntityFactsOut),
    applyRefusal:        setup.applyRefusal === null ? null : refusalOut(setup.applyRefusal),
    entityRefusals:      setup.entityRefusals.map(entityRefusalOut),
  };
}

function flowNodeOut(node: BoardFlowNode): BoardFlowNodeDocument {
  return {
    nodeId:             node.nodeId,
    nodeKind:           node.nodeKind,
    role:               node.role,
    settings:           node.settings === null ? null : agentPairOut(node.settings),
    instructionEntries: node.instructionEntries.map((entry) => ({
      entry:       instructionOut(entry.entry),
      fileName:    entry.fileName,
      readByRoles: entry.readByRoles,
      text:        entry.text,
      textIsCut:   entry.textIsCut,
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
    questionIds:    node.questionIds,
  };
}

function gateRowsOut(gateRows: BoardGateRows): BoardGateRowsDocument {
  return recordOutOf(gateRows, (rows) => rows.map((row) => ({
    rowKind:      row.rowKind,
    name:         row.name,
    run:          row.run,
    fix:          row.fix,
    runsIn:       row.runsIn,
    network:      row.network,
    alsoInPhases: row.alsoInPhases,
    mark:         row.mark,
  })));
}

function entityFlowOut(flow: BoardEntityFlow): BoardEntityFlowDocument {
  return {
    nodes: flow.nodes.map(flowNodeOut),
    edges: flow.edges.map((edge) => ({
      from:      edge.from,
      to:        edge.to,
      tone:      edge.tone,
      labelKind: edge.labelKind,
      active:    edge.active,
    })),
    insertSlots: flow.insertSlots.map((slot) => ({ slotId: slot.slotId, after: slot.after, offeredSteps: slot.offeredSteps })),
    gateRows:    gateRowsOut(flow.gateRows),
  };
}

function pipelineFlowOut(flow: BoardPipelineFlow | null): BoardPipelineFlowDocument | null {
  if (flow === null) return null;
  return {
    ...entityFlowOut(flow),
    occupants: flow.occupants.map((occupant) => ({
      occupantKind: occupant.occupantKind,
      occupantId:   occupant.occupantId,
      nodeId:       occupant.nodeId,
      jobId:        occupant.jobId,
      since:        occupant.since,
    })),
    changeList:        flow.changeList.map((change) => ({ field: change.field, changeKind: change.changeKind, editId: change.editId })),
    ticketIdsInFlight: flow.ticketIdsInFlight,
    toolbarStage:      flow.toolbarStage,
    entityFlows:       nullableRecordOutOf(flow.entityFlows, entityFlowOut),
  };
}

function historyEntryOut(entry: BoardPipelineHistoryEntry): BoardPipelineHistoryEntryDocument {
  switch (entry.kind) {
    case 'pipeline-gate-added':
      return {
        kind: entry.kind, at: entry.at, name: entry.name, run: entry.run
      };
    case 'pipeline-gate-removed':
      return { kind: entry.kind, at: entry.at, name: entry.name };
    case 'pipeline-gates-none':
      return { kind: entry.kind, at: entry.at };
    case 'pipeline-gates-ordered':
      return {
        kind: entry.kind, at: entry.at, phase: entry.phase, names: entry.names
      };
    case 'pipeline-prepare-step-set':
      return {
        kind: entry.kind, at: entry.at, name: entry.name, run: entry.run
      };
    case 'pipeline-approval-set':
      return {
        kind: entry.kind, at: entry.at, approval: entry.approval, state: entry.state
      };
    case 'pipeline-setup-opened':
      return {
        kind:                       entry.kind,
        at:                         entry.at,
        setupId:                    entry.setupId,
        mode:                       entry.mode,
        replacesUnreadablePipeline: entry.replacesUnreadablePipeline,
      };
    case 'pipeline-draft-discarded':
      return {
        kind: entry.kind, at: entry.at, setupId: entry.setupId, revision: entry.revision
      };
    case 'pipeline-setup-discarded':
      return { kind: entry.kind, at: entry.at, setupId: entry.setupId };
    case 'overseer-set':
      return { kind: entry.kind, at: entry.at, state: entry.state };
  }
}

function entityAssignmentOut(assignment: BoardEntityAssignment | null): BoardEntityAssignmentDocument | null {
  if (assignment === null) return null;
  return {
    jobId:    assignment.jobId,
    jobState: assignment.jobState,
    tickets:  assignment.tickets.map((ticket) => ({
      ticketId:   ticket.ticketId,
      title:      ticket.title,
      entity:     ticket.entity,
      reason:     ticket.reason,
      assignedBy: ticket.assignedBy,
    })),
  };
}

function pipelineFactsOut(pipeline: BoardPipelineFacts, renderMarkdown: MarkdownRendering): BoardPipelineFactsDocument {
  return {
    applied:     appliedPipelineOut(pipeline.applied),
    setup:       pipelineSetupOut(pipeline.setup, renderMarkdown),
    flow:        pipelineFlowOut(pipeline.flow),
    profileRuns: pipeline.profileRuns.map((run) => ({
      profileRunId:        run.profileRunId,
      entity:              run.entity,
      gateName:            run.gateName,
      phase:               run.phase,
      state:               run.state,
      elapsedMilliseconds: run.elapsedMilliseconds,
      cacheReport:         run.cacheReport,
    })),
    gateCacheMarks: pipeline.gateCacheMarks.map((mark) => ({
      entity:      mark.entity,
      gateName:    mark.gateName,
      phase:       mark.phase,
      cacheReport: mark.cacheReport,
    })),
    stepRunTimes: pipeline.stepRunTimes.map((runTime) => ({
      entity:          runTime.entity,
      stepKind:        runTime.stepKind,
      stepName:        runTime.stepName,
      phase:           runTime.phase,
      runMilliseconds: runTime.runMilliseconds,
      ending:          runTime.ending,
      at:              runTime.at,
    })),
    history:          pipeline.history.map(historyEntryOut),
    choices:          { models: pipeline.choices.models, efforts: pipeline.choices.efforts },
    agentDefaults:    agentPairOut(pipeline.agentDefaults),
    entityAssignment: entityAssignmentOut(pipeline.entityAssignment),
  };
}

export const PipelineDocumentMapUtil = {
  pipelineFactsOut,
  instructionOut,
  questionOptionOut,
  questionAnswerOut,
  refusalOut,
  recordOutOf,
} as const;
