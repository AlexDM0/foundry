/**
 * Maps the pipeline facts of a forge's board document, its shape already checked, into Gaia's `BoardPipelineFacts`: the stored pipeline with
 * each entity's effective pipeline, the open setup with its entities draft, its entity refusals with their typed fixes and the Apply refusal,
 * the flow, the gates' runs and marks, the step run times and the history.
 */
import type {
  AgentPairDocument,
  AgentStepSettingsDocument,
  BoardAppliedPipelineDocument,
  BoardEntityRefusalDocument,
  ConditionalReReviewDocument,
  BoardPipelineFlowDocument,
  BoardPipelineHistoryEntryDocument,
  BoardPipelineSetupDocument,
  ConstitutionDraftDocument,
  EntityDraftEditDocument,
  PipelineCheckDocument,
  PipelineDefinitionDocument,
  PipelineDraftEditDocument,
  PipelineEntityDocument,
  PipelineEntityFlowDocument,
  PipelineGateDocument,
  PipelineGateRowDocument,
  PipelineReviewDocument,
  PipelineSetupEntitySummaryDocument,
  PipelineSetupRecordDocument,
  PipelineStepDocument,
  PipelineStepsDraftEditDocument,
  ResearchFindingDocument,
  SetupQuestionDocument,
  SourceAnnotationDocument,
} from 'forge-contracts/BoardPipelineDocuments';
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import type {
  BoardAgentPair,
  BoardAgentStepSettings,
  BoardAppliedPipeline,
  BoardBilling,
  BoardConditionalReReview,
  BoardConstitutionDraft,
  BoardDraftEdit,
  BoardEntityDraftEdit,
  BoardEntityFlow,
  BoardEntityRefusal,
  BoardGateRow,
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
  BoardSetupEntitySummary,
  BoardSetupQuestion,
  BoardSetupRecord,
  BoardSourceAnnotation,
  BoardStepsDraftEdit,
} from '../../../shared/@types/board/BoardPipeline.ts';
import { BoardMapUtil }      from './BoardMapUtil.ts';
import { VocabularyMapUtil } from './VocabularyMapUtil.ts';

const VOCABULARIES = VocabularyMapUtil.vocabularies;

/** An object keyed by entity keys, each value mapped; `undefined` maps to `null`. */
function entityRecordOf<ForgeValue, GaiaValue>(
  record: Readonly<Record<string, ForgeValue>> | undefined, gaiaValueOfEntry: (forgeValue: ForgeValue) => GaiaValue,
): Readonly<Record<string, GaiaValue>> | null {
  if (record === undefined) return null;
  return Object.fromEntries(Object.entries(record).map(([entityKey, forgeValue]) => [entityKey, gaiaValueOfEntry(forgeValue)]));
}

function agentPairOf(pair: AgentPairDocument): BoardAgentPair {
  return { model: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentModel, pair.model), effort: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentEffort, pair.effort) };
}

function stepOf(step: PipelineStepDocument): BoardPipelineStep {
  return { name: step.name, run: step.run, runsIn: step.in ?? null };
}

function gateOf(gate: PipelineGateDocument): BoardPipelineGate {
  return {
    name:    gate.name,
    run:     gate.run,
    fix:     gate.fix ?? null,
    runsIn:  gate.in ?? null,
    network: gate.network ?? [],
    writes:  gate.writes ?? [],
  };
}

function agentStepSettingsOf(settings: AgentStepSettingsDocument): BoardAgentStepSettings {
  return {
    model:        settings.model === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentModel, settings.model),
    effort:       settings.effort === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentEffort, settings.effort),
    instructions: settings.instructions?.map(BoardMapUtil.instructionOf) ?? null,
  };
}

function reReviewOf(reReview: ConditionalReReviewDocument | undefined): BoardConditionalReReview | null {
  return reReview === undefined ? null : { thresholdLines: reReview.thresholdLines };
}

function reviewOf(review: PipelineReviewDocument): BoardPipelineReview {
  return { name: review.name, reReview: reReviewOf(review.reReview) };
}

function phaseOrdersOf(phases: PipelineDefinitionDocument['phases']): BoardPipelineDefinition['phases'] {
  return VocabularyMapUtil.keyedRecordOf(VOCABULARIES.gatePhase, phases, (names) => names);
}

