/**
 * The setup record's moves: one open record at a time, its steps, the agent's findings, questions, constitution and draft edits, and
 * User's answers, edits and Undo. A User edit of an earlier step reopens it, and a step reopened sends every later done step to
 * `needs-recheck`, whose only exit is Continue. While an Apply request waits for its commit, every move here refuses. Apply's own moves
 * are not here.
 */
import type { PipelineSetupChanged }      from './@types/BoardChanges.ts';
import type { LogRecord }                 from './@types/LogRecord.ts';
import type { Pipeline, PipelineBilling } from './@types/Pipeline.ts';
import type {
  ConstitutionDraft,
  ConstitutionEdit,
  ConstitutionSetting,
  DraftEditRequest,
  PipelineSetup,
  PipelineSetupOpening,
  PipelineSetupStep,
  PipelineSetupStepState,
  ResearchFindingRecording,
  SetupEditAuthor,
  SetupQuestion,
  SetupQuestionAsking,
  SetupQuestionReply,
  SetupQuestionStep,
  SnapshotRefusal,
  SourceAnnotation
} from './@types/PipelineSetup.ts';
import type { BoardRecords }      from './BoardRecords.ts';
import { BoardRefusal }           from './BoardRefusal.ts';
import {
  CONSTITUTION_LIMIT_CHARACTERS,
  DEFAULT_CONSTITUTION_SOURCES,
  FINDING_ID_PREFIX,
  FIRST_SETUP_ITEM_NUMBER,
  FIRST_SETUP_NUMBER,
  MINIMUM_SETUP_QUESTION_OPTIONS,
  PENDING_APPLY_REQUEST_STATES,
  PIPELINE_SETUP_STEPS,
  SETUP_EDIT_ID_PREFIX,
  SETUP_ID_PREFIX,
  SETUP_QUESTION_ID_PREFIX,
  SETUP_QUESTION_OPTION_LETTERS
} from './constants/PipelineSetupVocabulary.ts';
import { PipelineDraftEditUtil } from './utils/PipelineDraftEditUtil.ts';
import { PipelineUtil }          from './utils/PipelineUtil.ts';

/** The steps an update or advise record opens with: everything before Apply is already set. */
const STEPS_SET_BEFORE_AN_UPDATE: readonly PipelineSetupStep[] = ['billing', 'research', 'constitution', 'design'];

