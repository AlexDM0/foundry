/**
 * The setup record's moves: one open record at a time, its steps, the agent's findings, questions, constitution and draft edits, and
 * User's answers, edits and Undo. A User edit of an earlier step reopens it, and a step reopened sends every later done step to
 * `needs-recheck`, whose only exit is Continue. While an Apply request waits for its commit, every move here refuses but Apply's own.
 * Apply has two stages: the request checks the record and, while main lacks the draft's constitution, waits for its commit; the finish
 * stores the pipeline, the constitution's sources and the board's settings, logs, and last closes the record. It is idempotent by setup
 * and draft revision, so a retried Apply never refuses the pipeline it stored itself.
 */
import type { PipelineApplyChanged, PipelineSetupChanged } from './@types/BoardChanges.ts';
import type { LogRecord }                                  from './@types/LogRecord.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineBilling,
  PipelineEntity,
  PipelineGate,
  PipelineStep
} from './@types/Pipeline.ts';
import type {
  ApplyFinishing,
  ApplyHolding,
  ApplyRefusal,
  ApplyRequesting,
  ConstitutionDraft,
  ConstitutionEdit,
  ConstitutionSetting,
  ConstitutionSources,
  DraftEditRequest,
  EntityDraftEdit,
  MainConstitution,
  PipelineDraftEdit,
  PipelineCheckEnding,
  PipelineCheckStart,
  PipelineSetup,
  PipelineSetupEntity,
  PipelineSetupOpening,
  PipelineSetupStep,
  PipelineSetupStepState,
  PipelineSetupStepStates,
  ResearchFindingRecording,
  SetupEdit,
  SetupEditAuthor,
  SetupQuestion,
  SetupQuestionAsking,
  SetupQuestionReply,
  SetupQuestionStep,
  SnapshotRefusal,
  SourceAnnotation,
  SourceAnnotationKind
} from './@types/PipelineSetup.ts';
import type { BoardRecords }                from './BoardRecords.ts';
import { BoardRefusal }                     from './BoardRefusal.ts';
import type { Decisions }                   from './Decisions.ts';
import type { TrackerChanges }              from './TrackerChanges.ts';
import { PIPELINE_APPLIED_DECISION_REASON } from './constants/DecisionAndIncidentVocabulary.ts';
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
  SETUP_QUESTION_OPTION_LETTERS,
  UNFINISHED_PIPELINE_CHECK_STATES
} from './constants/PipelineSetupVocabulary.ts';
import { PipelineChangeUtil }    from './utils/PipelineChangeUtil.ts';
import { PipelineDraftEditUtil } from './utils/PipelineDraftEditUtil.ts';
import { PipelineUtil }          from './utils/PipelineUtil.ts';

/** The steps an update or advise record opens with: everything before Apply is already set. */
const UPDATE_STEP_STATES: Readonly<PipelineSetupStepStates> = {
  billing: 'done', research: 'done', constitution: 'done', design: 'done', apply: 'not-started'
};

/** The SOURCES tick that selects each kind of source a constitution line may name. */
const SOURCE_TICK_OF_KIND: Readonly<Record<SourceAnnotationKind, keyof ConstitutionSources>> = {
  'contributing':      'contributing',
  'research':          'research',
  'installed-default': 'installedDefault',
};

/** A first setup starts with the billing User chose, so it opens at the research, the agent's first step. */
const FIRST_SETUP_STEP_STATES: Readonly<PipelineSetupStepStates> = {
  billing: 'done', research: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
};

function stepIndexOf(step: PipelineSetupStep): number {
  return PIPELINE_SETUP_STEPS.indexOf(step);
}

/** The steps the record walks, in order: `entities` only while its step states hold it. */
function walkedStepsOf(setup: Readonly<PipelineSetup>): PipelineSetupStep[] {
  return PIPELINE_SETUP_STEPS.filter((step) => step !== 'entities' || setup.stepStates.entities !== undefined);
}

/** A step the record does not walk is never started. */
function stepStateOf(setup: Readonly<PipelineSetup>, step: PipelineSetupStep): PipelineSetupStepState {
  return setup.stepStates[step] ?? 'not-started';
}

