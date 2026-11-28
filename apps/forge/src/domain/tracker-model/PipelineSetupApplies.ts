/**
 * The setup record's Apply: the request checks the record and, while main lacks the draft's constitution, waits for its commit; the finish
 * stores pipeline, sources and settings, logs and closes the record, idempotent by setup and draft revision so a retry never refuses its own
 * pipeline. A draft over entities has no forge constitution: each entity's drafted text is committed, and one without adopts main's file.
 */
import type { Logged, PipelineApplyChanged, PipelineSetupChanged } from './@types/BoardChanges.ts';
import type { EntityKey, Pipeline }                                from './@types/Pipeline.ts';
import type {
  StoredConstitutionSources,
  ApplyFinishing,
  ApplyHolding,
  ApplyMainReading,
  ApplyRefusal,
  ApplyRequesting,
  ConstitutionDraft,
  EntityChangeRefusalReason,
  MainConstitution,
  PipelineSetup
} from './@types/PipelineSetup.ts';
import type { TicketStatus }                     from './@types/Ticket.ts';
import type { BoardRecords }                     from './BoardRecords.ts';
import { BoardRefusal, type BoardRefusalDetail } from './BoardRefusal.ts';
import type { Decisions }                        from './Decisions.ts';
import type { JobControls }                      from './JobControls.ts';
import type { Jobs }                             from './Jobs.ts';
import type { PipelineSetupRecord }              from './PipelineSetupRecord.ts';
import type { TrackerChanges }                   from './TrackerChanges.ts';
import { PIPELINE_APPLIED_DECISION_REASON }      from './constants/DecisionAndIncidentVocabulary.ts';
import {
  ENTITY_CHANGE_REFUSAL_REASONS,
  INTERRUPTED_APPLY_REASON,
  PENDING_APPLY_REQUEST_STATES,
  PIPELINE_SETUP_STEPS
} from './constants/PipelineSetupVocabulary.ts';
import { PipelineChangeUtil } from './utils/PipelineChangeUtil.ts';
import { PipelineSetupUtil }  from './utils/PipelineSetupUtil.ts';
import { PipelineUtil }       from './utils/PipelineUtil.ts';

function isEntityChangeRefusalReason(reason: string): reason is EntityChangeRefusalReason {
  const reasons: readonly string[] = ENTITY_CHANGE_REFUSAL_REASONS;
  return reasons.includes(reason);
}

/** A draft's text, or `null` when it holds none, which main matches only by holding no file either. */
function textOfDraft(constitution: Readonly<ConstitutionDraft> | null | undefined): string | null {
  const markdown = constitution?.markdown ?? '';
  return markdown === '' ? null : markdown;
}

/** The constitution text the draft holds, or `null` when it holds none, which main matches only by holding no file either. */
function draftConstitutionTextOf(setup: Readonly<PipelineSetup>): string | null {
  return textOfDraft(setup.constitution);
}

function mainHoldsTheDraftText(setup: Readonly<PipelineSetup>, mainConstitution: MainConstitution | null): boolean {
  return draftConstitutionTextOf(setup) === (mainConstitution?.markdown ?? null);
}

/** A draft over entities gives the forge no constitution of its own: each entity has one. */
function draftHasEntities(setup: Readonly<PipelineSetup>): boolean {
  return setup.draft?.entities !== undefined;
}

function entityDraftOf(setup: Readonly<PipelineSetup>, entityKey: EntityKey): ConstitutionDraft | null {
  const parts = setup.entities ?? {};
  return Object.hasOwn(parts, entityKey) ? parts[entityKey]?.constitution ?? null : null;
}

/** The entity's file on main as the caller read it; `null` when main holds none or nothing was read. */
function entityMainConstitutionOf(reading: ApplyMainReading, entityKey: EntityKey): MainConstitution | null {
  const readings = reading.entityConstitutions ?? {};
  return Object.hasOwn(readings, entityKey) ? readings[entityKey] ?? null : null;
}

/** The entities of the draft whose drafted text main lacks, in the draft's order: the constitutions the commit writes. */
function entityKeysMainLacksOf(setup: Readonly<PipelineSetup>, reading: ApplyMainReading): EntityKey[] {
  return Object.keys(setup.draft?.entities ?? {}).filter((entityKey) => {
    const text = textOfDraft(entityDraftOf(setup, entityKey));
    return text !== null && text !== (entityMainConstitutionOf(reading, entityKey)?.markdown ?? null);
  });
}