function billingOf(billing: NonNullable<PipelineDefinitionDocument['billing']>): BoardBilling {
  if (billing.mode === 'subscription') return { mode: 'subscription' };
  return { mode: 'api', maximumBudgetDollars: billing.maxBudgetUsd ?? null };
}

function pipelineEntityOf(entity: PipelineEntityDocument): BoardPipelineEntity {
  return {
    kind:             VocabularyMapUtil.gaiaValueOf(VOCABULARIES.entityKind, entity.kind),
    home:             entity.home,
    summary:          entity.summary ?? null,
    constitutionPath: entity.constitution?.path ?? null,
    prepare:          entity.prepare.map(stepOf),
    gates:            entity.gates.map(gateOf),
    phases:           phaseOrdersOf(entity.phases),
    review:           entity.review === undefined ? null : reviewOf(entity.review),
    agents:           VocabularyMapUtil.partiallyKeyedRecordOf(VOCABULARIES.entityAgentRole, entity.agents, agentStepSettingsOf),
    whitelist:        entity.whitelist ?? [],
    reach:            entity.reach ?? [],
    dependsOn:        entity.dependsOn ?? [],
    concurrency:      entity.concurrency ?? null,
  };
}

function pipelineDefinitionOf(pipeline: PipelineDefinitionDocument): BoardPipelineDefinition {
  return {
    version:          pipeline.version,
    prepare:          pipeline.prepare.map(stepOf),
    gates:            pipeline.gates.map(gateOf),
    phases:           phaseOrdersOf(pipeline.phases),
    review:           pipeline.review === undefined ? null : reviewOf(pipeline.review),
    airlock:          pipeline.airlock === undefined ? null : { reReview: reReviewOf(pipeline.airlock.reReview) },
    constitutionPath: pipeline.constitution?.path ?? null,
    agents:           VocabularyMapUtil.partiallyKeyedRecordOf(VOCABULARIES.pipelineAgentRole, pipeline.agents, agentStepSettingsOf),
    approvals:        VocabularyMapUtil.partiallyKeyedRecordOf(VOCABULARIES.pipelineApproval, pipeline.approvals, (isOn) => isOn),
    billing:          pipeline.billing === undefined ? null : billingOf(pipeline.billing),
    reach:            pipeline.reach ?? [],
    entities:         entityRecordOf(pipeline.entities, pipelineEntityOf),
  };
}

function appliedPipelineOf(applied: BoardAppliedPipelineDocument): BoardAppliedPipeline {
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
          constitutionCommit: applied.application.constitutionCommit,
        },
        entityPipelines: entityRecordOf(applied.entityPipelines, pipelineDefinitionOf) ?? {},
      };
  }
}

function researchFindingOf(finding: ResearchFindingDocument): BoardResearchFinding {
  return {
    findingId:   finding.findingId,
    topic:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.findingTopic, finding.topic),
    label:       finding.label,
    value:       finding.value,
    sourcePaths: finding.sourcePaths,
    script:      finding.script === null ? null : {
      name:          finding.script.name,
      run:           finding.script.run,
      meaning:       finding.script.meaning,
      gateCandidate: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gateCandidacy, finding.script.gateCandidate),
      needs:         finding.script.needs,
    },
    needsRecheck: finding.needsRecheck,
  };
}

function setupQuestionOf(question: SetupQuestionDocument): BoardSetupQuestion {
  return {
    questionId: question.questionId,
    step:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupQuestionStep, question.step),
    subject:    question.subject === null ? null : {
      kind:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupQuestionSubjectKind, question.subject.kind),
      reference: question.subject.reference,
    },
    question:    question.question,
    context:     question.context,
    options:     question.options.map(BoardMapUtil.questionOptionOf),
    recommended: question.recommended,
    multiple:    question.multiple,
    answer:      BoardMapUtil.questionAnswerOf(question.answer),
  };
}

function sourceAnnotationOf(annotation: SourceAnnotationDocument): BoardSourceAnnotation {
  return {
    lineText:   annotation.lineText,
    occurrence: annotation.occurrence,
    kind:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.sourceAnnotationKind, annotation.kind),
    path:       annotation.path,
  };
}