/** An update of a stored pipeline over entities walks the `entities` step, done like every step before Apply. */
function updateStepStatesOf(stored: Readonly<Pipeline> | null): PipelineSetupStepStates {
  return stored?.entities === undefined ? { ...UPDATE_STEP_STATES } : { ...UPDATE_STEP_STATES, entities: 'done' };
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

/** The constitution text the draft holds, or `null` when it holds none, which main matches only by holding no file either. */
function draftConstitutionTextOf(setup: Readonly<PipelineSetup>): string | null {
  const markdown = setup.constitution?.markdown ?? '';
  return markdown === '' ? null : markdown;
}

function mainHoldsTheDraftText(setup: Readonly<PipelineSetup>, mainConstitution: MainConstitution | null): boolean {
  return draftConstitutionTextOf(setup) === (mainConstitution?.markdown ?? null);
}

/** Where a check is held: the record itself for the forge's own, an entity's part for that entity's. */
interface CheckHolder {
  entityKey: EntityKey | null;
  holder:    Pick<PipelineSetup, 'check'>;
}

const ROOT_FOLDER = '/';

function entityPartsOf(setup: Readonly<PipelineSetup>): [EntityKey, PipelineSetupEntity][] {
  return Object.entries(setup.entities ?? {});
}

/** The forge's questions first, then each entity's, in the record's order. */
function everyQuestionOf(setup: Readonly<PipelineSetup>): SetupQuestion[] {
  return [...setup.questions, ...entityPartsOf(setup).flatMap(([, part]) => part.questions)];
}

function checkHoldersOf(setup: PipelineSetup): CheckHolder[] {
  return [{ entityKey: null, holder: setup }, ...entityPartsOf(setup).map(([entityKey, part]) => ({ entityKey, holder: part }))];
}

/** The record for the forge's check; an entity's existing part for its check, `undefined` when the record holds no such part. */
function existingCheckHolderOf(setup: PipelineSetup, entityKey: EntityKey | undefined): Pick<PipelineSetup, 'check'> | undefined {
  if (entityKey === undefined) return setup;
  return setup.entities !== undefined && Object.hasOwn(setup.entities, entityKey) ? setup.entities[entityKey] : undefined;
}

function entityOf(pipeline: Readonly<Pipeline>, entityKey: EntityKey): Readonly<PipelineEntity> | undefined {
  return pipeline.entities !== undefined && Object.hasOwn(pipeline.entities, entityKey) ? pipeline.entities[entityKey] : undefined;
}

export class PipelineSetups {
  constructor(
    private readonly records: BoardRecords,
    private readonly trackerChanges: TrackerChanges,
    private readonly decisionRules: Decisions,
  ) {}

  /**
   * Refuses `setup-in-progress` beside an open record. A first setup opens at the research, its billing done; an update or advise record
   * starts from the stored pipeline at the design.
   */
  openSetup(opening: PipelineSetupOpening, at: string): PipelineSetupChanged {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.reason });
    if (reading.verdict === 'readable') throw new BoardRefusal({ reason: 'setup-in-progress', setupId: reading.setup.setupId });
    const stored = this.records.pipeline;
    if (opening.mode !== 'setup' && stored === null) throw new BoardRefusal({ reason: 'no-pipeline-to-update', mode: opening.mode });

    const isUpdate = opening.mode !== 'setup';
    const stepStates = isUpdate ? updateStepStatesOf(stored) : { ...FIRST_SETUP_STEP_STATES };
    const setup: PipelineSetup = {
      formatVersion:              1,
      setupId:                    `${SETUP_ID_PREFIX}${this.takeNextSetupNumber()}`,
      mode:                       opening.mode,
      baseContentHash:            isUpdate && stored !== null ? PipelineUtil.contentHashOf(stored) : null,
      stepStates,
      currentStep:                isUpdate ? 'design' : 'research',
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

    const walkedSteps = walkedStepsOf(setup);
    const nextStep    = walkedSteps[walkedSteps.indexOf(step) + 1] ?? 'apply';
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
   * The pipeline agent that serves the record, or with an entity key that entity's part of it, and the main commit the record's snapshot
   * holds when none is set yet. It logs nothing: the job's launch is logged.
   */
  attachSetupAgent(setupId: string, agentJobId: string, snapshotCommit: string | null, entityKey?: EntityKey): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    if (entityKey === undefined) setup.agentJobId = agentJobId;
    else this.entityPartOf(setup, entityKey).agentJobId = agentJobId;
    setup.snapshotCommit ??= snapshotCommit;
    this.store(setup);
    return { logged: [], setup };
  }

  /** An update or advise opened at an entity: the record names that level and holds the entity's part, empty until a move records into it. */
  openAtEntity(setupId: string, entityKey: EntityKey): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    setup.openedAtEntity = entityKey;
    this.entityPartOf(setup, entityKey);
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

  /** A finding of the forge's part of the record or, with an entity key, of that entity's part; the finding numbers are the record's own. */
  recordFinding(setupId: string, recording: ResearchFindingRecording, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup     = this.requireMovableSetup(setupId);
    const findingId = `${FINDING_ID_PREFIX}${setup.nextNumbers.finding}`;
    const findings  = entityKey === undefined ? setup.findings : this.entityPartOf(setup, entityKey).findings;
    findings.push({
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

  /**
   * Two to four options and a recommendation inside them: one, unless the question takes several. With an entity key the question is that
   * entity's; the question numbers are the record's own.
   */
  askSetupQuestion(setupId: string, asking: SetupQuestionAsking, at: string, entityKey?: EntityKey): PipelineSetupChanged {
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
    (entityKey === undefined ? setup.questions : this.entityPartOf(setup, entityKey).questions).push(question);
    setup.nextNumbers.question += 1;
    this.store(setup);
    const fields = { questionId, step: asking.step };
    return { logged: [this.records.logger.log({ kind: 'pipeline-question-asked', setupId, fields }, at)], setup };
  }

  /**
   * User's answer, to a question of the forge or of any entity; answering again replaces it. An answer at an earlier step of a first setup
   * reopens that step.
   */
  answerSetupQuestion(setupId: string, questionId: string, reply: SetupQuestionReply, at: string): PipelineSetupChanged {
    const setup    = this.requireMovableSetup(setupId);
    const question = everyQuestionOf(setup).find((candidate) => candidate.questionId === questionId);
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

  /**
   * The agent's whole document and its sources, of the forge or, with an entity key, of that entity; a source must name a line the text
   * holds, once, of a kind the SOURCES ticks select.
   */
  setConstitution(setupId: string, setting: ConstitutionSetting, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    if (setting.markdown.trim() === '') throw new BoardRefusal({ reason: 'constitution-empty' });
    this.refuseOverlongConstitution(setting.markdown);
    const holder = entityKey === undefined ? setup : this.entityPartOf(setup, entityKey);
    const ticks = holder.constitution?.draftedFrom ?? DEFAULT_CONSTITUTION_SOURCES;
    const anchoredLines = new Set<string>();
    for (const annotation of setting.annotations) {
      const { lineText, occurrence, kind } = annotation;
      if (!ticks[SOURCE_TICK_OF_KIND[kind]]) throw new BoardRefusal({
        reason: 'constitution-source-not-ticked', lineText, occurrence, kind
      });
      const occurs = !/[\r\n]/u.test(lineText) && Number.isInteger(occurrence) && occurrence >= 1 && occurrencesOf(setting.markdown, lineText) >= occurrence;
      if (!occurs) throw new BoardRefusal({ reason: 'constitution-source-unanchored', lineText, occurrence });
      const lineKey = JSON.stringify([lineText, occurrence]);
      if (anchoredLines.has(lineKey)) throw new BoardRefusal({ reason: 'constitution-source-repeated', lineText, occurrence });
      anchoredLines.add(lineKey);
    }

    const previous = holder.constitution;
    holder.constitution = {
      markdown:    setting.markdown,
      annotations: setting.annotations.map((annotation) => ({ ...annotation })),
      draftedFrom: previous === null ? { ...DEFAULT_CONSTITUTION_SOURCES } : previous.draftedFrom,
      baseBlob:    previous?.baseBlob ?? null,
      revision:    (previous?.revision ?? 0) + 1,
    };
    this.store(setup);
    return { logged: [this.constitutionSetRecord(setup.setupId, 'agent', holder.constitution, at)], setup };
  }

  /**
   * User's markdown or SOURCES ticks, of the forge or, with an entity key, of that entity, at the revision User saw; the sources re-anchor,
   * so an edited line loses its tag.
   */
  editConstitution(setupId: string, edit: ConstitutionEdit, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup   = this.requireMovableSetup(setupId);
    const holder  = entityKey === undefined ? setup : this.entityPartOf(setup, entityKey);
    const current = holder.constitution ?? {
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
    holder.constitution = {
      markdown,
      annotations: reanchoredAnnotationsOf(markdown, current.annotations),
      draftedFrom: { ...(edit.draftedFrom ?? current.draftedFrom) },
      baseBlob:    current.baseBlob,
      revision:    current.revision + 1,
    };
    this.store(setup);
    return { logged: [...reopened, this.constitutionSetRecord(setupId, 'user', holder.constitution, at)], setup };
  }

  /**
   * The draft the edits would leave, refused as `editDraft` refuses them; nothing is stored, so a caller can check the draft before the
   * move writes anything.
   */
  draftAfterEdits(setupId: string, request: DraftEditRequest): Pipeline {
    return this.editedDraftOf(this.requireMovableSetup(setupId), request);
  }

  /**
   * Every edit of one move lands at once, at the next revision, each kept for attribution and Undo. The edits of a copy also carry their
   * set's `batch`, the first of their edit ids; each one still undoes alone.
   */
  editDraft(setupId: string, request: DraftEditRequest, at: string): PipelineSetupChanged {
    const setup    = this.requireMovableSetup(setupId);
    const draft    = this.editedDraftOf(setup, request);
    const reopened = request.by === 'user' ? this.userEditReopenRecords(setup, 'design', at) : [];
    const batch    = request.isACopy === true ? { batch: `${SETUP_EDIT_ID_PREFIX}${setup.nextNumbers.edit}` } : {};
    const editIds: string[] = [];
    const fields: string[]  = [];
    for (const { edit, summary } of request.edits) {
      const editId = `${SETUP_EDIT_ID_PREFIX}${setup.nextNumbers.edit}`;
      const field  = PipelineDraftEditUtil.fieldOf(edit);
      setup.edits.push({
        editId, by: request.by, field, summary, undone: false, ...batch
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

  /** The draft the Undo would leave, refused as `undoDraftEdit` refuses it; nothing is stored. */
  draftAfterUndo(setupId: string, editId: string): Pipeline {
    const setup = this.requireMovableSetup(setupId);
    return this.undoneDraftOf(setup, this.requireUndoableEdit(setup, editId));
  }

  /** Writes the base pipeline's value of the edit's field back; the edit stays listed, marked undone. */
  undoDraftEdit(setupId: string, editId: string, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    const edit  = this.requireUndoableEdit(setup, editId);
    setup.draft         = this.undoneDraftOf(setup, edit);
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

  /**
   * User's check of the gates the draft changes or adds against the base pipeline, which the Overseer runs. On a draft over entities, each
   * entity whose gates the draft touched gets a check of its own, of those gates. Refuses `no-gate-to-check` when the draft touches no
   * gate, and `pipeline-check-running` while an earlier check waits or runs.
   */
  requestCheck(setupId: string, at: string): PipelineSetupChanged {
    const setup = this.requireMovableSetup(setupId);
    const unfinishedStates: readonly string[] = UNFINISHED_PIPELINE_CHECK_STATES;
    const unfinished = checkHoldersOf(setup).some(({ holder }) => holder.check !== undefined && unfinishedStates.includes(holder.check.state));
    if (unfinished) throw new BoardRefusal({ reason: 'pipeline-check-running', setupId });
    const touchedLevels = this.checkedLevelsOf(setup)
      .map((entityKey) => ({ entityKey, gateNames: this.touchedGatesOf(setup, entityKey).map((gate) => gate.name) }))
      .filter((level) => level.gateNames.length > 0);
    if (touchedLevels.length === 0) throw new BoardRefusal({ reason: 'no-gate-to-check', setupId });
    const logged = touchedLevels.map(({ entityKey, gateNames }) => {
      const holder = entityKey === undefined ? setup : this.entityPartOf(setup, entityKey);
      holder.check = {
        draftRevision: setup.draftRevision, gateNames, state: 'queued', result: null, reason: null
      };
      const fields = { revision: setup.draftRevision, gateNames };
      return this.records.logger.log({ kind: 'pipeline-check-requested', setupId, fields }, at);
    });
    this.store(setup);
    return { logged, setup };
  }

  /** The levels of the open record whose check waits for the Overseer: `null` for the forge's own, else the entity's key. */
  queuedCheckLevels(): (EntityKey | null)[] {
    const setup = this.openSetupRecord();
    if (setup === null) return [];
    return checkHoldersOf(setup).filter(({ holder }) => holder.check?.state === 'queued').map(({ entityKey }) => entityKey);
  }

  /**
   * The Overseer's start of the record's queued check, of the forge or of one entity, in the hold: the prepare steps and the touched gates
   * of the draft as it is now, which the check then names; an entity's come with its first home. `null` when the record is gone, is
   * another one, or has no queued check there.
   */
  startCheck(setupId: string, entityKey?: EntityKey): PipelineCheckStart | null {
    const setup = this.openSetupRecord();
    const check = setup?.setupId === setupId ? existingCheckHolderOf(setup, entityKey)?.check : undefined;
    if (setup === null || check?.state !== 'queued') return null;
    const gates = this.touchedGatesOf(setup, entityKey);
    check.draftRevision = setup.draftRevision;
    check.gateNames = gates.map((gate) => gate.name);
    check.state = 'running';
    this.store(setup);
    if (entityKey === undefined) {
      return { draftRevision: setup.draftRevision, prepare: structuredClone(setup.draft?.prepare ?? []), gates: structuredClone(gates) };
    }
    const entity = setup.draft === null ? undefined : entityOf(setup.draft, entityKey);
    return {
      draftRevision: setup.draftRevision,
      prepare:       structuredClone(entity?.prepare ?? []),
      gates:         structuredClone(gates),
      entityHome:    entity?.home[0] ?? ROOT_FOLDER,
    };
  }

  /** The end of the record's running check there. `null` when the record is gone, is another one, or that check is no longer running. */
  endCheck(setupId: string, ending: PipelineCheckEnding, entityKey?: EntityKey): PipelineSetupChanged | null {
    const setup = this.openSetupRecord();
    const check = setup?.setupId === setupId ? existingCheckHolderOf(setup, entityKey)?.check : undefined;
    if (setup === null || check?.state !== 'running') return null;
    check.state  = ending.state;
    check.result = ending.state === 'checked' ? structuredClone(ending.result) : null;
    check.reason = ending.state === 'cannot-run' ? ending.reason : null;
    this.store(setup);
    return { logged: [], setup };
  }

  /** At an Overseer's start, or as it stops: each running check reads `stopped`, with no result, and runs again only on User's press. */
  stopRunningCheck(): PipelineSetupChanged | null {
    const setup = this.openSetupRecord();
    if (setup === null) return null;
    const running = checkHoldersOf(setup).flatMap(({ holder }) => (holder.check?.state === 'running' ? [holder.check] : []));
    if (running.length === 0) return null;
    for (const check of running) check.state = 'stopped';
    this.store(setup);
    return { logged: [], setup };
  }

  /**
   * Stage 1. The request of the revision already waiting answers with it, and the revision an earlier Apply closed answers
   * `already-applied`. Otherwise it refuses an open question, a step that needs a recheck, a touched snapshot, a stored pipeline that
   * moved since the record opened, and a `CONSTITUTION.md` main changed since; when main already holds the draft's text, stage 2 runs at
   * once, else the request waits for the constitution commit and nothing else is written.
   */
  requestApply(setupId: string, requesting: ApplyRequesting, at: string): PipelineApplyChanged {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.reason });
    if ((reading.verdict === 'absent' || reading.setup.setupId !== setupId) && this.revisionWasApplied(setupId, requesting.draftRevision)) {
      return { logged: [], outcome: 'already-applied', setup: null };
    }
    const setup = this.requireOpenSetup(setupId);
    const { applyRequest } = setup;
    const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (applyRequest !== null && pendingStates.includes(applyRequest.state)) {
      if (applyRequest.draftRevision === requesting.draftRevision) return { logged: [], outcome: 'committing', setup };
      throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId });
    }
    this.refuseUnappliable(setup, requesting.draftRevision);
    const mainHoldsText = mainHoldsTheDraftText(setup, requesting.mainConstitution);
    this.refuseMovedConstitution(setup, requesting.mainConstitution, mainHoldsText);
    this.refuseMovedPipeline(setup, this.appliedPipelineOf(setup, requesting.mainConstitution));
    if (mainHoldsText) return this.finishApply(setupId, { ...requesting, constitutionCommit: null }, at);

    setup.applyRequest = {
      draftRevision: requesting.draftRevision, resumesBoard: requesting.resumesBoard, commitJobId: null, state: 'committing', reason: null
    };
    this.store(setup);
    const fields = { revision: requesting.draftRevision, resumesBoard: requesting.resumesBoard };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-requested', setupId, fields }, at)], outcome: 'committing', setup };
  }

  /**
   * Stage 2, in the hold that found main holding the draft's text: the whole pipeline with `constitution.path` on main's file, the
   * constitution's sources keyed by its blob id, the withdrawal of `checks-not-set` and the resume when asked, `pipeline-applied`, and
   * last the record's close. A pipeline already stored from this draft is no move of anyone else's, so a retry finishes the rest.
   */
  finishApply(setupId: string, finishing: ApplyFinishing, at: string): PipelineApplyChanged {
    const setup = this.requireOpenSetup(setupId);
    if (finishing.draftRevision !== setup.draftRevision) {
      throw new BoardRefusal({
        reason: 'pipeline-draft-stale', setupId, revision: finishing.draftRevision, currentRevision: setup.draftRevision
      });
    }
    if (!mainHoldsTheDraftText(setup, finishing.mainConstitution)) {
      throw new BoardRefusal({
        reason: 'constitution-moved', setupId, baseBlob: setup.constitution?.baseBlob ?? null, mainBlob: finishing.mainConstitution?.blob ?? null
      });
    }
    const applied = this.appliedPipelineOf(setup, finishing.mainConstitution);
    this.refuseMovedPipeline(setup, applied);

    const base   = this.records.pipeline ?? PipelineUtil.minimalPipelineOf();
    const fields = PipelineChangeUtil.changedFieldNamesOf(base, applied, (setup.constitution?.baseBlob ?? null) !== (finishing.mainConstitution?.blob ?? null));
    this.trackerChanges.applyPipeline(applied);
    this.storeConstitutionSources(setup, finishing.mainConstitution);
    const logged = this.decisionRules.decisions().filter((decision) => decision.kind === 'checks-not-set')
      .flatMap((decision) => this.decisionRules.withdrawDecision(decision.id, PIPELINE_APPLIED_DECISION_REASON, at).logged);
    if (finishing.resumesBoard) logged.push(...this.trackerChanges.setOverseerState('running', at).logged);
    if (!this.revisionWasApplied(setupId, setup.draftRevision)) {
      logged.push(this.records.logger.log({
        kind:   'pipeline-applied',
        setupId,
        fields: {
          revision:           setup.draftRevision,
          resumesBoard:       finishing.resumesBoard,
          changedFields:      fields.changedFields,
          newFields:          fields.newFields,
          removedFields:      fields.removedFields,
          constitutionCommit: finishing.constitutionCommit,
        },
      }, at));
    }
    this.records.pipelineSetupReading = { verdict: 'absent' };
    this.records.pipelineSetupChanged = true;
    return { logged, outcome: 'applied', setup };
  }

  /**
   * An open record whose draft, as applied, is already the stored pipeline while the record's base is not: an Apply stored it and was cut
   * short before its close. The Overseer's start finishes it, resuming the board only as a stored request asked.
   */
  finishHalfAppliedSetup(mainConstitution: MainConstitution | null, at: string): PipelineApplyChanged | null {
    const setup  = this.openSetupRecord();
    const stored = this.records.pipeline;
    if (setup === null || stored === null || !mainHoldsTheDraftText(setup, mainConstitution)) return null;
    const storedHash = PipelineUtil.contentHashOf(stored);
    if (storedHash === setup.baseContentHash || storedHash !== PipelineUtil.contentHashOf(this.appliedPipelineOf(setup, mainConstitution))) return null;
    return this.finishApply(setup.setupId, {
      draftRevision: setup.draftRevision, resumesBoard: setup.applyRequest?.resumesBoard ?? false, mainConstitution, constitutionCommit: null
    }, at);
  }

  /** The constitution commit waits, as the Airlock found main: the request stays, and so does every refusal of the other moves. */
  holdApply(setupId: string, holding: ApplyHolding, at: string): PipelineSetupChanged {
    const setup   = this.requireOpenSetup(setupId);
    const request = this.requirePendingRequest(setup);
    setup.applyRequest = {
      ...request, commitJobId: null, state: 'held', reason: holding.reason
    };
    this.store(setup);
    const fields = { reason: holding.reason, blockingFiles: [...holding.blockingFiles] };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-held', setupId, fields }, at)], setup };
  }

  /** The constitution commit cannot be made: the request stays, refused, and the record is editable again. */
  refuseApply(setupId: string, refusal: ApplyRefusal, at: string): PipelineSetupChanged {
    const setup   = this.requireOpenSetup(setupId);
    const request = this.requirePendingRequest(setup);
    setup.applyRequest = {
      ...request, commitJobId: null, state: 'refused', reason: refusal.reason
    };
    this.store(setup);
    const fields = { reason: refusal.reason, gitFailure: refusal.gitFailure };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-refused', setupId, fields }, at)], setup };
  }

  /** The record's request while it waits for its commit; refuses `no-setup-open` or `no-apply-pending`. */
  requirePendingApply(setupId: string): Readonly<NonNullable<PipelineSetup['applyRequest']>> {
    return this.requirePendingRequest(this.requireOpenSetup(setupId));
  }

  /** The Airlock's constitution commit job takes the waiting request: it is committing again, under that job. */
  attachApplyCommitJob(setupId: string, commitJobId: string): PipelineSetupChanged {
    const setup   = this.requireOpenSetup(setupId);
    const request = this.requirePendingRequest(setup);
    setup.applyRequest = {
      ...request, commitJobId, state: 'committing', reason: null
    };
    this.store(setup);
    return { logged: [], setup };
  }

  /** A constitution commit job that ended without a landing leaves the request committing, for the next job; another job's request stays. */
  detachApplyCommitJob(commitJobId: string): void {
    const setup = this.openSetupRecord();
    if (setup?.applyRequest?.commitJobId !== commitJobId) return;
    setup.applyRequest = { ...setup.applyRequest, commitJobId: null };
    this.store(setup);
  }

  /** Whether the stored pipeline is neither the record's base nor its draft as applied on `mainConstitution`: stage 2 would refuse it. */
  storedPipelineMovedSince(setupId: string, mainConstitution: MainConstitution | null): boolean {
    const setup  = this.requireOpenSetup(setupId);
    const stored = this.records.pipeline;
    const contentHash = stored === null ? null : PipelineUtil.contentHashOf(stored);
    return contentHash !== setup.baseContentHash && contentHash !== PipelineUtil.contentHashOf(this.appliedPipelineOf(setup, mainConstitution));
  }

  /**
   * Clears a committing, held or refused request; the record is back at the design step, in progress and editable, Apply is not reached,
   * and its pipeline is not stored.
   */
  cancelApply(setupId: string, at: string): PipelineSetupChanged {
    const setup   = this.requireOpenSetup(setupId);
    const request = setup.applyRequest;
    if (request === null) throw new BoardRefusal({ reason: 'no-apply-pending', setupId });
    setup.applyRequest      = null;
    setup.currentStep       = 'design';
    setup.stepStates.design = 'in-progress';
    setup.stepStates.apply  = 'not-started';
    this.store(setup);
    const fields = { revision: request.draftRevision, state: request.state };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-cancelled', setupId, fields }, at)], setup };
  }

  openSetupRecord(): PipelineSetup | null {
    const reading = this.records.pipelineSetupReading;
    return reading.verdict === 'readable' ? reading.setup : null;
  }

  /**
   * Stage 1's refusals that do not read main: a stale revision, an open question of the forge or of any entity, a step to recheck, a
   * touched snapshot, a moved pipeline.
   */
  private refuseUnappliable(setup: Readonly<PipelineSetup>, draftRevision: number): void {
    const { setupId } = setup;
    if (draftRevision !== setup.draftRevision) {
      throw new BoardRefusal({
        reason: 'pipeline-draft-stale', setupId, revision: draftRevision, currentRevision: setup.draftRevision
      });
    }
    const questionIds = everyQuestionOf(setup).filter((question) => question.answer === null).map((question) => question.questionId);
    if (questionIds.length > 0) throw new BoardRefusal({ reason: 'setup-question-open', setupId, questionIds });
    const steps = PIPELINE_SETUP_STEPS.filter((step) => step !== 'apply' && setup.stepStates[step] === 'needs-recheck');
    if (steps.length > 0) throw new BoardRefusal({ reason: 'setup-step-needs-recheck', setupId, steps });
    if (this.setupSnapshotIsTouched(setupId)) throw new BoardRefusal({ reason: 'setup-snapshot-touched', setupId });
  }

  /**
   * Main's `CONSTITUTION.md` must be the one the record opened on, unless main already holds the draft's text, as after a hand commit of
   * it. A draft with no text cannot remove a file main holds.
   */
  private refuseMovedConstitution(setup: Readonly<PipelineSetup>, mainConstitution: MainConstitution | null, mainHoldsText: boolean): void {
    if (mainHoldsText) return;
    const baseBlob = setup.constitution?.baseBlob ?? null;
    const mainBlob = mainConstitution?.blob ?? null;
    if (baseBlob !== mainBlob) throw new BoardRefusal({
      reason: 'constitution-moved', setupId: setup.setupId, baseBlob, mainBlob
    });
    if (draftConstitutionTextOf(setup) === null) throw new BoardRefusal({ reason: 'constitution-empty' });
  }

  /** The stored pipeline must be the record's base, or this draft as applied: a `gate` verb since the record opened refuses. */
  private refuseMovedPipeline(setup: Readonly<PipelineSetup>, applied: Readonly<Pipeline>): void {
    const stored      = this.records.pipeline;
    const contentHash = stored === null ? null : PipelineUtil.contentHashOf(stored);
    if (contentHash === setup.baseContentHash || contentHash === PipelineUtil.contentHashOf(applied)) return;
    throw new BoardRefusal({
      reason: 'pipeline-moved', setupId: setup.setupId, baseContentHash: setup.baseContentHash, contentHash
    });
  }

  /** The draft, or the base for a record with none, read with main's constitution file once main holds the draft's text. */
  private appliedPipelineOf(setup: Readonly<PipelineSetup>, mainConstitution: MainConstitution | null): Pipeline {
    const applied = structuredClone(setup.draft ?? this.basePipeline()) as Pipeline;
    if (mainConstitution !== null && draftConstitutionTextOf(setup) !== null) applied.constitution = { path: mainConstitution.path };
    return applied;
  }

  /** The agent's sources of the text main now holds, keyed by its blob id; unknown keys of the stored file stay. */
  private storeConstitutionSources(setup: Readonly<PipelineSetup>, mainConstitution: MainConstitution | null): void {
    if (mainConstitution === null || setup.constitution === null) return;
    const stored = this.records.constitutionSourcesReading;
    this.records.constitutionSourcesReading = {
      verdict: 'readable',
      sources: {
        formatVersion: 1,
        blob:          mainConstitution.blob,
        annotations:   setup.constitution.annotations.map((annotation) => ({ ...annotation })),
        extra:         stored.verdict === 'readable' ? stored.sources.extra : [],
      },
    };
    this.records.constitutionSourcesChanged = true;
  }

  /** Whether the log already holds this setup's `pipeline-applied` at this revision: the stored log, or this hold's. */
  private revisionWasApplied(setupId: string, draftRevision: number): boolean {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords].some((record) => record.kind === 'pipeline-applied'
      && record.setupId === setupId && record.fields.revision === draftRevision);
  }

  /**
   * The gates the draft changes or adds against the base pipeline, in draft order; a removed gate has nothing to run. With an entity key,
   * the entity's gates against the base's same entity, a new entity's against none.
   */
  private touchedGatesOf(setup: Readonly<PipelineSetup>, entityKey?: EntityKey): PipelineGate[] {
    if (setup.draft === null) return [];
    const base  = this.basePipeline();
    const draft = entityKey === undefined ? setup.draft : PipelineUtil.pipelineOfEntity(setup.draft, entityKey);
    if (draft === null) return [];
    const baseOfLevel = entityKey === undefined ? base : PipelineUtil.pipelineOfEntity(base, entityKey) ?? PipelineUtil.minimalPipelineOf();
    const touchedFields: readonly string[] = PipelineChangeUtil.changesBetween(baseOfLevel, draft, false)
      .filter((change) => change.change !== 'removed')
      .map((change) => change.field);
    return draft.gates.filter((gate) => touchedFields.includes(`gate:${gate.name}`));
  }

  /** The levels a check covers: the forge's own on a draft without entities, else every entity of the draft. */
  private checkedLevelsOf(setup: Readonly<PipelineSetup>): (EntityKey | undefined)[] {
    const entities = setup.draft?.entities;
    return entities === undefined ? [undefined] : Object.keys(entities);
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

  private requirePendingRequest(setup: Readonly<PipelineSetup>): NonNullable<PipelineSetup['applyRequest']> {
    const request = setup.applyRequest;
    const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (request === null || !pendingStates.includes(request.state)) throw new BoardRefusal({ reason: 'no-apply-pending', setupId: setup.setupId });
    return request;
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

  /** The entity's part of the record, created empty the first time a move records into it. */
  private entityPartOf(setup: PipelineSetup, entityKey: EntityKey): PipelineSetupEntity {
    const entities = setup.entities ?? {};
    setup.entities = entities;
    const existing = Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
    if (existing !== undefined) return existing;
    const created: PipelineSetupEntity = {
      agentJobId: null, findings: [], questions: [], constitution: null
    };
    entities[entityKey] = created;
    return created;
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
    const state = stepStateOf(setup, step);
    if (state === 'not-started' || stepIndexOf(step) > stepIndexOf(setup.currentStep)) {
      throw new BoardRefusal({ reason: 'setup-step-not-reached', setupId: setup.setupId, step });
    }
    if (state !== 'needs-recheck') setup.stepStates[step] = 'in-progress';
    setup.currentStep = step;
    const needsRecheck = PIPELINE_SETUP_STEPS.slice(stepIndexOf(step) + 1).filter((laterStep) => setup.stepStates[laterStep] === 'done');
    for (const laterStep of needsRecheck) setup.stepStates[laterStep] = 'needs-recheck';
    this.store(setup);
    return [this.stepMovedRecord(setup, step, needsRecheck, at)];
  }

  private stepMovedRecord(setup: PipelineSetup, step: PipelineSetupStep, needsRecheck: readonly PipelineSetupStep[], at: string): LogRecord {
    const fields = {
      step, state: stepStateOf(setup, step), currentStep: setup.currentStep, needsRecheck: [...needsRecheck]
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

  /** The record's draft, or the base, with every edit of the request written in order; refuses a stale revision and a mismatched edit. */
  private editedDraftOf(setup: Readonly<PipelineSetup>, request: DraftEditRequest): Pipeline {
    const { setupId } = setup;
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
    return draft;
  }

  private requireUndoableEdit(setup: PipelineSetup, editId: string): SetupEdit {
    const { setupId } = setup;
    const edit = setup.edits.find((candidate) => candidate.editId === editId);
    if (edit === undefined) throw new BoardRefusal({ reason: 'unknown-setup-edit', setupId, editId });
    if (edit.undone) throw new BoardRefusal({ reason: 'setup-edit-already-undone', setupId, editId });
    return edit;
  }

  private undoneDraftOf(setup: Readonly<PipelineSetup>, edit: Readonly<SetupEdit>): Pipeline {
    const base = this.basePipeline();
    return PipelineDraftEditUtil.pipelineWithBaseValueOf(base, setup.draft ?? base, edit.field);
  }

  /** A gate or step names itself as its field does, and a prepare order names each prepare step once, inside an entity as at the top. */
  private refuseMismatchedEdit(draft: Readonly<Pipeline>, edit: PipelineDraftEdit): void {
    if (edit.target !== 'within-entity') {
      this.refuseMismatchedStepsEdit(draft.prepare, edit, PipelineDraftEditUtil.fieldOf(edit));
      return;
    }
    const entity = draft.entities !== undefined && Object.hasOwn(draft.entities, edit.entityKey) ? draft.entities[edit.entityKey] : undefined;
    if (entity !== undefined) this.refuseMismatchedStepsEdit(entity.prepare, edit.edit, PipelineDraftEditUtil.fieldOf(edit));
  }

  private refuseMismatchedStepsEdit(prepare: readonly PipelineStep[], edit: PipelineDraftEdit | EntityDraftEdit, field: string): void {
    if ((edit.target === 'gate' || edit.target === 'prepare') && edit.value !== null && edit.value.name !== edit.name) {
      throw new BoardRefusal({ reason: 'draft-edit-name-mismatch', field, name: edit.value.name });
    }
    if (edit.target !== 'prepare-order') return;
    const prepareNames = prepare.map((step) => step.name);
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
