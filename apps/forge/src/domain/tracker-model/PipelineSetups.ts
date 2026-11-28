/**
 * The setup record's opening and walk: one open record at a time, its steps, its agent and billing, the agent's findings and questions,
 * User's answers, and the start over. A User edit of an earlier step reopens it, and a step reopened sends every later done step to
 * `needs-recheck`, whose only exit is Continue.
 */
import type { Logged, PipelineSetupChanged, PipelineSetupStartedOver } from './@types/BoardChanges.ts';
import type { LogRecord }                                              from './@types/LogRecord.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineAgent,
  PipelineBilling,
  PipelineTool
} from './@types/Pipeline.ts';
import {
  type ConstitutionDraft,
  type OfferedBillingModesOf,
  PIPELINE_SETUP_FORMAT_VERSION,
  type PipelineSetup,
  type PipelineSetupOpening,
  type PipelineSetupStep,
  type PipelineSetupStepStates,
  type ResearchFindingRecording,
  type SetupQuestion,
  type SetupQuestionAsking,
  type SetupQuestionReply,
  type SetupQuestionStep,
  type SnapshotRefusal
} from './@types/PipelineSetup.ts';
import type { BoardRecords }        from './BoardRecords.ts';
import { BoardRefusal }             from './BoardRefusal.ts';
import type { Jobs }                from './Jobs.ts';
import type { PipelineSetupRecord } from './PipelineSetupRecord.ts';
import type { TrackerChanges }      from './TrackerChanges.ts';
import {
  PENDING_APPLY_REQUEST_STATES,
  DEFAULT_CONSTITUTION_SOURCES,
  FINDING_ID_PREFIX,
  FIRST_SETUP_ITEM_NUMBER,
  FIRST_SETUP_NUMBER,
  LAYOUT_FINDINGS_PROPOSING_ENTITIES,
  MINIMUM_SETUP_QUESTION_OPTIONS,
  PIPELINE_SETUP_STEPS,
  SETUP_ID_PREFIX,
  SETUP_QUESTION_ID_PREFIX,
  SETUP_QUESTION_OPTION_LETTERS
} from './constants/PipelineSetupVocabulary.ts';
import { PipelineSetupUtil } from './utils/PipelineSetupUtil.ts';
import { PipelineUtil }      from './utils/PipelineUtil.ts';

/** The steps an update or advise record opens with: everything before Apply is already set. */
const UPDATE_STEP_STATES: Readonly<PipelineSetupStepStates> = {
  agent: 'done', billing: 'done', research: 'done', constitution: 'done', design: 'done', apply: 'not-started'
};

/** A first setup started with its agent and its billing opens at the research, the pipeline agent's first step. */
const FIRST_SETUP_STEP_STATES: Readonly<PipelineSetupStepStates> = {
  agent: 'done', billing: 'done', research: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
};

/** A first setup started with its agent alone opens at the billing step: no pipeline agent launches before it is done. */
const BILLING_STEP_STATES: Readonly<PipelineSetupStepStates> = {
  agent: 'done', billing: 'in-progress', research: 'not-started', constitution: 'not-started', design: 'not-started', apply: 'not-started'
};

/** The step states with `entities` not started, in the order the steps are walked. */
function stepStatesWalkingEntitiesOf(stepStates: Readonly<PipelineSetupStepStates>): PipelineSetupStepStates {
  const {
    agent, billing, research, constitution, design, apply
  } = stepStates;
  return {
    agent, billing, research, entities: 'not-started', constitution, design, apply
  };
}

/** Research is still the current step: a first setup opens there, and the agent and billing reopen before it. */
function researchIsCurrent(setup: Readonly<PipelineSetup>): boolean {
  return setup.currentStep === 'agent' || setup.currentStep === 'billing' || setup.currentStep === 'research';
}

/** The agent's program as a log record names it: `machine`, or the pinned path. */
function programWordOf(agent: Readonly<PipelineAgent>): string {
  return 'pinned' in agent.program ? agent.program.pinned : 'machine';
}

/** The steps the record walks, in order: `entities` only while its step states hold it. */
function walkedStepsOf(setup: Readonly<PipelineSetup>): PipelineSetupStep[] {
  return PIPELINE_SETUP_STEPS.filter((step) => step !== 'entities' || setup.stepStates.entities !== undefined);
}

/** An update of a stored pipeline over entities walks the `entities` step, done like every step before Apply. */
function updateStepStatesOf(stored: Readonly<Pipeline> | null): PipelineSetupStepStates {
  return stored?.entities === undefined ? { ...UPDATE_STEP_STATES } : { ...UPDATE_STEP_STATES, entities: 'done' };
}