function constitutionDraftOf(draft: ConstitutionDraftDocument | null): BoardConstitutionDraft | null {
  if (draft === null) return null;
  return {
    markdown:    draft.markdown,
    annotations: draft.annotations.map(sourceAnnotationOf),
    draftedFrom: {
      contributing:     draft.draftedFrom.contributing,
      research:         draft.draftedFrom.research,
      installedDefault: draft.draftedFrom.installedDefault,
    },
    revision: draft.revision,
  };
}

function checkOf(check: PipelineCheckDocument | null): BoardPipelineCheck | null {
  if (check === null) return null;
  return {
    draftRevision: check.draftRevision,
    gateNames:     check.gateNames,
    state:         VocabularyMapUtil.gaiaValueOf(VOCABULARIES.checkState, check.state),
    result:        check.result === null ? null : {
      snapshotCommit:     check.result.snapshotCommit,
      prepareFailedSteps: check.result.prepare.failedSteps,
      prepareOutput:      check.result.prepare.output,
      gates:              check.result.gates.map((gate) => ({
        name:    gate.name,
        verdict: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.checkedGateVerdict, gate.verdict),
        output:  gate.output,
      })),
    },
    reason: check.reason,
  };
}

function setupRecordOf(record: PipelineSetupRecordDocument): BoardSetupRecord {
  const { entities: entitiesStepState, ...stepStates } = record.stepStates;
  return {
    setupId:    record.setupId,
    mode:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupMode, record.mode),
    stepStates: {
      billing:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStepState, stepStates.billing),
      research:     VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStepState, stepStates.research),
      constitution: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStepState, stepStates.constitution),
      design:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStepState, stepStates.design),
      apply:        VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStepState, stepStates.apply),
      entities:     entitiesStepState === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStepState, entitiesStepState),
    },
    currentStep:     VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupStep, record.currentStep),
    billing:         billingOf(record.billing),
    agentJobId:      record.agentJobId,
    snapshotCommit:  record.snapshotCommit,
    readyToContinue: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.setupStep, record.readyToContinue),
    findings:        record.findings.map(researchFindingOf),
    questions:       record.questions.map(setupQuestionOf),
    constitution:    constitutionDraftOf(record.constitution),
    draft:           record.draft === null ? null : pipelineDefinitionOf(record.draft),
    draftRevision:   record.draftRevision,
    edits:           record.edits.map((edit) => ({
      editId:  edit.editId,
      by:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.editAuthor, edit.by),
      field:   edit.field,
      summary: edit.summary,
      undone:  edit.undone,
      batch:   edit.batch ?? null,
    })),
    replacesUnreadablePipeline: record.replacesUnreadablePipeline,
    check:                      checkOf(record.check),
    entities:                   entityRecordOf(record.entities, (entity) => ({
      agentJobId:   entity.agentJobId,
      findings:     entity.findings.map(researchFindingOf),
      questions:    entity.questions.map(setupQuestionOf),
      constitution: constitutionDraftOf(entity.constitution),
      check:        checkOf(entity.check),
    })),
  };
}

function setupEntitySummaryOf(summary: PipelineSetupEntitySummaryDocument): BoardSetupEntitySummary {
  return {
    stackItemCount:                summary.stackItemCount,
    scriptCount:                   summary.scriptCount,
    answeredResearchQuestionCount: summary.answeredResearchQuestionCount,
    prepareStepCount:              summary.prepareStepCount,
    gateCountByPhase:              VocabularyMapUtil.keyedRecordOf(VOCABULARIES.gatePhase, summary.gateCountByPhase, (count) => count),
  };
}

function stepsDraftEditOf(edit: PipelineStepsDraftEditDocument): BoardStepsDraftEdit {
  switch (edit.target) {
    case 'gate':
      return { target: 'gate', name: edit.name, value: edit.value === null ? null : gateOf(edit.value) };
    case 'phase-order':
      return { target: 'phase-order', phase: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gatePhase, edit.phase), names: edit.names };
    case 'prepare':
      return { target: 'prepare', name: edit.name, value: edit.value === null ? null : stepOf(edit.value) };
    case 'prepare-order':
      return { target: 'prepare-order', names: edit.names };
    case 'review':
      return { target: 'review', value: edit.value === null ? null : reviewOf(edit.value) };
    case 'constitution':
      return { target: 'constitution', constitutionPath: edit.value?.path ?? null };
  }
}