function stepIndexOf(step: PipelineSetupStep): number {
  return PIPELINE_SETUP_STEPS.indexOf(step);
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

function billingCopyOf(billing: PipelineBilling): PipelineBilling {
  if (billing.mode === 'api' && billing.maxBudgetUsd !== undefined && !(billing.maxBudgetUsd > 0)) {
    throw new BoardRefusal({ reason: 'billing-cap-not-positive', maxBudgetUsd: billing.maxBudgetUsd });
  }
  return { ...billing };
}

export class PipelineSetups {
  constructor(private readonly records: BoardRecords) {}

  /** Refuses `setup-in-progress` beside an open record; an update or advise record starts from the stored pipeline. */
  openSetup(opening: PipelineSetupOpening, at: string): PipelineSetupChanged {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.reason });
    if (reading.verdict === 'readable') throw new BoardRefusal({ reason: 'setup-in-progress', setupId: reading.setup.setupId });
    const stored = this.records.pipeline;
    if (opening.mode !== 'setup' && stored === null) throw new BoardRefusal({ reason: 'no-pipeline-to-update', mode: opening.mode });

    const isUpdate = opening.mode !== 'setup';
    const stepStates = Object.fromEntries(PIPELINE_SETUP_STEPS.map((step): [PipelineSetupStep, PipelineSetupStepState] => {
      if (isUpdate) return [step, STEPS_SET_BEFORE_AN_UPDATE.includes(step) ? 'done' : 'not-started'];
      return [step, step === 'billing' ? 'in-progress' : 'not-started'];
    })) as Record<PipelineSetupStep, PipelineSetupStepState>;
    const setup: PipelineSetup = {
      formatVersion:              1,
      setupId:                    `${SETUP_ID_PREFIX}${this.takeNextSetupNumber()}`,
      mode:                       opening.mode,
      baseContentHash:            isUpdate && stored !== null ? PipelineUtil.contentHashOf(stored) : null,
      stepStates,
      currentStep:                isUpdate ? 'design' : 'billing',
      billing:                    billingCopyOf(opening.billing),
      agentJobId:                 null,
      snapshotCommit:             null,
      readyToContinue:            [],
      findings:                   [],
      questions:                  [],
      constitution:               this.openingConstitutionOf(opening),
      draft:                      isUpdate && stored !== null ? structuredClone(stored) as Pipeline : null,
      draftRevision:              0,
      edits:                      [],
      replacesUnreadablePipeline: opening.replacesUnreadablePipeline,
      applyRequest:               null,
      nextNumbers:                { finding: FIRST_SETUP_ITEM_NUMBER, question: FIRST_SETUP_ITEM_NUMBER, edit: FIRST_SETUP_ITEM_NUMBER },
      extra:                      [],
    };
    this.store(setup);
    const fields = { mode: setup.mode, replacesUnreadablePipeline: setup.replacesUnreadablePipeline };
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-opened', setupId: setup.setupId, fields }, at)], setup };
  }

  setSetupBilling(setupId: string, billing: PipelineBilling, at: string): PipelineSetupChanged {
    const setup   = this.requireMovableSetup(setupId);
    setup.billing = billingCopyOf(billing);
    this.store(setup);
    const fields = setup.billing.mode === 'api' && setup.billing.maxBudgetUsd !== undefined
      ? { mode: setup.billing.mode, maxBudgetUsd: setup.billing.maxBudgetUsd }
      : { mode: setup.billing.mode };
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-billing-set', setupId, fields }, at)], setup };
  }

  /** User's Continue on the current step: it is done, and the next step opens; on a step that needs a recheck, this is its only exit. */
  continueSetupStep(setupId: string, step: PipelineSetupStep, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    if (step === 'apply') throw new BoardRefusal({ reason: 'setup-step-not-continued', setupId, step });
    if (setup.currentStep !== step) throw new BoardRefusal({
      reason: 'setup-step-not-current', setupId, step, currentStep: setup.currentStep
    });

    const nextStep = PIPELINE_SETUP_STEPS[stepIndexOf(step) + 1] ?? 'apply';
    setup.stepStates[step] = 'done';
    if (setup.stepStates[nextStep] === 'not-started') setup.stepStates[nextStep] = 'in-progress';
    setup.currentStep     = nextStep;
    setup.readyToContinue = setup.readyToContinue.filter((readyStep) => readyStep !== step);
    this.store(setup);
    return { logged: [this.stepMovedRecord(setup, step, [], at)], setup };
  }

  /**
   * The agent's suggestion that User may continue the current step; it never moves a step. Saying it again of a step already suggested
   * changes nothing and logs nothing.
   */
  suggestSetupStepReady(setupId: string, step: SetupQuestionStep, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    if (setup.currentStep !== step) throw new BoardRefusal({
      reason: 'setup-step-not-current', setupId, step, currentStep: setup.currentStep
    });
    if (setup.readyToContinue.includes(step)) return { logged: [], setup };
    setup.readyToContinue.push(step);
    this.store(setup);
    return { logged: [this.records.logger.log({ kind: 'pipeline-step-ready-suggested', setupId, fields: { step } }, at)], setup };
  }

  /** Back to a step already reached: it is in progress again, and every later done step needs a recheck, never a fresh start. */
  reopenSetupStep(setupId: string, step: PipelineSetupStep, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    return { logged: this.reopenedStepRecords(setup, step, at), setup };
  }

  /** The snapshot moved to main's new tip: the findings that name a changed path, and the research step, need a recheck. */
  resumeSetup(setupId: string, snapshotCommit: string, changedPaths: readonly string[], at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    setup.snapshotCommit = snapshotCommit;
    for (const finding of setup.findings) {
      if (finding.sourcePaths.some((path) => changedPaths.includes(path))) finding.needsRecheck = true;
    }
    if (setup.stepStates.research === 'done') setup.stepStates.research = 'needs-recheck';
    this.store(setup);
    const fields = { snapshotCommit, changedPaths: [...changedPaths] };
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-resumed', setupId, fields }, at)], setup };
  }

  /**
   * The pipeline agent that serves the record, and the main commit its snapshot holds when none is set yet. It logs nothing: the job's
   * launch is logged.
   */
  attachSetupAgent(setupId: string, agentJobId: string, snapshotCommit: string | null): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    setup.agentJobId = agentJobId;
    setup.snapshotCommit ??= snapshotCommit;
    this.store(setup);
    return { logged: [], setup };
  }

  /** A turn end's Customs refusal: Apply refuses until a resume checks the snapshot out clean again. It is logged also while an Apply waits. */
  recordSetupSnapshotTouched(setupId: string, refusal: SnapshotRefusal, at: string): PipelineSetupChanged {
    const setup  = this.requireOpenSetup(setupId);
    const fields = { check: refusal.check, reason: refusal.reason };
    return { logged: [this.records.logger.log({ kind: 'pipeline-snapshot-touched', setupId, fields }, at)], setup };
  }

  /** The newest of the record's touched and resumed records is a touch: its snapshot is not clean. */
  setupSnapshotIsTouched(setupId: string): boolean {
    const newest = [...this.records.storedLogRecords, ...this.records.loggedRecords].findLast((record) => 'setupId' in record
      && record.setupId === setupId
      && (record.kind === 'pipeline-snapshot-touched' || record.kind === 'pipeline-setup-resumed'));
    return newest?.kind === 'pipeline-snapshot-touched';
  }

  recordFinding(setupId: string, recording: ResearchFindingRecording, at: string): PipelineSetupChanged {
    const setup     = this.requireMovableSetup(setupId);
    const findingId = `${FINDING_ID_PREFIX}${setup.nextNumbers.finding}`;
    setup.findings.push({
      findingId,
      topic:        recording.topic,
      label:        recording.label,
      value:        recording.value,
      sourcePaths:  [...recording.sourcePaths],
      script:       recording.script === null ? null : { ...recording.script, needs: [...recording.script.needs] },
      needsRecheck: false,
    });
    setup.nextNumbers.finding += 1;
    this.store(setup);
    const fields = { findingId, topic: recording.topic };
    return { logged: [this.records.logger.log({ kind: 'pipeline-finding-recorded', setupId, fields }, at)], setup };
  }

  /** Two to four options and a recommendation inside them: one, unless the question takes several. */
  askSetupQuestion(setupId: string, asking: SetupQuestionAsking, at: string): PipelineSetupChanged {
    const setup       = this.requireMovableSetup(setupId);
    const optionCount = asking.optionTexts.length;
    if (optionCount < MINIMUM_SETUP_QUESTION_OPTIONS || optionCount > SETUP_QUESTION_OPTION_LETTERS.length) {
      throw new BoardRefusal({
        reason: 'setup-question-option-count', optionCount, minimum: MINIMUM_SETUP_QUESTION_OPTIONS, maximum: SETUP_QUESTION_OPTION_LETTERS.length
      });
    }
    const options     = asking.optionTexts.map((text, index) => ({ letter: SETUP_QUESTION_OPTION_LETTERS[index] ?? '', text }));
    const recommended = [...new Set(asking.recommendedLetters)];
    if (recommended.length === 0) throw new BoardRefusal({ reason: 'setup-question-without-recommendation' });
    this.refuseLettersOutside(recommended, options.map((option) => option.letter), asking.multiple);

    const questionId = `${SETUP_QUESTION_ID_PREFIX}${setup.nextNumbers.question}`;
    const question: SetupQuestion = {
      questionId,
      step:     asking.step,
      subject:  asking.subject === null ? null : { ...asking.subject },
      question: asking.question,
      context:  asking.context,
      options,
      recommended,
      multiple: asking.multiple,
      answer:   null,
    };
    setup.questions.push(question);
    setup.nextNumbers.question += 1;
    this.store(setup);
    const fields = { questionId, step: asking.step };
    return { logged: [this.records.logger.log({ kind: 'pipeline-question-asked', setupId, fields }, at)], setup };
  }

  /** User's answer; answering again replaces it. An answer at an earlier step of a first setup reopens that step. */
  answerSetupQuestion(setupId: string, questionId: string, reply: SetupQuestionReply, at: string): PipelineSetupChanged {
    const setup    = this.requireMovableSetup(setupId);
    const question = setup.questions.find((candidate) => candidate.questionId === questionId);
    if (question === undefined) throw new BoardRefusal({ reason: 'unknown-setup-question', setupId, questionId });
    const replyIsEmpty = 'letters' in reply ? reply.letters.length === 0 : reply.text.trim() === '';
    if (replyIsEmpty) throw new BoardRefusal({ reason: 'empty-setup-answer', setupId, questionId });
    if ('letters' in reply) this.refuseLettersOutside(reply.letters, question.options.map((option) => option.letter), question.multiple);

    const reopened = this.userEditReopenRecords(setup, question.step, at);
    question.answer = 'letters' in reply ? { letters: [...new Set(reply.letters)], answeredAt: at } : { text: reply.text, answeredAt: at };
    this.store(setup);
    const answer = 'letters' in reply ? [...new Set(reply.letters)].join(',') : reply.text;
    const fields = { questionId, answer };
    return { logged: [...reopened, this.records.logger.log({ kind: 'pipeline-question-answered', setupId, fields }, at)], setup };
  }

  /** The agent's whole document and its sources; a source must name a line the text holds, once. */
  setConstitution(setupId: string, setting: ConstitutionSetting, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    if (setting.markdown.trim() === '') throw new BoardRefusal({ reason: 'constitution-empty' });
    this.refuseOverlongConstitution(setting.markdown);
    const anchoredLines = new Set<string>();
    for (const annotation of setting.annotations) {
      const { lineText, occurrence } = annotation;
      const occurs = !/[\r\n]/u.test(lineText) && Number.isInteger(occurrence) && occurrence >= 1 && occurrencesOf(setting.markdown, lineText) >= occurrence;
      if (!occurs) throw new BoardRefusal({ reason: 'constitution-source-unanchored', lineText, occurrence });
      const lineKey = JSON.stringify([lineText, occurrence]);
      if (anchoredLines.has(lineKey)) throw new BoardRefusal({ reason: 'constitution-source-repeated', lineText, occurrence });
      anchoredLines.add(lineKey);
    }

    const previous = setup.constitution;
    setup.constitution = {
      markdown:    setting.markdown,
      annotations: setting.annotations.map((annotation) => ({ ...annotation })),
      draftedFrom: previous === null ? { ...DEFAULT_CONSTITUTION_SOURCES } : previous.draftedFrom,
      baseBlob:    previous?.baseBlob ?? null,
      revision:    (previous?.revision ?? 0) + 1,
    };
    this.store(setup);
    return { logged: [this.constitutionSetRecord(setup.setupId, 'agent', setup.constitution, at)], setup };
  }

  /** User's markdown or SOURCES ticks, at the revision User saw; the sources re-anchor, so an edited line loses its tag. */
  editConstitution(setupId: string, edit: ConstitutionEdit, at: string): PipelineSetupChanged {
    const setup   = this.requireMovableSetup(setupId);
    const current = setup.constitution ?? {
      markdown: '', annotations: [], draftedFrom: { ...DEFAULT_CONSTITUTION_SOURCES }, baseBlob: null, revision: 0
    };
    if (edit.revision !== current.revision) {
      throw new BoardRefusal({
        reason: 'constitution-draft-stale', setupId, revision: edit.revision, currentRevision: current.revision
      });
    }
    const markdown = edit.markdown ?? current.markdown;
    this.refuseOverlongConstitution(markdown);

    const reopened = this.userEditReopenRecords(setup, 'constitution', at);
    setup.constitution = {
      markdown,
      annotations: reanchoredAnnotationsOf(markdown, current.annotations),
      draftedFrom: { ...(edit.draftedFrom ?? current.draftedFrom) },
      baseBlob:    current.baseBlob,
      revision:    current.revision + 1,
    };
    this.store(setup);
    return { logged: [...reopened, this.constitutionSetRecord(setupId, 'user', setup.constitution, at)], setup };
  }

  /** Every edit of one move lands at once, at the next revision, each kept for attribution and Undo. */
  editDraft(setupId: string, request: DraftEditRequest, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    if (request.revision !== null && request.revision !== setup.draftRevision) {
      throw new BoardRefusal({
        reason: 'pipeline-draft-stale', setupId, revision: request.revision, currentRevision: setup.draftRevision
      });
    }
    if (request.edits.length === 0) throw new BoardRefusal({ reason: 'no-draft-edits', setupId });

    let draft = setup.draft ?? this.basePipeline();
    for (const { edit } of request.edits) {
      this.refuseMismatchedEdit(draft, edit);
      draft = PipelineDraftEditUtil.pipelineWithEdit(draft, edit);
    }
    const reopened = request.by === 'user' ? this.userEditReopenRecords(setup, 'design', at) : [];
    const editIds: string[] = [];
    const fields: string[]  = [];
    for (const { edit, summary } of request.edits) {
      const editId = `${SETUP_EDIT_ID_PREFIX}${setup.nextNumbers.edit}`;
      const field  = PipelineDraftEditUtil.fieldOf(edit);
      setup.edits.push({
        editId, by: request.by, field, summary, undone: false
      });
      setup.nextNumbers.edit += 1;
      editIds.push(editId);
      fields.push(field);
    }
    setup.draft          = draft;
    setup.draftRevision += 1;
    this.store(setup);
    const loggedFields = {
      by: request.by, revision: setup.draftRevision, editIds, fields
    };
    return { logged: [...reopened, this.records.logger.log({ kind: 'pipeline-draft-edited', setupId, fields: loggedFields }, at)], setup };
  }

  /** Writes the base pipeline's value of the edit's field back; the edit stays listed, marked undone. */
  undoDraftEdit(setupId: string, editId: string, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    const edit  = setup.edits.find((candidate) => candidate.editId === editId);
    if (edit === undefined) throw new BoardRefusal({ reason: 'unknown-setup-edit', setupId, editId });
    if (edit.undone) throw new BoardRefusal({ reason: 'setup-edit-already-undone', setupId, editId });

    const base          = this.basePipeline();
    setup.draft         = PipelineDraftEditUtil.pipelineWithBaseValueOf(base, setup.draft ?? base, edit.field);
    edit.undone         = true;
    setup.draftRevision += 1;
    this.store(setup);
    const fields = { editId, field: edit.field, revision: setup.draftRevision };
    return { logged: [this.records.logger.log({ kind: 'pipeline-draft-undone', setupId, fields }, at)], setup };
  }

  /** Drops every proposed change: the draft is the base again, every edit is undone, and the agent stays. */
  discardDraft(setupId: string, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    setup.draft = setup.mode === 'setup' && setup.draft === null ? null : this.basePipeline();
    for (const edit of setup.edits) edit.undone = true;
    setup.draftRevision += 1;
    this.store(setup);
    return { logged: [this.records.logger.log({ kind: 'pipeline-draft-discarded', setupId, fields: { revision: setup.draftRevision } }, at)], setup };
  }

  /** Removes the record; the agent's end and the snapshot's removal are the Overseer's, after the hold. */
  startOverSetup(setupId: string, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    this.records.pipelineSetupReading = { verdict: 'absent' };
    this.records.pipelineSetupChanged = true;
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-discarded', setupId, fields: {} }, at)], setup };
  }

  openSetupRecord(): PipelineSetup | null {
    const reading = this.records.pipelineSetupReading;
    return reading.verdict === 'readable' ? reading.setup : null;
  }

  /** The stored pipeline, or the minimal one for a first setup: what the change list and Undo compare with. */
  private basePipeline(): Pipeline {
    return structuredClone(this.records.pipeline ?? PipelineUtil.minimalPipelineOf()) as Pipeline;
  }

  private requireOpenSetup(setupId: string): PipelineSetup {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.reason });
    if (reading.verdict === 'absent' || reading.setup.setupId !== setupId) throw new BoardRefusal({ reason: 'no-setup-open', setupId });
    return reading.setup;
  }

  private requireMovableSetup(setupId: string): PipelineSetup {
    const setup = this.requireOpenSetup(setupId);
    const { applyRequest } = setup;
    const states: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (applyRequest !== null && states.includes(applyRequest.state)) throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId });
    return setup;
  }

  private store(setup: PipelineSetup): void {
    this.records.pipelineSetupReading = { verdict: 'readable', setup };
    this.records.pipelineSetupChanged = true;
  }

  private openingConstitutionOf(opening: PipelineSetupOpening): ConstitutionDraft | null {
    const { mainConstitution } = opening;
    if (mainConstitution === null && opening.mode === 'setup') return null;
    const markdown = mainConstitution?.markdown ?? '';
    return {
      markdown,
      annotations: reanchoredAnnotationsOf(markdown, opening.storedAnnotations),
      draftedFrom: { ...DEFAULT_CONSTITUTION_SOURCES },
      baseBlob:    mainConstitution?.blob ?? null,
      revision:    0,
    };
  }

  /** Only User's edit of a step before the current one of a first setup reopens it; the agent's moves never move a step. */
  private userEditReopenRecords(setup: PipelineSetup, step: PipelineSetupStep, at: string): LogRecord[] {
    if (setup.mode !== 'setup' || stepIndexOf(step) >= stepIndexOf(setup.currentStep)) return [];
    return this.reopenedStepRecords(setup, step, at);
  }

  /** Only a step at or before the current one reopens, so a later step that needs a recheck still waits for its Continue. */
  private reopenedStepRecords(setup: PipelineSetup, step: PipelineSetupStep, at: string): LogRecord[] {
    if (setup.stepStates[step] === 'not-started' || stepIndexOf(step) > stepIndexOf(setup.currentStep)) {
      throw new BoardRefusal({ reason: 'setup-step-not-reached', setupId: setup.setupId, step });
    }
    if (setup.stepStates[step] !== 'needs-recheck') setup.stepStates[step] = 'in-progress';
    setup.currentStep = step;
    const needsRecheck = PIPELINE_SETUP_STEPS.slice(stepIndexOf(step) + 1).filter((laterStep) => setup.stepStates[laterStep] === 'done');
    for (const laterStep of needsRecheck) setup.stepStates[laterStep] = 'needs-recheck';
    this.store(setup);
    return [this.stepMovedRecord(setup, step, needsRecheck, at)];
  }

  private stepMovedRecord(setup: PipelineSetup, step: PipelineSetupStep, needsRecheck: readonly PipelineSetupStep[], at: string): LogRecord {
    const fields = {
      step, state: setup.stepStates[step], currentStep: setup.currentStep, needsRecheck: [...needsRecheck]
    };
    return this.records.logger.log({ kind: 'pipeline-setup-step-moved', setupId: setup.setupId, fields }, at);
  }

  private constitutionSetRecord(setupId: string, by: SetupEditAuthor, constitution: ConstitutionDraft, at: string): LogRecord {
    return this.records.logger.log({ kind: 'pipeline-constitution-set', setupId, fields: { by, revision: constitution.revision } }, at);
  }

  private refuseOverlongConstitution(markdown: string): void {
    if (markdown.length > CONSTITUTION_LIMIT_CHARACTERS) {
      throw new BoardRefusal({ reason: 'constitution-too-long', characterCount: markdown.length, limit: CONSTITUTION_LIMIT_CHARACTERS });
    }
  }

  /** A gate or step names itself as its field does, and a prepare order names each prepare step once. */
  private refuseMismatchedEdit(draft: Readonly<Pipeline>, edit: DraftEditRequest['edits'][number]['edit']): void {
    if ((edit.target === 'gate' || edit.target === 'prepare') && edit.value !== null && edit.value.name !== edit.name) {
      throw new BoardRefusal({ reason: 'draft-edit-name-mismatch', field: PipelineDraftEditUtil.fieldOf(edit), name: edit.value.name });
    }
    if (edit.target !== 'prepare-order') return;
    const prepareNames = draft.prepare.map((step) => step.name);
    const isReorder    = edit.names.length === prepareNames.length && new Set(edit.names).size === edit.names.length
      && edit.names.every((name) => prepareNames.includes(name));
    if (!isReorder) throw new BoardRefusal({ reason: 'prepare-order-not-a-reorder', names: [...edit.names], prepareNames });
  }

  private refuseLettersOutside(letters: readonly string[], optionLetters: readonly string[], multiple: boolean): void {
    const unknownLetters = letters.filter((letter) => !optionLetters.includes(letter));
    if (unknownLetters.length > 0) throw new BoardRefusal({ reason: 'unknown-setup-option-letters', unknownLetters, optionLetters });
    if (!multiple && new Set(letters).size > 1) throw new BoardRefusal({ reason: 'several-letters-on-single-select-setup-question', letters: [...letters] });
  }

  /** The counter is stored and never wound back, so a discarded or applied record's id is never handed to a new one. */
  private takeNextSetupNumber(): number {
    const allocated = this.records.progress.nextSetupId ?? FIRST_SETUP_NUMBER;
    this.records.progress.nextSetupId = allocated + 1;
    return allocated;
  }
}
