/**
 * The pipeline facts of the board state (PLAN 9.1): the stored pipeline, the open setup record, the flow the Pipeline view draws with its
 * occupants, the gate profiles, the pipeline history and the choices. It runs no git and reads no file: the main line's texts arrive as a
 * parameter, read by the Overseer, since the render service cannot reach the overseer service.
 */
import type { PipelineReading }      from '../../adapters/pipeline/PipelineFile.ts';
import type { GatePhase }            from '../../lib/tracker-model/@types/GatePhase.ts';
import type { GateProfilesReading }  from '../../lib/tracker-model/@types/GateProfile.ts';
import type { GateCacheReport, Job } from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }            from '../../lib/tracker-model/@types/LogRecord.ts';
import {
  PIPELINE_AGENT_ROLES,
  type EntityAgentRole,
  type EntityKey,
  type InstructionEntry,
  type Pipeline,
  type PipelineAgentRole
} from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  AppliedPipelineFacts,
  ApplyStateFacts,
  ConstitutionOutline,
  EntityAssignmentFacts,
  EntityAssignmentTicket,
  GateCacheMarkFacts,
  GateProfileRunFacts,
  PipelineChange,
  PipelineChoices,
  PipelineFlowFacts,
  PipelineFlowNode,
  PipelineFlowStage,
  PipelineOccupant,
  PipelineSetupEntityFacts,
  PipelineSetupEntitySummary,
  PipelineSetupFacts,
  ResolvedInstructionEntry,
  ResolvedSourceAnnotation
} from '../../lib/tracker-model/@types/PipelineFacts.ts';
import type {
  ConstitutionDraft,
  MainConstitutionReading,
  PipelineSetup,
  PipelineSetupEntity,
  PipelineSetupReading,
  ResearchFinding,
  SetupQuestion,
  SourceAnnotation
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { AgentPair }                                                  from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                                                      from '../../lib/tracker-model/Board.ts';
import { AGENT_EFFORTS, AGENT_MODELS }                                     from '../../lib/tracker-model/constants/AgentSettings.ts';
import { PipelineChangeUtil }                                              from '../../lib/tracker-model/utils/PipelineChangeUtil.ts';
import { PipelineUtil }                                                    from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { PIPELINE_FLOW_NODE_IDS, entityFlowGraphsOf, pipelineFlowGraphOf } from './PipelineFlowGraph.ts';

/** How much of an instruction file the flow carries for its preview; the editor reads the rest itself. */
export const INSTRUCTION_PREVIEW_LIMIT_CHARACTERS = 4000;

/** How many pipeline records the live view's "Earlier" list gets, newest first. */
export const PIPELINE_HISTORY_RECORDS_SHOWN = 32;

/** The records that change the pipeline or say how its board runs; a setup's own steps, findings and questions stay out. */
const PIPELINE_HISTORY_KINDS: ReadonlySet<LogRecord['kind']> = new Set<LogRecord['kind']>([
  'pipeline-gate-added',
  'pipeline-gate-removed',
  'pipeline-gates-none',
  'pipeline-gates-ordered',
  'pipeline-prepare-step-set',
  'pipeline-approval-set',
  'pipeline-setup-opened',
  'pipeline-draft-discarded',
  'pipeline-setup-discarded',
  'pipeline-apply-requested',
  'pipeline-apply-held',
  'pipeline-apply-refused',
  'pipeline-apply-cancelled',
  'pipeline-applied',
  'overseer-set',
]);

/** What the Overseer read on the main line for one state read; every git answer the facts carry comes through here. */
export interface MainLineTexts {
  /** A file's text on main, a data-folder file's from disk; null when it is not there or no main line is known. */
  textOf:               (path: string) => string | null;
  /** Main's `CONSTITUTION.md`, asked only when a drafted constitution is compared with it. */
  mainConstitution:     () => MainConstitutionReading;
  mainMovedByCommitsOf: (snapshotCommit: string | null) => number;
}

export interface PipelineFactsInput {
  board:                Board;
  pipelineReading:      PipelineReading;
  /** The stored `pipeline.json` text; null when it could not be read. */
  pipelineFileText:     string | null;
  pipelineSetupReading: PipelineSetupReading;
  gateProfilesReading:  GateProfilesReading;
  logRecords:           readonly LogRecord[];
  /** The branch the main checkout lands on; null leaves no ticket holding main. */
  mainLine:             string | null;
  mainLineTexts:        MainLineTexts;
  renderMarkdown:       (markdown: string) => string;
  /** The repository path an instruction entry reads, as the launch resolves it. */
  instructionPathOf:    (pipeline: Readonly<Pipeline> | null, entry: Readonly<InstructionEntry>) => string;
  /** The model and effort a role runs on where the pipeline names none. */
  defaultSettingsOf:    (role: PipelineAgentRole) => AgentPair;
  /** Shown as an occupant's start only when the log lost the stamp of its start. */
  generatedAt:          Date;
}

export interface PipelineFacts {
  pipeline:              AppliedPipelineFacts;
  pipelineSetup:         PipelineSetupFacts | null;
  pipelineFlow:          PipelineFlowFacts | null;
  profileRuns:           GateProfileRunFacts[];
  gateCacheMarks:        GateCacheMarkFacts[];
  pipelineHistory:       LogRecord[];
  pipelineChoices:       PipelineChoices;
  /** The pipeline agent's model and effort while no draft names them, which the setup steps show. */
  pipelineAgentDefaults: AgentPair;
  /** Absent until the first Apply over entities started a product owner to give pending tickets an entity: its progress per ticket. */
  entityAssignment?:     EntityAssignmentFacts;
}

const NODE_IDS = PIPELINE_FLOW_NODE_IDS;

const IN_FLIGHT_TICKET_STATUSES: ReadonlySet<string> = new Set(['in-progress', 'in-review', 'reviewed']);

function storedPipelineOf(input: PipelineFactsInput): Pipeline | null {
  return input.pipelineReading.verdict === 'readable' ? input.pipelineReading.pipeline : null;
}

function appliedPipelineOf(input: PipelineFactsInput): AppliedPipelineFacts {
  const reading  = input.pipelineReading;
  const fileText = input.pipelineFileText ?? '';
  switch (reading.verdict) {
    case 'absent':
      return { readingVerdict: 'absent' };
    case 'older':
      return { readingVerdict: 'older', fileText };
    case 'malformed':
      return { readingVerdict: 'malformed', reason: reading.reason, fileText };
    default: {
      const applications = input.logRecords.filter((record) => record.kind === 'pipeline-applied');
      const newest = applications.at(-1);
      return {
        readingVerdict: 'readable',
        pipeline:       reading.pipeline,
        contentHash:    PipelineUtil.contentHashOf(reading.pipeline),
        fileText,
        application:    newest?.kind === 'pipeline-applied'
          ? {
            appliedRevision: applications.length, appliedAt: newest.at, appliedBy: 'user', constitutionCommit: newest.fields.constitutionCommit
          }
          : null,
      };
    }
  }
}

function markdownLinesOf(markdown: string): string[] {
  return markdown.split(/\r?\n/u);
}

/** "4 sections · 9 rules": the `##` lines and the top-level `-` items. */
function constitutionOutlineOf(markdown: string): ConstitutionOutline {
  const lines = markdownLinesOf(markdown);
  return {
    sectionCount: lines.filter((line) => line.startsWith('## ')).length,
    ruleCount:    lines.filter((line) => line.startsWith('- ')).length,
  };
}

/** Each annotation with the index of the line it anchors to: the `occurrence`-th line with its exact text. One that anchors nowhere is left out. */
function resolvedAnnotationsOf(markdown: string, annotations: readonly SourceAnnotation[]): ResolvedSourceAnnotation[] {
  const lines = markdownLinesOf(markdown);
  return annotations.flatMap((annotation) => {
    const lineIndex = lines.flatMap((line, index) => (line === annotation.lineText ? [index] : []))[annotation.occurrence - 1];
    return lineIndex === undefined ? [] : [{ ...annotation, lineIndex }];
  });
}

function rolesReadingOf(pipeline: Readonly<Pipeline> | null, entry: Readonly<InstructionEntry>): PipelineAgentRole[] {
  const sameEntry = (other: Readonly<InstructionEntry>): boolean => JSON.stringify(other) === JSON.stringify(entry);
  return PIPELINE_AGENT_ROLES.filter((role) => PipelineUtil.resolvedInstructionsOf(pipeline, role).some(sameEntry));
}

function resolvedEntriesOf(input: PipelineFactsInput, pipeline: Readonly<Pipeline>, role: PipelineAgentRole): ResolvedInstructionEntry[] {
  return PipelineUtil.resolvedInstructionsOf(pipeline, role).map((entry) => {
    const path = input.instructionPathOf(pipeline, entry);
    const text = input.mainLineTexts.textOf(path);
    return {
      entry,
      fileName:    path.split('/').at(-1) ?? path,
      readByRoles: rolesReadingOf(pipeline, entry),
      text:        text === null ? null : text.slice(0, INSTRUCTION_PREVIEW_LIMIT_CHARACTERS),
      textIsCut:   text !== null && text.length > INSTRUCTION_PREVIEW_LIMIT_CHARACTERS,
    };
  });
}

function ticketIdHoldingMainOf(input: PipelineFactsInput): string | null {
  const { mainLine } = input;
  if (mainLine === null) return null;
  const holder = input.board.jobs().find((job) => job.airlock?.target === mainLine && job.kind !== 'constitution-commit');
  return holder?.ticketIds[0] ?? null;
}

/** The blocking files live only in the newest `pipeline-apply-held` record of the setup, so a held request reads them from there. */
function applyStateOf(input: PipelineFactsInput, setup: Readonly<PipelineSetup>): ApplyStateFacts | null {
  const request = setup.applyRequest;
  if (request === null) return null;
  const held = input.logRecords.findLast((record) => record.kind === 'pipeline-apply-held' && record.setupId === setup.setupId);
  return {
    ...request,
    blockingFiles:       request.state === 'held' && held?.kind === 'pipeline-apply-held' ? [...held.fields.blockingFiles] : [],
    ticketIdHoldingMain: ticketIdHoldingMainOf(input),
  };
}

/** The parts of a record or of one entity's part of it that the summary counts. */
interface SummarisedPart {
  findings:  readonly ResearchFinding[];
  questions: readonly SetupQuestion[];
}

function summaryOf(part: SummarisedPart, pipeline: Readonly<Pipeline> | null): PipelineSetupEntitySummary {
  return {
    stackItemCount:                part.findings.filter((finding) => finding.topic === 'stack').length,
    scriptCount:                   part.findings.filter((finding) => finding.script !== null).length,
    answeredResearchQuestionCount: part.questions.filter((question) => question.step === 'research' && question.answer !== null).length,
    prepareStepCount:              pipeline?.prepare.length ?? 0,
    gateCountByPhase:              { build: pipeline?.phases.build.length ?? 0, review: pipeline?.phases.review.length ?? 0, merge: pipeline?.phases.merge.length ?? 0 },
  };
}

type ConstitutionFacts = Pick<PipelineSetupFacts, 'constitutionHtml' | 'constitutionOutline' | 'annotations'>;

function constitutionFactsOf(input: PipelineFactsInput, constitution: Readonly<ConstitutionDraft> | null): ConstitutionFacts {
  return {
    constitutionHtml:    constitution === null ? null : input.renderMarkdown(constitution.markdown),
    constitutionOutline: constitution === null ? null : constitutionOutlineOf(constitution.markdown),
    annotations:         constitution === null ? [] : resolvedAnnotationsOf(constitution.markdown, constitution.annotations),
  };
}

function agentJobStateOf(input: PipelineFactsInput, agentJobId: string | null): PipelineSetupFacts['agentJobState'] {
  return input.board.jobs().find((job) => job.id === agentJobId)?.state ?? null;
}

function roleIsAnEntityRole(role: PipelineAgentRole): role is EntityAgentRole {
  return role === 'builder' || role === 'reviewer' || role === 'reReviewer' || role === 'conflictReReviewer';
}

const NO_ENTITY_PART: Readonly<PipelineSetupEntity> = {
  agentJobId: null, findings: [], questions: [], constitution: null
};

/** The entities of the draft, else of the stored pipeline, then those only the record names, each once, in that order. */
function setupEntityKeysOf(setup: Readonly<PipelineSetup>, readPipeline: Readonly<Pipeline> | null): EntityKey[] {
  return [...new Set([...Object.keys(readPipeline?.entities ?? {}), ...Object.keys(setup.entities ?? {})])];
}

function setupEntityFactsOf(input: PipelineFactsInput, setup: Readonly<PipelineSetup>, readPipeline: Readonly<Pipeline> | null): Record<EntityKey, PipelineSetupEntityFacts> {
  return Object.fromEntries(setupEntityKeysOf(setup, readPipeline).map((entityKey) => {
    const part = setup.entities !== undefined && Object.hasOwn(setup.entities, entityKey) ? setup.entities[entityKey] ?? NO_ENTITY_PART : NO_ENTITY_PART;
    const entityPipeline = readPipeline === null ? null : PipelineUtil.pipelineOfEntity(readPipeline, entityKey);
    const facts: PipelineSetupEntityFacts = {
      summary:           summaryOf(part, entityPipeline),
      openQuestionCount: part.questions.filter((question) => question.answer === null).length,
      agentJobState:     agentJobStateOf(input, part.agentJobId),
      ...constitutionFactsOf(input, part.constitution),
      readByRoles:       rolesReadingOf(entityPipeline, { kind: 'constitution' }).filter(roleIsAnEntityRole),
    };
    return [entityKey, facts] as const;
  }));
}

function setupFactsOf(input: PipelineFactsInput, setup: Readonly<PipelineSetup>): PipelineSetupFacts {
  const { constitution, draft } = setup;
  const readPipeline = draft ?? storedPipelineOf(input);
  const holdsEntities = readPipeline?.entities !== undefined || setup.entities !== undefined;
  return {
    record:  setup,
    summary: {
      ...summaryOf(setup, draft),
      userEditsKeptCount: setup.edits.filter((edit) => edit.by === 'user' && !edit.undone).length,
    },
    openQuestionCount:  setup.questions.filter((question) => question.answer === null).length,
    agentJobState:      agentJobStateOf(input, setup.agentJobId),
    mainMovedByCommits: input.mainLineTexts.mainMovedByCommitsOf(setup.snapshotCommit),
    ...constitutionFactsOf(input, constitution),
    readByRoles:        rolesReadingOf(readPipeline, { kind: 'constitution' }),
    applyState:         applyStateOf(input, setup),
    ...(holdsEntities ? { entities: setupEntityFactsOf(input, setup, readPipeline) } : {}),
  };
}

/**
 * A drafted text that main does not hold is a change; a main that git could not read is never taken to hold it. A draft over entities gives
 * the forge no constitution of its own, so the forge's text is never a change there: each entity's is its own row.
 */
function constitutionTextChanged(input: PipelineFactsInput, setup: Readonly<PipelineSetup>): boolean {
  if (setup.constitution === null || setup.draft?.entities !== undefined) return false;
  const main = input.mainLineTexts.mainConstitution();
  return main.verdict !== 'read' || main.constitution.markdown !== setup.constitution.markdown;
}

/** Every field the draft changes against the stored pipeline, or the minimal one, with the newest edit Undo would send. */
function changeListOf(input: PipelineFactsInput, setup: Readonly<PipelineSetup>, draft: Readonly<Pipeline>): PipelineChange[] {
  const base = storedPipelineOf(input) ?? PipelineUtil.minimalPipelineOf();
  return PipelineChangeUtil.changesBetween(base, draft, constitutionTextChanged(input, setup)).map((change) => ({
    field:      change.field,
    changeKind: change.change,
    editId:     setup.edits.findLast((edit) => edit.field === change.field && !edit.undone)?.editId ?? null,
  }));
}

/** A question on a `node` subject marks that node, named by id or kind; one on a `gate` subject marks each gates node holding that gate. */
function questionIdsOf(node: Readonly<PipelineFlowNode>, questions: readonly SetupQuestion[]): string[] {
  return questions.flatMap((question) => {
    const { subject } = question;
    if (subject === null) return [];
    const marksNode = subject.kind === 'node'
      ? subject.reference === node.nodeId || subject.reference === node.nodeKind
      : subject.kind === 'gate' && node.phase !== null && node.gateChips.some((chip) => chip.gateName === subject.reference);
    return marksNode ? [question.questionId] : [];
  });
}

interface OccupantContext {
  readonly input:           PipelineFactsInput;
  readonly drawnNodeIds:    ReadonlySet<string>;
  readonly launchedAtByJob: ReadonlyMap<string, string>;
  readonly mergeApprovalOn: boolean;
}

function firstDrawnOf(context: OccupantContext, nodeIds: readonly string[]): string | null {
  return nodeIds.find((nodeId) => context.drawnNodeIds.has(nodeId)) ?? null;
}

function hasConflictReReviewer(context: OccupantContext, job: Readonly<Job>): boolean {
  return context.input.board.jobs().some((child) => child.parentJobId === job.id && child.role === 'conflict-re-reviewer');
}

/** The merge of main before User's code review (W2.6), or its re-review while a conflict re-reviewer judges the resolution. */
function mergingMainNodesOf(context: OccupantContext, job: Readonly<Job>, worker: string): string[] {
  return [
    ...(hasConflictReReviewer(context, job) ? [NODE_IDS.reReviewBeforeHumanCodeReview] : []),
    NODE_IDS.mergeBeforeHumanCodeReview,
    worker,
  ];
}

/**
 * The nodes a job's tickets may stand on, most specific first. A review job still preparing catches up with main before its reviewer
 * starts, so it sits on the merge before review (Q5, PLAN 7.9). An Airlock job stands where its phase is.
 */
function candidateNodesOf(context: OccupantContext, job: Readonly<Job>): string[] {
  switch (job.kind) {
    case 'build':
      if (job.state === 'gating') return [NODE_IDS.buildGates, NODE_IDS.builder];
      if (job.state === 'merging-main') return mergingMainNodesOf(context, job, NODE_IDS.builder);
      return [NODE_IDS.builder];
    case 'review':
      if (job.state === 'preparing') return [NODE_IDS.mergeBeforeReview, NODE_IDS.review];
      if (job.state === 'gating') return [NODE_IDS.reviewGates, NODE_IDS.review];
      if (job.state === 'merging-main') return mergingMainNodesOf(context, job, NODE_IDS.review);
      return job.role === 're-reviewer' ? [NODE_IDS.reReview, NODE_IDS.review] : [NODE_IDS.review];
    case 'merge':
      switch (job.airlock?.phase) {
        case 're-reviewing':
          return [NODE_IDS.reReviewInAirlock, NODE_IDS.mergeInAirlock];
        case 'gating':
          return [NODE_IDS.mergeGates, NODE_IDS.mergeInAirlock];
        case 'landing':
          return [NODE_IDS.fastForwardMain];
        default:
          return [NODE_IDS.mergeInAirlock];
      }
    default:
      return [];
  }
}

function jobOccupantsOf(context: OccupantContext): PipelineOccupant[] {
  const since = (jobId: string): string => context.launchedAtByJob.get(jobId) ?? context.input.generatedAt.toISOString();
  return context.input.board.jobs().flatMap((job) => {
    const nodeId = firstDrawnOf(context, candidateNodesOf(context, job));
    if (nodeId === null) return [];
    return job.ticketIds.map((ticketId): PipelineOccupant => ({
      occupantKind: 'ticket', occupantId: ticketId, nodeId, jobId: job.id, since: since(job.id),
    }));
  });
}

/** A product owner's work on ticket creation: the filing drafts being written, and the drafts it filed while it runs. */
function ticketCreationOccupantsOf(context: OccupantContext): PipelineOccupant[] {
  const { board } = context.input;
  if (!context.drawnNodeIds.has(NODE_IDS.ticketCreation)) return [];
  const productOwnerJobIds = new Set(board.jobs().filter((job) => job.kind === 'product-owner').map((job) => job.id));
  const draftOccupants = board.drafts().flatMap((draft): PipelineOccupant[] => (draft.claim === null ? [] : [{
    occupantKind: 'draft',
    occupantId:   draft.id,
    nodeId:       NODE_IDS.ticketCreation,
    jobId:        productOwnerJobIds.has(draft.claim.owner) ? draft.claim.owner : null,
    since:        draft.claim.claimedAt,
  }]));
  const filedOccupants = board.tickets().flatMap(({ frontmatter }): PipelineOccupant[] => {
    const filedBy = frontmatter.filedByJob;
    if (frontmatter.status !== 'draft' || filedBy === undefined || !productOwnerJobIds.has(filedBy)) return [];
    return [{
      occupantKind: 'ticket',
      occupantId:   frontmatter.id,
      nodeId:       NODE_IDS.ticketCreation,
      jobId:        filedBy,
      since:        context.launchedAtByJob.get(filedBy) ?? context.input.generatedAt.toISOString(),
    }];
  });
  return [...draftOccupants, ...filedOccupants];
}

/** A ticket queued for a merge that no job holds waits for User's Merge, or for the merge train. */
function queuedOccupantsOf(context: OccupantContext): PipelineOccupant[] {
  const { board, logRecords } = context.input;
  const ticketIdsOfJobs = new Set(board.jobs().flatMap((job) => job.ticketIds));
  const waitingNodeId = firstDrawnOf(context, context.mergeApprovalOn
    ? [NODE_IDS.humanCodeReview, NODE_IDS.readyForAirlock]
    : [NODE_IDS.readyForAirlock, NODE_IDS.humanCodeReview]);
  if (waitingNodeId === null) return [];
  return board.tickets().flatMap(({ frontmatter }): PipelineOccupant[] => {
    const ticketId = frontmatter.id;
    if (ticketIdsOfJobs.has(ticketId) || !board.ticketIsMergeQueued(ticketId)) return [];
    const queuedAt = logRecords.findLast((record) => record.kind === 'merge-queued' && record.ticketId === ticketId)?.at;
    return [{
      occupantKind: 'ticket', occupantId: ticketId, nodeId: waitingNodeId, jobId: null, since: queuedAt ?? context.input.generatedAt.toISOString(),
    }];
  });
}

/** The newest launch stamp of each job: only shown, never read to decide. */
function launchedAtByJobOf(logRecords: readonly LogRecord[]): ReadonlyMap<string, string> {
  return new Map(logRecords.flatMap((record) => (record.kind === 'job-launched' ? [[record.jobId, record.at] as const] : [])));
}

function occupantsOf(input: PipelineFactsInput, nodes: readonly PipelineFlowNode[], pipeline: Readonly<Pipeline>): PipelineOccupant[] {
  const context: OccupantContext = {
    input,
    drawnNodeIds:    new Set(nodes.map((node) => node.nodeId)),
    launchedAtByJob: launchedAtByJobOf(input.logRecords),
    mergeApprovalOn: PipelineChangeUtil.approvalIsOn(pipeline, 'merge'),
  };
  return [...ticketCreationOccupantsOf(context), ...jobOccupantsOf(context), ...queuedOccupantsOf(context)];
}

/** A first setup is a proposal, an update or advise record is an edit, and with no record the stored pipeline is live. */
function flowStageOf(setup: Readonly<PipelineSetup> | null): PipelineFlowStage {
  if (setup === null) return 'live';
  return setup.mode === 'setup' ? 'proposal' : 'editing';
}

function entityQuestionsOf(setup: Readonly<PipelineSetup> | null, entityKey: EntityKey): readonly SetupQuestion[] {
  const entities = setup?.entities;
  return entities !== undefined && Object.hasOwn(entities, entityKey) ? entities[entityKey]?.questions ?? [] : [];
}

/** Each entity's graph, its nodes marked with the questions of the entity's part of the record; absent without entities. */
function entityFlowsOf(
  input: PipelineFactsInput,
  setup: Readonly<PipelineSetup> | null,
  drawn: Readonly<Pipeline>,
  stage: PipelineFlowStage,
): Pick<PipelineFlowFacts, 'entityFlows'> {
  const graphs = entityFlowGraphsOf({
    pipeline:             drawn,
    appliedPipeline:      storedPipelineOf(input),
    stage,
    defaultSettingsOf:    input.defaultSettingsOf,
    instructionEntriesOf: (entityPipeline, role) => resolvedEntriesOf(input, entityPipeline, role),
  });
  if (graphs === null) return {};
  const entityFlows = Object.fromEntries(Object.entries(graphs).map(([entityKey, graph]) => {
    const questions = entityQuestionsOf(setup, entityKey);
    return [entityKey, { ...graph, nodes: graph.nodes.map((node) => ({ ...node, questionIds: questionIdsOf(node, questions) })) }] as const;
  }));
  return { entityFlows };
}

function pipelineFlowOf(input: PipelineFactsInput, setup: Readonly<PipelineSetup> | null): PipelineFlowFacts | null {
  const stored = storedPipelineOf(input);
  const stage  = flowStageOf(setup);
  const drawn  = setup === null ? stored : setup.draft;
  if (drawn === null) return null;
  const graph = pipelineFlowGraphOf({
    pipeline:             drawn,
    appliedPipeline:      stored,
    stage,
    defaultSettingsOf:    input.defaultSettingsOf,
    instructionEntriesOf: (role) => resolvedEntriesOf(input, drawn, role),
  });
  const nodes = graph.nodes.map((node) => ({ ...node, questionIds: questionIdsOf(node, setup?.questions ?? []) }));
  return {
    ...graph,
    nodes,
    occupants:         stage === 'live' ? occupantsOf(input, nodes, drawn) : [],
    changeList:        setup === null ? [] : changeListOf(input, setup, drawn),
    ticketIdsInFlight: input.board.tickets().map(({ frontmatter }) => frontmatter).filter((frontmatter) => IN_FLIGHT_TICKET_STATUSES.has(frontmatter.status))
      .map((frontmatter) => frontmatter.id),
    toolbarStage: stage,
    ...entityFlowsOf(input, setup, drawn, stage),
  };
}

function profileRunsOf(reading: GateProfilesReading): GateProfileRunFacts[] {
  if (reading.verdict !== 'readable') return [];
  return reading.profiles.runs.map((run) => ({
    profileRunId:        run.profileRunId,
    ...(run.entity === undefined ? {} : { entity: run.entity }),
    gateName:            run.gate.name,
    phase:               run.phase,
    state:               run.state,
    elapsedMilliseconds: run.elapsedMilliseconds,
    cacheReport:         run.cacheReport ?? null,
  }));
}

/** A gate of one phase, of one entity on a forge over entities, with what its newest run reported; null while that reported nothing. */
interface NewestCacheReport {
  entity:      EntityKey | undefined;
  gateName:    string;
  phase:       GatePhase;
  cacheReport: GateCacheReport | null;
}

/**
 * Walks the log in order: a job's gate run sets the report of each gate it ran in its phase, and a profile run that ended sets the report
 * the profile file keeps for its entity, gate and phase, so the run that ended last stands. A profile run the log does not name stands until
 * a job's run of its gate does. A job's gate run names no entity.
 */
function gateCacheMarksOf(logRecords: readonly LogRecord[], profileRuns: readonly GateProfileRunFacts[]): GateCacheMarkFacts[] {
  const keyOf = (entity: EntityKey | undefined, gateName: string, phase: GatePhase): string => JSON.stringify([entity ?? null, gateName, phase]);
  const profileReportOf = (entity: EntityKey | undefined, gateName: string, phase: GatePhase): GateCacheReport | null => profileRuns
    .find((run) => run.entity === entity && run.gateName === gateName && run.phase === phase)?.cacheReport ?? null;
  const newestByGate = new Map<string, NewestCacheReport>(profileRuns.map((run) => [
    keyOf(run.entity, run.gateName, run.phase), {
      entity: run.entity, gateName: run.gateName, phase: run.phase, cacheReport: run.cacheReport
    },
  ]));
  for (const record of logRecords) {
    if (record.kind === 'gate-profiled') {
      const { gateName, phase } = record.fields;
      const { entity } = profileRuns.find((run) => run.profileRunId === record.profileRunId) ?? {};
      newestByGate.set(keyOf(entity, gateName, phase), {
        entity, gateName, phase, cacheReport: profileReportOf(entity, gateName, phase)
      });
    }
    if (record.kind !== 'gate-ran' || record.fields.cacheReports === undefined) continue;
    const { phase, gates } = record.fields.cacheReports;
    for (const gate of gates) {
      newestByGate.set(keyOf(undefined, gate.gateName, phase), {
        entity: undefined, gateName: gate.gateName, phase, cacheReport: gate.cacheReport
      });
    }
  }
  return [...newestByGate.values()].flatMap(({
    entity, gateName, phase, cacheReport
  }) => (cacheReport === null ? [] : [{
    ...(entity === undefined ? {} : { entity }), gateName, phase, cacheReport
  }]));
}

/**
 * The newest product owner launched to give pending tickets an entity, from its launch record, with each ticket's entity and reason from
 * its newest `entity-assigned` record after that launch; absent when no such product owner was launched.
 */
function entityAssignmentOf(input: PipelineFactsInput): Pick<PipelineFacts, 'entityAssignment'> {
  const { logRecords, board } = input;
  const launchIndex = logRecords.findLastIndex((record) => record.kind === 'job-launched' && record.fields.entitiesToAssign !== undefined);
  const launch = logRecords[launchIndex];
  if (launch?.kind !== 'job-launched' || launch.fields.entitiesToAssign === undefined) return {};
  const later = logRecords.slice(launchIndex + 1);
  const tickets = launch.fields.entitiesToAssign.map((ticketId): EntityAssignmentTicket => {
    const assigned = later.findLast((record) => record.kind === 'entity-assigned' && record.ticketId === ticketId);
    const title = board.tickets().find(({ frontmatter }) => frontmatter.id === ticketId)?.frontmatter.title ?? null;
    if (assigned?.kind !== 'entity-assigned') {
      return {
        ticketId, title, entity: null, reason: null, assignedBy: null
      };
    }
    return {
      ticketId, title, entity: assigned.fields.entity, reason: assigned.fields.reason, assignedBy: assigned.fields.by
    };
  });
  return { entityAssignment: { jobId: launch.jobId, jobState: board.jobById(launch.jobId)?.state ?? null, tickets } };
}

function pipelineHistoryOf(logRecords: readonly LogRecord[]): LogRecord[] {
  return logRecords.filter((record) => PIPELINE_HISTORY_KINDS.has(record.kind)).slice(-PIPELINE_HISTORY_RECORDS_SHOWN).reverse();
}

export function pipelineFactsOf(input: PipelineFactsInput): PipelineFacts {
  const setup = input.pipelineSetupReading.verdict === 'readable' ? input.pipelineSetupReading.setup : null;
  const profileRuns = profileRunsOf(input.gateProfilesReading);
  return {
    pipeline:              appliedPipelineOf(input),
    pipelineSetup:         setup === null ? null : setupFactsOf(input, setup),
    pipelineFlow:          pipelineFlowOf(input, setup),
    profileRuns,
    gateCacheMarks:        gateCacheMarksOf(input.logRecords, profileRuns),
    pipelineHistory:       pipelineHistoryOf(input.logRecords),
    pipelineChoices:       { models: [...AGENT_MODELS], efforts: [...AGENT_EFFORTS] },
    pipelineAgentDefaults: input.defaultSettingsOf('pipelineAgent'),
    ...entityAssignmentOf(input),
  };
}