function entityDraftEditOf(edit: EntityDraftEditDocument): BoardEntityDraftEdit {
  switch (edit.target) {
    case 'role':
      return {
        target: 'role',
        role:   VocabularyMapUtil.gaiaValueOf(VOCABULARIES.entityAgentRole, edit.role),
        value:  edit.value === null ? null : agentStepSettingsOf(edit.value),
      };
    case 'whitelist':
    case 'reach':
    case 'depends-on':
      return { target: edit.target, value: edit.value };
    case 'concurrency':
      return { target: 'concurrency', value: edit.value };
    default:
      return stepsDraftEditOf(edit);
  }
}

function draftEditOf(edit: PipelineDraftEditDocument): BoardDraftEdit {
  switch (edit.target) {
    case 'role':
      return {
        target: 'role',
        role:   VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineAgentRole, edit.role),
        value:  edit.value === null ? null : agentStepSettingsOf(edit.value),
      };
    case 'airlock':
      return {
        target: 'airlock',
        value:  edit.value === null ? null : { reReview: reReviewOf(edit.value.reReview) },
      };
    case 'approval':
      return { target: 'approval', approval: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineApproval, edit.approval), value: edit.value };
    case 'entity':
      return {
        target:    'entity',
        entityKey: edit.entityKey,
        value:     edit.value === null ? null : {
          kind:    VocabularyMapUtil.gaiaValueOf(VOCABULARIES.entityKind, edit.value.kind),
          home:    edit.value.home,
          summary: edit.value.summary ?? null,
        },
      };
    case 'within-entity':
      return { target: 'within-entity', entityKey: edit.entityKey, edit: entityDraftEditOf(edit.edit) };
    default:
      return stepsDraftEditOf(edit);
  }
}

function entityRefusalOf(refusal: BoardEntityRefusalDocument): BoardEntityRefusal {
  return {
    reason:     VocabularyMapUtil.gaiaValueOf(VOCABULARIES.entityRefusalReason, refusal.reason),
    entityKeys: refusal.entityKeys,
    shownOn:    refusal.shownOn,
    sentence:   refusal.sentence,
    fix:        refusal.fix === null ? null : { label: refusal.fix.label, edits: refusal.fix.edits.map(draftEditOf) },
  };
}

function pipelineSetupOf(setup: BoardPipelineSetupDocument | null): BoardPipelineSetup | null {
  if (setup === null) return null;
  return {
    record:               setupRecordOf(setup.record),
    summary:              { ...setupEntitySummaryOf(setup.summary), userEditsKeptCount: setup.summary.userEditsKeptCount },
    openQuestionCount:    setup.openQuestionCount,
    agentJobState:        VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.jobState, setup.agentJobState),
    mainMovedByCommits:   setup.mainMovedByCommits,
    constitutionMarkdown: setup.constitutionMarkdown,
    constitutionOutline:  setup.constitutionOutline === null ? null : { sectionCount: setup.constitutionOutline.sectionCount, ruleCount: setup.constitutionOutline.ruleCount },
    annotations:          setup.annotations.map(sourceAnnotationOf),
    readByRoles:          VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.pipelineAgentRole, setup.readByRoles),
    applyState:           setup.applyState === null ? null : {
      draftRevision:       setup.applyState.draftRevision,
      resumesBoard:        setup.applyState.resumesBoard,
      state:               VocabularyMapUtil.gaiaValueOf(VOCABULARIES.applyRequestState, setup.applyState.state),
      reason:              VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.applyRequestReason, setup.applyState.reason),
      blockingFiles:       setup.applyState.blockingFiles,
      ticketIdHoldingMain: setup.applyState.ticketIdHoldingMain,
    },
    entities: entityRecordOf(setup.entities, (facts) => ({
      summary:              setupEntitySummaryOf(facts.summary),
      openQuestionCount:    facts.openQuestionCount,
      agentJobState:        VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.jobState, facts.agentJobState),
      constitutionMarkdown: facts.constitutionMarkdown,
      constitutionOutline:  facts.constitutionOutline === null ? null : { sectionCount: facts.constitutionOutline.sectionCount, ruleCount: facts.constitutionOutline.ruleCount },
      annotations:          facts.annotations.map(sourceAnnotationOf),
      readByRoles:          VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.entityAgentRole, facts.readByRoles),
    })),
    draftEntities: entityRecordOf(setup.draftEntities, (facts) => ({
      effectivePipeline:   pipelineDefinitionOf(facts.effectivePipeline),
      dependentEntityKeys: facts.dependentEntityKeys,
    })) ?? {},
    applyRefusal:   setup.applyRefusal === null ? null : BoardMapUtil.refusalOf(setup.applyRefusal),
    entityRefusals: setup.entityRefusals.map(entityRefusalOf),
  };
}