/** Main holds every text the Apply writes: the forge's own on a draft without entities, each entity's draft on a draft over them. */
function mainHoldsEveryDraftText(setup: Readonly<PipelineSetup>, reading: ApplyMainReading): boolean {
  if (!draftHasEntities(setup)) return mainHoldsTheDraftText(setup, reading.mainConstitution);
  return entityKeysMainLacksOf(setup, reading).length === 0;
}

/** A ticket in these statuses names its entity until it lands or is abandoned. */
const FINISHED_TICKET_STATUSES: ReadonlySet<TicketStatus> = new Set(['delivered', 'abandoned']);

/** A ticket in these statuses has a job or a landing under the stored pipeline, which entities would change under it. */
const IN_FLIGHT_TICKET_STATUSES: ReadonlySet<TicketStatus> = new Set(['in-progress', 'in-review', 'reviewed']);

export class PipelineSetupApplies {
  constructor(
    private readonly records: BoardRecords,
    private readonly setupRecord: PipelineSetupRecord,
    private readonly trackerChanges: TrackerChanges,
    private readonly decisionRules: Decisions,
    private readonly jobRules: Jobs,
    private readonly jobControls: JobControls,
  ) {}

  /**
   * Stage 1. A revision already waiting or already applied answers as it stands; otherwise `applyRequestVerdictOf` refuses what blocks it.
   * When main holds every draft's text stage 2 runs at once, else the request waits for the constitution commit and nothing else is written.
   * Each entity's draft takes main's blob of its file as its base, which its commit must find.
   */
  requestApply(setupId: string, requesting: ApplyRequesting, at: string): PipelineApplyChanged {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.problem });
    if ((reading.verdict === 'absent' || reading.setup.setupId !== setupId) && this.revisionWasApplied(setupId, requesting.draftRevision)) {
      return { logged: [], outcome: 'already-applied', setup: null };
    }
    const setup = this.setupRecord.requireOpenSetup(setupId);
    if (this.applyRequestVerdictOf(setup, requesting) === 'committing') return { logged: [], outcome: 'committing', setup };
    if (mainHoldsEveryDraftText(setup, requesting)) return this.finishApply(setupId, { ...requesting, constitutionCommit: null }, at);

    for (const entityKey of Object.keys(setup.draft?.entities ?? {})) {
      const draft = entityDraftOf(setup, entityKey);
      if (textOfDraft(draft) !== null && draft !== null) draft.baseBlob = entityMainConstitutionOf(requesting, entityKey)?.blob ?? null;
    }
    setup.applyRequest = {
      draftRevision: requesting.draftRevision, resumesBoard: requesting.resumesBoard, commitJobId: null, state: 'committing', reason: null
    };
    this.setupRecord.store(setup);
    const fields = { revision: requesting.draftRevision, resumesBoard: requesting.resumesBoard };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-requested', setupId, fields }, at)], outcome: 'committing', setup };
  }

  /**
   * The refusal a request to apply the open record's current draft meets now, `null` when it would proceed or already waits: stage 1's
   * checks against `reading`, main's texts as the caller read them, shared with `requestApply`.
   */
  applyRefusalOf(setupId: string, reading: ApplyMainReading): BoardRefusalDetail | null {
    const setup = this.setupRecord.openSetupRecord();
    if (setup?.setupId !== setupId) return null;
    try {
      this.applyRequestVerdictOf(setup, { ...reading, draftRevision: setup.draftRevision });
      return null;
    } catch (refusal) {
      if (refusal instanceof BoardRefusal) return refusal.detail;
      throw refusal;
    }
  }

  /**
   * Stage 2, in the hold that found main holding the draft's text. A pipeline already stored from this draft is no move of anyone else's, so a
   * retry finishes the rest. The entity refusals run again, since a ticket can start or take an entity while the request waits. The first
   * Apply that stores entities names the committed tickets without one, which the product owner then gives one.
   */
  finishApply(setupId: string, finishing: ApplyFinishing, at: string): PipelineApplyChanged {
    const setup = this.setupRecord.requireOpenSetup(setupId);
    if (finishing.draftRevision !== setup.draftRevision) {
      throw new BoardRefusal({
        reason: 'pipeline-draft-stale', setupId, revision: finishing.draftRevision, currentRevision: setup.draftRevision
      });
    }
    this.refuseTextMissingOnMain(setup, finishing);
    this.refuseEntityChanges(setup);
    const applied = this.appliedPipelineOf(setup, finishing);
    this.refuseMovedPipeline(setup, applied);

    const base   = this.records.pipeline ?? PipelineUtil.minimalPipelineOf();
    const forgeTextChanged = !draftHasEntities(setup) && (setup.constitution?.baseBlob ?? null) !== (finishing.mainConstitution?.blob ?? null);
    const fields = PipelineChangeUtil.changedFieldNamesOf(base, applied, forgeTextChanged);
    const ticketsAwaitingEntity = base.entities === undefined && applied.entities !== undefined ? this.committedTicketIdsWithoutEntity() : [];
    this.trackerChanges.applyPipeline(applied);
    if (!draftHasEntities(setup)) this.storeConstitutionSources(setup, finishing.mainConstitution);
    const logged = this.decisionRules.decisions().filter((decision) => decision.kind === 'checks-not-set')
      .flatMap((decision) => this.decisionRules.withdrawDecision(decision.id, PIPELINE_APPLIED_DECISION_REASON, at).logged);
    if (finishing.resumesBoard) logged.push(...this.trackerChanges.setHephaestusState('running', at).logged);
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
    return {
      logged, outcome: 'applied', setup, ...(ticketsAwaitingEntity.length === 0 ? {} : { ticketsAwaitingEntity })
    };
  }

  /**
   * An open record whose draft, as applied, is already the stored pipeline while the record's base is not: an Apply stored it and was cut
   * short before its close. Hephaestus's start finishes it, resuming the board only as a stored request asked.
   */
  finishHalfAppliedSetup(reading: ApplyMainReading, at: string): PipelineApplyChanged | null {
    const setup  = this.setupRecord.openSetupRecord();
    const stored = this.records.pipeline;
    if (setup === null || stored === null || !mainHoldsEveryDraftText(setup, reading)) return null;
    const storedHash = PipelineUtil.contentHashOf(stored);
    if (storedHash === setup.baseContentHash || storedHash !== PipelineUtil.contentHashOf(this.appliedPipelineOf(setup, reading))) return null;
    return this.finishApply(setup.setupId, {
      ...reading, draftRevision: setup.draftRevision, resumesBoard: setup.applyRequest?.resumesBoard ?? false, constitutionCommit: null
    }, at);
  }

  /**
   * An applied record leaves its pipeline agents nothing to serve: each live one, the forge's and every entity's, is stopped, as a start
   * over stops them, and Hephaestus removes the snapshot once no pipeline agent is left. Stage 1 that only waits for the commit stops
   * nothing. The first Apply over entities starts the product owner that gives the committed tickets without an entity one, in the same hold.
   */
  withTheAppliedSetupAgentStopped(changed: PipelineApplyChanged, reading: ApplyMainReading, at: string): PipelineApplyChanged {
    const setup = changed.outcome === 'applied' ? changed.setup : null;
    if (setup === null) return changed;
    const agentJobIds = [setup.agentJobId, ...Object.values(setup.entities ?? {}).map((entityPart) => entityPart.agentJobId)];
    const stopped = agentJobIds.flatMap((agentJobId) => {
      const agent = agentJobId === null ? undefined : this.jobRules.jobById(agentJobId);
      return agent === undefined || agent.state === 'stopping' ? [] : this.jobControls.requestJobStop(agent.id, 'stop', at).logged;
    });
    const ticketIds = changed.ticketsAwaitingEntity ?? [];
    const requestOf = reading.entityAssignmentRequestOf;
    const assignment = ticketIds.length === 0 || requestOf === undefined ? [] : this.jobControls.startEntityAssignment(requestOf(ticketIds), ticketIds, at).logged;
    const added = [...stopped, ...assignment];
    return added.length === 0 ? changed : { ...changed, logged: [...changed.logged, ...added] };
  }

  /** The constitution commit waits, as the Airlock found main: the request stays, and so does every refusal of the other moves. */
  holdApply(setupId: string, holding: ApplyHolding, at: string): PipelineSetupChanged {
    const setup   = this.setupRecord.requireOpenSetup(setupId);
    const request = this.requirePendingRequest(setup);
    setup.applyRequest = {
      ...request, commitJobId: null, state: 'held', reason: holding.reason
    };
    this.setupRecord.store(setup);
    const fields = { reason: holding.reason, blockingFiles: [...holding.blockingFiles] };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-held', setupId, fields }, at)], setup };
  }

  /** The constitution commit cannot be made: the request stays, refused, and the record is editable again. */
  refuseApply(setupId: string, refusal: ApplyRefusal, at: string): PipelineSetupChanged {
    const setup   = this.setupRecord.requireOpenSetup(setupId);
    const request = this.requirePendingRequest(setup);
    setup.applyRequest = {
      ...request, commitJobId: null, state: 'refused', reason: refusal.reason
    };
    this.setupRecord.store(setup);
    const fields = { reason: refusal.reason, gitFailure: refusal.gitFailure };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-refused', setupId, fields }, at)], setup };
  }

  /** The record's request while it waits for its commit; refuses `no-setup-open` or `no-apply-pending`. */
  requirePendingApply(setupId: string): Readonly<NonNullable<PipelineSetup['applyRequest']>> {
    return this.requirePendingRequest(this.setupRecord.requireOpenSetup(setupId));
  }

  /** The Airlock's constitution commit job takes the waiting request: it is committing again, under that job. */
  attachApplyCommitJob(setupId: string, commitJobId: string): PipelineSetupChanged {
    const setup   = this.setupRecord.requireOpenSetup(setupId);
    const request = this.requirePendingRequest(setup);
    setup.applyRequest = {
      ...request, commitJobId, state: 'committing', reason: null
    };
    this.setupRecord.store(setup);
    return { logged: [], setup };
  }

  /**
   * User's `resume --all`: an Apply a start held `interrupted` waits for its constitution commit again, logged as when it was asked; with
   * no such request nothing changes.
   */
  liftInterruptedApply(at: string): Logged {
    const setup   = this.setupRecord.openSetupRecord();
    const request = setup?.applyRequest ?? null;
    if (setup === null || request === null || request.state !== 'held' || request.reason !== INTERRUPTED_APPLY_REASON) return { logged: [] };
    setup.applyRequest = { ...request, state: 'committing', reason: null };
    this.setupRecord.store(setup);
    const fields = { revision: request.draftRevision, resumesBoard: request.resumesBoard };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-requested', setupId: setup.setupId, fields }, at)] };
  }

  /** A constitution commit job that ended without a landing leaves the request committing, for the next job; another job's request stays. */
  detachApplyCommitJob(commitJobId: string): void {
    const setup = this.setupRecord.openSetupRecord();
    if (setup?.applyRequest?.commitJobId !== commitJobId) return;
    setup.applyRequest = { ...setup.applyRequest, commitJobId: null };
    this.setupRecord.store(setup);
  }

  /** Whether the stored pipeline is neither the record's base nor its draft as applied on what main holds: stage 2 would refuse it. */
  storedPipelineMovedSince(setupId: string, reading: ApplyMainReading): boolean {
    const setup  = this.setupRecord.requireOpenSetup(setupId);
    const stored = this.records.pipeline;
    const contentHash = stored === null ? null : PipelineUtil.contentHashOf(stored);
    return contentHash !== setup.baseContentHash && contentHash !== PipelineUtil.contentHashOf(this.appliedPipelineOf(setup, reading));
  }

  /** The entity refusal stage 2 would give, as the reason its request is refused with; `null` when it gives neither. */
  entityChangeRefusalOf(setupId: string): EntityChangeRefusalReason | null {
    try {
      this.refuseEntityChanges(this.setupRecord.requireOpenSetup(setupId));
      return null;
    } catch (refusal) {
      if (refusal instanceof BoardRefusal && isEntityChangeRefusalReason(refusal.detail.reason)) return refusal.detail.reason;
      throw refusal;
    }
  }

  /**
   * Clears a committing, held or refused request; the record is back at the design step, in progress and editable, Apply is not reached,
   * and its pipeline is not stored.
   */
  cancelApply(setupId: string, at: string): PipelineSetupChanged {
    const setup   = this.setupRecord.requireOpenSetup(setupId);
    const request = setup.applyRequest;
    if (request === null) throw new BoardRefusal({ reason: 'no-apply-pending', setupId });
    setup.applyRequest      = null;
    setup.currentStep       = 'design';
    setup.stepStates.design = 'in-progress';
    setup.stepStates.apply  = 'not-started';
    this.setupRecord.store(setup);
    const fields = { revision: request.draftRevision, state: request.state };
    return { logged: [this.records.logger.log({ kind: 'pipeline-apply-cancelled', setupId, fields }, at)], setup };
  }

  /** The stored sources of the constitution main holds; `null` when none are stored or the file could not be read. */
  storedConstitutionSources(): Readonly<StoredConstitutionSources> | null {
    const reading = this.records.constitutionSourcesReading;
    return reading.verdict === 'readable' ? reading.sources : null;
  }

  /** What the hold writes to `constitution-sources.json`: the sources an Apply stored, or nothing. */
  constitutionSourcesWrite(): { write: 'sources'; sources: StoredConstitutionSources } | { write: 'unchanged' } {
    const reading = this.records.constitutionSourcesReading;
    if (!this.records.constitutionSourcesChanged || reading.verdict !== 'readable') return { write: 'unchanged' };
    return { write: 'sources', sources: reading.sources };
  }

  /**
   * Stage 1 of a request of `draftRevision` against main's texts: `committing` when that revision already waits, else its refusals in the
   * order a request meets them, or `proceeds`.
   */
  private applyRequestVerdictOf(setup: Readonly<PipelineSetup>, requesting: ApplyMainReading & { draftRevision: number }): 'committing' | 'proceeds' {
    const { applyRequest, setupId } = setup;
    const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (applyRequest !== null && pendingStates.includes(applyRequest.state)) {
      if (applyRequest.draftRevision === requesting.draftRevision) return 'committing';
      throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId });
    }
    this.refuseUnappliable(setup, requesting.draftRevision);
    this.refuseEntityChanges(setup);
    if (!draftHasEntities(setup)) {
      this.refuseMovedConstitution(setup, requesting.mainConstitution, mainHoldsTheDraftText(setup, requesting.mainConstitution));
    }
    this.refuseMovedPipeline(setup, this.appliedPipelineOf(setup, requesting));
    return 'proceeds';
  }

  /**
   * Stage 1's refusals that do not read main: a stale revision, an open question of the forge or of any entity, a step to recheck, a
   * touched snapshot, an entity refusal that stands.
   */
  private refuseUnappliable(setup: Readonly<PipelineSetup>, draftRevision: number): void {
    const { setupId } = setup;
    if (draftRevision !== setup.draftRevision) {
      throw new BoardRefusal({
        reason: 'pipeline-draft-stale', setupId, revision: draftRevision, currentRevision: setup.draftRevision
      });
    }
    const questionIds = PipelineSetupUtil.everyQuestionOf(setup).filter((question) => question.answer === null).map((question) => question.questionId);
    if (questionIds.length > 0) throw new BoardRefusal({ reason: 'setup-question-open', setupId, questionIds });
    const steps = PIPELINE_SETUP_STEPS.filter((step) => step !== 'apply' && setup.stepStates[step] === 'needs-recheck');
    if (steps.length > 0) throw new BoardRefusal({ reason: 'setup-step-needs-recheck', setupId, steps });
    if (this.setupRecord.setupSnapshotIsTouched(setupId)) throw new BoardRefusal({ reason: 'setup-snapshot-touched', setupId });
    PipelineSetupUtil.refuseStandingEntityRefusals(setup);
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

  /**
   * `entity-named-by-tickets`: the draft drops or renames an entity a ticket that is not delivered or abandoned names.
   * `entities-while-tickets-in-flight`: the draft turns a stored pipeline without entities into entities while a ticket is in flight.
   */
  private refuseEntityChanges(setup: Readonly<PipelineSetup>): void {
    const stored = this.records.pipeline;
    if (stored === null) return;
    const { setupId } = setup;
    const draftEntities = setup.draft?.entities;
    const openTickets = this.records.ticketRecords.map(({ frontmatter }) => frontmatter).filter((frontmatter) => !FINISHED_TICKET_STATUSES.has(frontmatter.status));
    for (const entity of Object.keys(stored.entities ?? {})) {
      if (draftEntities !== undefined && Object.hasOwn(draftEntities, entity)) continue;
      const ticketIds = openTickets.filter((frontmatter) => frontmatter.entity === entity).map((frontmatter) => frontmatter.id);
      if (ticketIds.length > 0) throw new BoardRefusal({
        reason: 'entity-named-by-tickets', setupId, entity, ticketIds
      });
    }
    if (stored.entities !== undefined || draftEntities === undefined) return;
    const ticketIds = openTickets.filter((frontmatter) => IN_FLIGHT_TICKET_STATUSES.has(frontmatter.status)).map((frontmatter) => frontmatter.id);
    if (ticketIds.length > 0) throw new BoardRefusal({ reason: 'entities-while-tickets-in-flight', setupId, ticketIds });
  }

  /** Stage 2 finds every draft's text on main: the forge's own, or each entity's, naming the first entity whose file differs. */
  private refuseTextMissingOnMain(setup: Readonly<PipelineSetup>, reading: ApplyMainReading): void {
    const { setupId } = setup;
    if (!draftHasEntities(setup)) {
      if (mainHoldsTheDraftText(setup, reading.mainConstitution)) return;
      throw new BoardRefusal({
        reason: 'constitution-moved', setupId, baseBlob: setup.constitution?.baseBlob ?? null, mainBlob: reading.mainConstitution?.blob ?? null
      });
    }
    const [entity] = entityKeysMainLacksOf(setup, reading);
    if (entity === undefined) return;
    throw new BoardRefusal({
      reason:   'constitution-moved',
      setupId,
      baseBlob: entityDraftOf(setup, entity)?.baseBlob ?? null,
      mainBlob: entityMainConstitutionOf(reading, entity)?.blob ?? null,
      entity,
    });
  }

  /** The committed tickets that name no entity, which a pipeline over entities does not build until each has one. */
  private committedTicketIdsWithoutEntity(): string[] {
    return this.records.ticketRecords
      .filter(({ frontmatter }) => frontmatter.status === 'committed' && frontmatter.entity === undefined)
      .map(({ frontmatter }) => frontmatter.id);
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

  /**
   * The draft, or the base for a record with none, with the record's agent and billing, read with main's constitution file once main
   * holds the draft's text. Over entities, each entity names its file once main holds its draft's text, or, with no draft, once main
   * holds a file there, adopted as it is.
   */
  private appliedPipelineOf(setup: Readonly<PipelineSetup>, reading: ApplyMainReading): Pipeline {
    const applied = structuredClone(setup.draft ?? this.setupRecord.basePipeline()) as Pipeline;
    if (setup.agent !== null) applied.agent = PipelineSetupUtil.agentCopyOf(setup.agent);
    // A record with no billing chosen keeps the draft's, the stored pipeline's for an update, so Apply writes no billing nobody chose.
    if (setup.billing !== null) applied.billing = PipelineSetupUtil.billingCopyOf(setup.billing);
    const { mainConstitution } = reading;
    if (!draftHasEntities(setup)) {
      if (mainConstitution !== null && draftConstitutionTextOf(setup) !== null) applied.constitution = { path: mainConstitution.path };
      return applied;
    }
    for (const [entityKey, entity] of Object.entries(applied.entities ?? {})) {
      const onMain = entityMainConstitutionOf(reading, entityKey);
      const text   = textOfDraft(entityDraftOf(setup, entityKey));
      if (onMain !== null && (text === null || text === onMain.markdown)) entity.constitution = { path: onMain.path };
    }
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

  private requirePendingRequest(setup: Readonly<PipelineSetup>): NonNullable<PipelineSetup['applyRequest']> {
    const request = setup.applyRequest;
    const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (request === null || !pendingStates.includes(request.state)) throw new BoardRefusal({ reason: 'no-apply-pending', setupId: setup.setupId });
    return request;
  }
}