/** The billing as the record keeps it: only one of the ways the agent's vendor bills, refused `billing-not-offered` otherwise. */
function offeredBillingCopyOf(setupId: string | null, billing: PipelineBilling, agent: Readonly<PipelineAgent>, offeredBillingModesOf: OfferedBillingModesOf): PipelineBilling {
  if (!offeredBillingModesOf(agent.vendor).includes(billing.mode)) {
    throw new BoardRefusal({
      reason: 'billing-not-offered', setupId, vendor: agent.vendor, mode: billing.mode
    });
  }
  return PipelineSetupUtil.billingCopyOf(billing);
}

export class PipelineSetups {
  constructor(
    private readonly records: BoardRecords,
    private readonly setupRecord: PipelineSetupRecord,
    private readonly trackerChanges: TrackerChanges,
    private readonly jobRules: Jobs,
  ) {}

  /**
   * Refuses `setup-in-progress` beside an open record. A first setup starts with its agent: it opens at the billing step, or, started with
   * one of the agent's ways to bill too, at the research; an update or advise record starts from the stored pipeline at the design.
   */
  openSetup(opening: PipelineSetupOpening, at: string): PipelineSetupChanged {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.problem });
    if (reading.verdict === 'readable') throw new BoardRefusal({ reason: 'setup-in-progress', setupId: reading.setup.setupId });
    const stored = this.records.pipeline;
    if (opening.mode !== 'setup' && stored === null) throw new BoardRefusal({ reason: 'no-pipeline-to-update', mode: opening.mode });

    const isUpdate = opening.mode !== 'setup';
    const opensAtBilling = !isUpdate && opening.billing === null;
    const stepStates = isUpdate ? updateStepStatesOf(stored) : { ...opensAtBilling ? BILLING_STEP_STATES : FIRST_SETUP_STEP_STATES };
    // The billing is judged before the number is taken, so a refused start takes no setup id.
    const billing = this.openingBillingOf(`${SETUP_ID_PREFIX}${this.records.progress.nextSetupId ?? FIRST_SETUP_NUMBER}`, opening);
    const setupId = `${SETUP_ID_PREFIX}${this.takeNextSetupNumber()}`;
    const setup: PipelineSetup = {
      formatVersion:              PIPELINE_SETUP_FORMAT_VERSION,
      setupId,
      mode:                       opening.mode,
      baseContentHash:            isUpdate && stored !== null ? PipelineUtil.contentHashOf(stored) : null,
      stepStates,
      currentStep:                isUpdate ? 'design' : opensAtBilling ? 'billing' : 'research',
      billing,
      agent:                      opening.agent === null ? null : PipelineSetupUtil.agentCopyOf(opening.agent),
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
    this.setupRecord.store(setup);
    const fields = { mode: setup.mode, replacesUnreadablePipeline: setup.replacesUnreadablePipeline };
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-opened', setupId: setup.setupId, fields }, at)], setup };
  }

  /**
   * One of the ways the record's agent bills: refused `setup-billing-before-agent` while the record names no agent, and `billing-not-offered`
   * for a way its vendor does not bill. A change never reopens a step.
   */
  setSetupBilling(setupId: string, billing: PipelineBilling, offeredBillingModesOf: OfferedBillingModesOf, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    if (setup.agent === null) throw new BoardRefusal({ reason: 'setup-billing-before-agent', setupId });
    const kept = offeredBillingCopyOf(setupId, billing, setup.agent, offeredBillingModesOf);
    setup.billing = kept;
    this.setupRecord.store(setup);
    const fields = kept.mode === 'api' && kept.maxBudgetUsd !== undefined ? { mode: kept.mode, maxBudgetUsd: kept.maxBudgetUsd } : { mode: kept.mode };
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-billing-set', setupId, fields }, at)], setup };
  }

  /** The record's agent; every launch its earlier program refused is tried again. */
  setSetupAgent(setupId: string, agent: PipelineAgent, offeredBillingModesOf: OfferedBillingModesOf, at: string): PipelineSetupChanged {
    const changed = this.recordSetupAgent(setupId, agent, offeredBillingModesOf, at);
    return { setup: changed.setup, logged: [...changed.logged, ...this.jobRules.retryNotLaunched(at).logged] };
  }

  /**
   * The agent the record's pipeline agent runs on and Apply stores. A change keeps the billing its new vendor also bills by; otherwise the
   * billing is asked again (`billingAskedAgainRecords`).
   */
  private recordSetupAgent(setupId: string, agent: PipelineAgent, offeredBillingModesOf: OfferedBillingModesOf, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    setup.agent = PipelineSetupUtil.agentCopyOf(agent);
    this.setupRecord.store(setup);
    const fields = { vendor: agent.vendor, program: programWordOf(agent) };
    const agentSet = this.records.logger.log({ kind: 'pipeline-setup-agent-set', setupId, fields }, at);
    return { logged: [agentSet, ...this.billingAskedAgainRecords(setup, offeredBillingModesOf, at)], setup };
  }

  /**
   * The billing a change of the forge's agent stores with it: the one sent, else none, the stored one kept. Refused `billing-not-offered`
   * when the billing that would stand is not one of the new vendor's ways: the one sent, else the stored pipeline's and an open update or
   * advise record's, which has no billing step to ask it again.
   */
  agentChangeBillingOf(agent: PipelineAgent, billing: PipelineBilling | undefined, offeredBillingModesOf: OfferedBillingModesOf): PipelineBilling | undefined {
    if (billing !== undefined) return offeredBillingCopyOf(null, billing, agent, offeredBillingModesOf);
    const storedBilling = this.records.pipeline?.billing;
    if (storedBilling !== undefined) offeredBillingCopyOf(null, storedBilling, agent, offeredBillingModesOf);
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'readable' && reading.setup.mode !== 'setup' && reading.setup.billing !== null) {
      offeredBillingCopyOf(reading.setup.setupId, reading.setup.billing, agent, offeredBillingModesOf);
    }
    return undefined;
  }

  /**
   * The open record's agent follows a change of the forge's agent, so its pipeline agent runs on the same one; the agent's change is not
   * logged twice. A first setup's billing is asked again as `setSetupAgent` asks it; an update or advise record, whose view has no billing
   * step, takes the billing the change stored with the agent, if any, which `agentChangeBillingOf` judged.
   */
  followAgentChange(agent: PipelineAgent, billing: PipelineBilling | undefined, offeredBillingModesOf: OfferedBillingModesOf, at: string): LogRecord[] {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict !== 'readable') return [];
    reading.setup.agent = PipelineSetupUtil.agentCopyOf(agent);
    if (reading.setup.mode !== 'setup' && billing !== undefined) reading.setup.billing = PipelineSetupUtil.billingCopyOf(billing);
    this.setupRecord.store(reading.setup);
    return reading.setup.mode === 'setup' ? this.billingAskedAgainRecords(reading.setup, offeredBillingModesOf, at) : [];
  }

  /** The billing a first setup's agent change sends with it, judged before the agent changes, so a refusal leaves the record as it was. */
  requireSetupBillingOffered(setupId: string, agent: PipelineAgent, billing: PipelineBilling, offeredBillingModesOf: OfferedBillingModesOf): void {
    offeredBillingCopyOf(setupId, billing, agent, offeredBillingModesOf);
  }

  /** The open record's draft follows a change of the forge's tools, so its Apply never writes the older list back; nothing is logged twice. */
  followToolsChange(tools: readonly PipelineTool[] | null): void {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict !== 'readable' || reading.setup.draft === null) return;
    if (tools === null) delete reading.setup.draft.tools;
    else reading.setup.draft.tools = tools.map((tool) => ({ name: tool.name, path: tool.path }));
    this.setupRecord.store(reading.setup);
  }

  /**
   * User's Continue on the current step: it is done, and the next step opens; on a step that needs a recheck, this is its only exit. It
   * waits while the draft's entities hold a refusal. The agent step is done only once the record holds an agent, and billing once it holds
   * a billing.
   */
  continueSetupStep(setupId: string, step: PipelineSetupStep, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    if (step === 'apply') throw new BoardRefusal({ reason: 'setup-step-not-continued', setupId, step });
    if (setup.currentStep !== step) throw new BoardRefusal({
      reason: 'setup-step-not-current', setupId, step, currentStep: setup.currentStep
    });
    PipelineSetupUtil.refuseStandingEntityRefusals(setup);
    if (step === 'agent' && setup.agent === null) throw new BoardRefusal({ reason: 'setup-agent-not-chosen', setupId });
    if (step === 'billing' && setup.billing === null) throw new BoardRefusal({ reason: 'setup-billing-not-chosen', setupId });

    const walkedSteps = walkedStepsOf(setup);
    const nextStep    = walkedSteps[walkedSteps.indexOf(step) + 1] ?? 'apply';
    setup.stepStates[step] = 'done';
    if (setup.stepStates[nextStep] === 'not-started') setup.stepStates[nextStep] = 'in-progress';
    setup.currentStep     = nextStep;
    setup.readyToContinue = setup.readyToContinue.filter((readyStep) => readyStep !== step);
    this.setupRecord.store(setup);
    return { logged: [this.setupRecord.stepMovedRecord(setup, step, [], at)], setup };
  }

  /**
   * The agent's suggestion that User may continue the current step; it never moves a step. Saying it again of a step already suggested
   * changes nothing and logs nothing.
   */
  suggestSetupStepReady(setupId: string, step: SetupQuestionStep, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    if (setup.currentStep !== step) throw new BoardRefusal({
      reason: 'setup-step-not-current', setupId, step, currentStep: setup.currentStep
    });
    if (setup.readyToContinue.includes(step)) return { logged: [], setup };
    setup.readyToContinue.push(step);
    this.setupRecord.store(setup);
    return { logged: [this.records.logger.log({ kind: 'pipeline-step-ready-suggested', setupId, fields: { step } }, at)], setup };
  }

  /** Back to a step already reached: it is in progress again, and every later done step needs a recheck, never a fresh start. */
  reopenSetupStep(setupId: string, step: PipelineSetupStep, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    return { logged: this.setupRecord.reopenedStepRecords(setup, step, at), setup };
  }

  /** The snapshot moved to main's new tip: the findings that name a changed path, and the research step, need a recheck. */
  resumeSetup(setupId: string, snapshotCommit: string, changedPaths: readonly string[], at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    setup.snapshotCommit = snapshotCommit;
    for (const finding of setup.findings) {
      if (finding.sourcePaths.some((path) => changedPaths.includes(path))) finding.needsRecheck = true;
    }
    if (setup.stepStates.research === 'done') setup.stepStates.research = 'needs-recheck';
    this.setupRecord.store(setup);
    const fields = { snapshotCommit, changedPaths: [...changedPaths] };
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-resumed', setupId, fields }, at)], setup };
  }

  /**
   * The pipeline agent that serves the record, or with an entity key that entity's part of it, and the main commit the record's snapshot
   * holds when none is set yet. It logs nothing: the job's launch is logged.
   */
  attachSetupAgent(setupId: string, agentJobId: string, snapshotCommit: string | null, entityKey?: EntityKey): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    if (entityKey === undefined) setup.agentJobId = agentJobId;
    else this.setupRecord.entityPartOf(setup, entityKey).agentJobId = agentJobId;
    setup.snapshotCommit ??= snapshotCommit;
    this.setupRecord.store(setup);
    return { logged: [], setup };
  }

  /** An update or advise opened at an entity: the record names that level and holds the entity's part, empty until a move records into it. */
  openAtEntity(setupId: string, entityKey: EntityKey): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    setup.openedAtEntity = entityKey;
    this.setupRecord.entityPartOf(setup, entityKey);
    this.setupRecord.store(setup);
    return { logged: [], setup };
  }

  /** A turn end's Customs refusal: Apply refuses until a resume checks the snapshot out clean again. It is logged also while an Apply waits. */
  recordSetupSnapshotTouched(setupId: string, refusal: SnapshotRefusal, at: string): PipelineSetupChanged {
    const setup  = this.setupRecord.requireOpenSetup(setupId);
    const fields = { check: refusal.check, reason: refusal.reason };
    return { logged: [this.records.logger.log({ kind: 'pipeline-snapshot-touched', setupId, fields }, at)], setup };
  }

  /** A finding of the forge's part of the record or, with an entity key, of that entity's part; the finding numbers are the record's own. */
  recordFinding(setupId: string, recording: ResearchFindingRecording, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup     = this.setupRecord.requireMovableSetup(setupId);
    const findingId = `${FINDING_ID_PREFIX}${setup.nextNumbers.finding}`;
    const findings  = entityKey === undefined ? setup.findings : this.setupRecord.entityPartOf(setup, entityKey).findings;
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
    this.setupRecord.store(setup);
    const fields = { findingId, topic: recording.topic };
    return { logged: [this.records.logger.log({ kind: 'pipeline-finding-recorded', setupId, fields }, at)], setup };
  }

  /**
   * A first setup walks the `entities` step once the forge's research found several stand-alone codebases, while research is the current
   * step: the step proposes monorepo mode, and User can decline it there. Every other record stays as it is and logs nothing.
   */
  walkEntitiesStepAfterLayout(setupId: string, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    const layoutFindingCount = setup.findings.filter((finding) => finding.topic === 'layout').length;
    const walksTheStep = setup.mode === 'setup' && setup.stepStates.entities === undefined && researchIsCurrent(setup)
      && layoutFindingCount >= LAYOUT_FINDINGS_PROPOSING_ENTITIES;
    if (!walksTheStep) return { logged: [], setup };
    setup.stepStates = stepStatesWalkingEntitiesOf(setup.stepStates);
    this.setupRecord.store(setup);
    return { logged: [this.setupRecord.stepMovedRecord(setup, 'entities', [], at)], setup };
  }

  /**
   * Two to four options and a recommendation inside them: one, unless the question takes several. With an entity key the question is that
   * entity's; the question numbers are the record's own.
   */
  askSetupQuestion(setupId: string, asking: SetupQuestionAsking, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup       = this.setupRecord.requireMovableSetup(setupId);
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
    (entityKey === undefined ? setup.questions : this.setupRecord.entityPartOf(setup, entityKey).questions).push(question);
    setup.nextNumbers.question += 1;
    this.setupRecord.store(setup);
    const fields = { questionId, step: asking.step };
    return { logged: [this.records.logger.log({ kind: 'pipeline-question-asked', setupId, fields }, at)], setup };
  }

  /**
   * User's answer, to a question of the forge or of any entity; answering again replaces it. An answer at an earlier step of a first setup
   * reopens that step.
   */
  answerSetupQuestion(setupId: string, questionId: string, reply: SetupQuestionReply, at: string): PipelineSetupChanged {
    const setup    = this.setupRecord.requireMovableSetup(setupId);
    const question = PipelineSetupUtil.everyQuestionOf(setup).find((candidate) => candidate.questionId === questionId);
    if (question === undefined) throw new BoardRefusal({ reason: 'unknown-setup-question', setupId, questionId });
    const replyIsEmpty = 'letters' in reply ? reply.letters.length === 0 : reply.text.trim() === '';
    if (replyIsEmpty) throw new BoardRefusal({ reason: 'empty-setup-answer', setupId, questionId });
    if ('letters' in reply) this.refuseLettersOutside(reply.letters, question.options.map((option) => option.letter), question.multiple);

    const reopened = this.setupRecord.userEditReopenRecords(setup, question.step, at);
    question.answer = 'letters' in reply ? { letters: [...new Set(reply.letters)], answeredAt: at } : { text: reply.text, answeredAt: at };
    this.setupRecord.store(setup);
    const answer = 'letters' in reply ? [...new Set(reply.letters)].join(',') : reply.text;
    const fields = { questionId, answer };
    return { logged: [...reopened, this.records.logger.log({ kind: 'pipeline-question-answered', setupId, fields }, at)], setup };
  }

  /**
   * Removes the record; the agent's end and the snapshot's removal are Hephaestus's, after the hold. A record that cannot be read is removed
   * whatever id the move names, since its own id cannot be read: starting over is the one way out of an unreadable record.
   */
  /**
   * The start over a new start runs first when the stored record cannot be read, so an old format never blocks a setup: `null` while the
   * record reads or none is stored. The unreadable record is the newest one this board numbered.
   */
  discardUnreadableSetup(at: string): PipelineSetupStartedOver | null {
    if (this.records.pipelineSetupReading.verdict !== 'malformed') return null;
    const newestNumber = Math.max(FIRST_SETUP_NUMBER, (this.records.progress.nextSetupId ?? FIRST_SETUP_NUMBER) - 1);
    return this.startOverSetup(`${SETUP_ID_PREFIX}${newestNumber}`, at);
  }

  startOverSetup(setupId: string, at: string): PipelineSetupStartedOver {
    const discarded = this.records.pipelineSetupReading.verdict === 'malformed' ? null : this.setupRecord.requireMovableSetup(setupId);
    this.records.pipelineSetupReading = { verdict: 'absent' };
    this.records.pipelineSetupChanged = true;
    return { logged: [this.records.logger.log({ kind: 'pipeline-setup-discarded', setupId, fields: {} }, at)], setup: discarded };
  }

  /**
   * The forge's agent: the stored pipeline's, and the open setup record's with it, so its pipeline agent runs on the same one. A billing
   * sent with it is stored with it; with none, a stored billing the new vendor does not bill by is refused `billing-not-offered`, since
   * the billing is User's choice. A first setup's record asks its billing again instead. With no stored pipeline an open record takes the
   * agent alone; with neither it is refused `agent-without-pipeline`. Every launch it refused is tried again.
   */
  setAgent(agent: PipelineAgent, billing: PipelineBilling | undefined, offeredBillingModesOf: OfferedBillingModesOf, at: string): Logged {
    const setup = this.setupRecord.openSetupRecord();
    if (this.records.pipeline === null && setup !== null) {
      if (billing !== undefined) this.requireSetupBillingOffered(setup.setupId, agent, billing, offeredBillingModesOf);
      const changed = this.recordSetupAgent(setup.setupId, agent, offeredBillingModesOf, at);
      const billed = billing === undefined ? [] : this.setSetupBilling(setup.setupId, billing, offeredBillingModesOf, at).logged;
      return { logged: [...changed.logged, ...billed, ...this.jobRules.retryNotLaunched(at).logged] };
    }
    const keptBilling = this.records.pipeline === null ? undefined : this.agentChangeBillingOf(agent, billing, offeredBillingModesOf);
    const changed = this.trackerChanges.setAgent(agent, keptBilling, at);
    const followed = this.followAgentChange(agent, keptBilling, offeredBillingModesOf, at);
    return { logged: [...changed.logged, ...followed, ...this.jobRules.retryNotLaunched(at).logged] };
  }

  /** A first setup resumes only once billing is chosen, and no record resumes while its Apply waits to commit. */
  requireResumableSetup(setupId: string): Readonly<PipelineSetup> {
    const setup = this.setupRecord.openSetupOf(setupId);
    if (setup.mode === 'setup' && setup.billing === null) throw new BoardRefusal({ reason: 'setup-resume-before-billing', setupId });
    const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (setup.applyRequest !== null && pendingStates.includes(setup.applyRequest.state)) throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId });
    return setup;
  }

  /** A pipeline-agent level named by an entity must be one `pipeline`, the stored one or the open draft, holds; the forge always is. */
  refuseASetupLevelThePipelineLacks(pipeline: Readonly<Pipeline> | null, entityKey: EntityKey | undefined): void {
    if (entityKey === undefined) return;
    const entities = pipeline?.entities ?? {};
    if (!Object.hasOwn(entities, entityKey)) throw new BoardRefusal({ reason: 'setup-entity-unknown', entity: entityKey, entityKeys: Object.keys(entities) });
  }

  private openingConstitutionOf(opening: PipelineSetupOpening): ConstitutionDraft | null {
    const { mainConstitution } = opening;
    if (mainConstitution === null && opening.mode === 'setup') return null;
    const markdown = mainConstitution?.markdown ?? '';
    return {
      markdown,
      annotations: PipelineSetupUtil.reanchoredAnnotationsOf(markdown, opening.storedAnnotations),
      draftedFrom: { ...DEFAULT_CONSTITUTION_SOURCES },
      baseBlob:    mainConstitution?.blob ?? null,
      revision:    0,
    };
  }

  /** A first setup's billing is one of the ways its agent bills, or none yet; an update or advise record keeps the stored one as it is. */
  private openingBillingOf(setupId: string, opening: PipelineSetupOpening): PipelineBilling | null {
    if (opening.billing === null) return null;
    if (opening.mode !== 'setup') return PipelineSetupUtil.billingCopyOf(opening.billing);
    return offeredBillingCopyOf(setupId, opening.billing, opening.agent, opening.offeredBillingModesOf);
  }

  /**
   * A billing the record's new agent's vendor does not bill by is cleared, and the billing step is asked again: reopened when the record
   * stands past it, every later done step then needing a recheck. Its Continue waits for a new billing. A billing it bills by is kept, cap
   * and all.
   */
  private billingAskedAgainRecords(setup: PipelineSetup, offeredBillingModesOf: OfferedBillingModesOf, at: string): LogRecord[] {
    const { agent, billing } = setup;
    if (agent === null || billing === null || offeredBillingModesOf(agent.vendor).includes(billing.mode)) return [];
    setup.billing = null;
    this.setupRecord.store(setup);
    const billingState = PipelineSetupUtil.stepStateOf(setup, 'billing');
    const standsPastBilling = PipelineSetupUtil.stepIndexOf(setup.currentStep) > PipelineSetupUtil.stepIndexOf('billing');
    return standsPastBilling && billingState !== 'not-started' ? this.setupRecord.reopenedStepRecords(setup, 'billing', at) : [];
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