function gateRowOf(row: PipelineGateRowDocument): BoardGateRow {
  return {
    rowKind:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gateRowKind, row.rowKind),
    name:         row.name,
    run:          row.run,
    fix:          row.fix,
    runsIn:       row.in,
    network:      row.network,
    alsoInPhases: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.gatePhase, row.alsoInPhases),
    mark:         VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineNodeMark, row.mark),
  };
}

function entityFlowOf(flow: PipelineEntityFlowDocument): BoardEntityFlow {
  return {
    nodes: flow.nodes.map((node) => ({
      nodeId:             node.nodeId,
      nodeKind:           VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineNodeKind, node.nodeKind),
      role:               VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.pipelineAgentRole, node.role),
      settings:           node.settings === null ? null : agentPairOf(node.settings),
      instructionEntries: node.instructionEntries.map((resolved) => ({
        entry:       BoardMapUtil.instructionOf(resolved.entry),
        fileName:    resolved.fileName,
        readByRoles: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.pipelineAgentRole, resolved.readByRoles),
        text:        resolved.text,
        textIsCut:   resolved.textIsCut,
      })),
      derivedFrom:    VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.derivedSettingsSource, node.derivedFrom),
      mergePlacement: VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.mergePlacement, node.mergePlacement),
      phase:          VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.gatePhase, node.phase),
      conditional:    node.conditional,
      thresholdLines: node.thresholdLines,
      switchState:    VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.switchState, node.switchState),
      gateChips:      node.gateChips.map((chip) => ({ gateName: chip.gateName, mark: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineNodeMark, chip.mark) })),
      mark:           VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineNodeMark, node.mark),
      dialogTarget:   VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.nodeDialogTarget, node.dialogTarget),
      questionIds:    node.questionIds,
    })),
    edges: flow.edges.map((edge) => ({
      from:      edge.from,
      to:        edge.to,
      tone:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.edgeTone, edge.tone),
      labelKind: VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.edgeLabelKind, edge.labelKind),
      active:    edge.active,
    })),
    insertSlots: flow.insertSlots.map((slot) => ({
      slotId:       slot.slotId,
      after:        slot.after,
      offeredSteps: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.insertableStep, slot.offeredSteps),
    })),
    gateRows: VocabularyMapUtil.keyedRecordOf(VOCABULARIES.gatePhase, flow.gateRows, (rows) => rows.map(gateRowOf)),
  };
}

function pipelineFlowOf(flow: BoardPipelineFlowDocument | null): BoardPipelineFlow | null {
  if (flow === null) return null;
  return {
    ...entityFlowOf(flow),
    occupants: flow.occupants.map((occupant) => ({
      occupantKind: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.occupantKind, occupant.occupantKind),
      occupantId:   occupant.occupantId,
      nodeId:       occupant.nodeId,
      jobId:        occupant.jobId,
      since:        occupant.since,
    })),
    changeList: flow.changeList.map((change) => ({
      field:      change.field,
      changeKind: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.changeKind, change.changeKind),
      editId:     change.editId,
    })),
    ticketIdsInFlight: flow.ticketIdsInFlight,
    toolbarStage:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.flowStage, flow.toolbarStage),
    entityFlows:       entityRecordOf(flow.entityFlows, entityFlowOf),
  };
}

function historyEntryOf(entry: BoardPipelineHistoryEntryDocument): BoardPipelineHistoryEntry {
  switch (entry.kind) {
    case 'pipeline-gate-added':
    case 'pipeline-prepare-step-set':
      return {
        kind: entry.kind, at: entry.at, name: entry.fields.name, run: entry.fields.run
      };
    case 'pipeline-gate-removed':
      return { kind: 'pipeline-gate-removed', at: entry.at, name: entry.fields.name };
    case 'pipeline-gates-none':
      return { kind: 'pipeline-gates-none', at: entry.at };
    case 'pipeline-gates-ordered':
      return {
        kind: 'pipeline-gates-ordered', at: entry.at, phase: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gatePhase, entry.fields.phase), names: entry.fields.names
      };
    case 'pipeline-approval-set':
      return {
        kind: 'pipeline-approval-set', at: entry.at, approval: entry.fields.approval, state: entry.fields.state
      };
    case 'pipeline-setup-opened':
      return {
        kind:                       'pipeline-setup-opened',
        at:                         entry.at,
        setupId:                    entry.setupId,
        mode:                       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.setupMode, entry.fields.mode),
        replacesUnreadablePipeline: entry.fields.replacesUnreadablePipeline,
      };
    case 'pipeline-draft-discarded':
      return {
        kind: 'pipeline-draft-discarded', at: entry.at, setupId: entry.setupId, revision: entry.fields.revision
      };
    case 'pipeline-setup-discarded':
      return { kind: 'pipeline-setup-discarded', at: entry.at, setupId: entry.setupId };
    case 'overseer-set':
      return { kind: 'overseer-set', at: entry.at, state: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.overseerSetting, entry.fields.state) };
  }
}

function pipelineFactsOf(document: ForgeBoardDocument): BoardPipelineFacts {
  return {
    applied:     appliedPipelineOf(document.pipeline),
    setup:       pipelineSetupOf(document.pipelineSetup),
    flow:        pipelineFlowOf(document.pipelineFlow),
    profileRuns: document.profileRuns.map((run) => ({
      profileRunId:        run.profileRunId,
      entity:              run.entity ?? null,
      gateName:            run.gateName,
      phase:               VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gatePhase, run.phase),
      state:               VocabularyMapUtil.gaiaValueOf(VOCABULARIES.profileRunState, run.state),
      elapsedMilliseconds: run.elapsedMilliseconds,
      cacheReport:         VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.cacheReport, run.cacheReport),
    })),
    gateCacheMarks: document.gateCacheMarks.map((mark) => ({
      entity:      mark.entity ?? null,
      gateName:    mark.gateName,
      phase:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gatePhase, mark.phase),
      cacheReport: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.cacheReport, mark.cacheReport),
    })),
    stepRunTimes: document.stepRunTimes.map((runTime) => ({
      entity:          runTime.entity ?? null,
      stepKind:        VocabularyMapUtil.gaiaValueOf(VOCABULARIES.stepKind, runTime.stepKind),
      stepName:        runTime.stepName,
      phase:           runTime.phase === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.gatePhase, runTime.phase),
      runMilliseconds: runTime.runMilliseconds,
      ending:          VocabularyMapUtil.gaiaValueOf(VOCABULARIES.stepEnding, runTime.ending),
      at:              runTime.at,
    })),
    history: document.pipelineHistory.map(historyEntryOf),
    choices: {
      models:  VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.agentModel, document.pipelineChoices.models),
      efforts: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.agentEffort, document.pipelineChoices.efforts),
    },
    agentDefaults:    agentPairOf(document.pipelineAgentDefaults),
    entityAssignment: document.entityAssignment === null ? null : {
      jobId:    document.entityAssignment.jobId,
      jobState: VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.jobState, document.entityAssignment.jobState),
      tickets:  document.entityAssignment.tickets.map((ticket) => ({
        ticketId:   ticket.ticketId,
        title:      ticket.title,
        entity:     ticket.entity,
        reason:     ticket.reason,
        assignedBy: VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.assignedBy, ticket.assignedBy),
      })),
    },
  };
}

export const PipelineMapUtil = { pipelineFactsOf, draftEditOf } as const;
