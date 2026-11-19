/**
 * The stages of a ticket that crosses into whitelisted packages (strategy 4.2), as the Overseer runs them: which packages the branch crossed
 * into after stage 1, what Customs holds each stage to, the statement each package stage leaves in its job folder, whether `adapt` is
 * skipped (E40), and what each stage's session is told.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join }                    from 'node:path';

import { writeFileAtomically }                        from '../../lib/atomic-file/AtomicFile.ts';
import type { Job }                                   from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                             from '../../lib/tracker-model/@types/LogRecord.ts';
import type { EntityKey, Pipeline }                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage, TicketStageName }          from '../../lib/tracker-model/@types/Task.ts';
import type { Board }                                 from '../../lib/tracker-model/Board.ts';
import { ENTITY_DECISION_ANSWERS }                    from '../../lib/tracker-model/constants/EntityDecisionAnswers.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { TicketStageUtil }                            from '../../lib/tracker-model/utils/TicketStageUtil.ts';
import type { CrossingStageScope, SealedChange }      from '../lifecycle/Customs.ts';
import { jobFolderIn }                                from './OverseerFiles.ts';

/** What the package stages ended with for one crossed package, as the adapt stage reads it. */
export interface CrossedPackageResult {
  entity:                string;
  /** The package builder's statement, as the package reviewer confirmed or corrected it. */
  exposedSurfaceChanged: boolean;
  /** The package reviewer's Review. */
  reviewText:            string;
}

/** A sealed package's review as the home review reads it (E32): the package reviewer writes there what it saw in the home's files. */
export interface SealedPackageReview {
  entity:     string;
  reviewText: string;
}

/**
 * What a job of a ticket that crosses into whitelisted packages is told of its stage (strategy 4.2). The job's `entity` is the entity the
 * stage runs under: the home entity in `build`, `adapt` and `review`, the package in `package-build` and `package-review`.
 */
/** A package build that refused the ticket's change of its package, and why (E22): stage 1 takes that change back out. */
export interface RefusedPackageChange {
  entity:        string;
  refusedReason: string;
}

export type CrossingStageFacts =
  | { stage: 'build'; whitelistedPackages: readonly string[]; refusedPackageChanges?: readonly RefusedPackageChange[] }
  | { stage: 'package-build'; homeEntity: string; packageReturnReason?: string; packageReviewFindings?: string }
  | { stage: 'package-review'; homeEntity: string; exposedSurfaceChanged: boolean }
  | { stage: 'adapt'; crossedPackages: readonly CrossedPackageResult[]; resumesSession: boolean }
  | { stage: 'review'; crossedPackages: readonly SealedPackageReview[] };

/**
 * What a package stage's verified report stated, kept in its job folder, since the stages after it read it once the job ended. A package
 * review also keeps the `reach` paths its package's stages changed, which its seal covers (E3). An adapt build that sent the ticket back
 * keeps the package and what the package must give, which the returned package build is told (E41, E42). A package review that does not
 * hold keeps its Review, since it writes none in the ticket, which the package build it sends back is told (E34).
 */
export type StageStatement =
  | { stage: 'package-build'; exposedSurfaceChanged: boolean }
  | { stage: 'package-review'; exposedSurfaceConfirmed: boolean; reviewText: string; sealedReachPaths: readonly string[] }
  | { stage: 'package-review-findings'; reviewSection: string }
  | { stage: 'adapt'; returnedPackage: string; packageReturnReason: string }
  | { stage: 'package-refused'; refusedReason: string };

/** What the package stages of one crossed package stated: `null` where a stage left no statement. */
export interface PackageStageStatements {
  entity:                  string;
  exposedSurfaceChanged:   boolean | null;
  exposedSurfaceConfirmed: boolean | null;
  reviewText:              string;
  sealedReachPaths:        readonly string[];
}

const STAGE_STATEMENT_FILE = 'stage-statement.json';

const REPOSITORY_ROOT_FOLDER = '/';

function entitiesOf(pipeline: Readonly<Pipeline> | null): PipelineEntities {
  return pipeline?.entities ?? {};
}

function whitelistOf(entities: PipelineEntities, entityKey: EntityKey): readonly EntityKey[] {
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.whitelist ?? [] : [];
}

function homesOf(entities: PipelineEntities, entityKey: EntityKey): readonly string[] {
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.home ?? [] : [];
}

function reachOf(pipeline: Readonly<Pipeline> | null, entityKey: EntityKey): readonly string[] {
  const entities = entitiesOf(pipeline);
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.reach ?? [] : [];
}

/**
 * In stage 1 the builder may write a proposal in the homes of the packages its entity whitelists; in no other stage. A package whose build
 * refused the ticket's change is left out (E22), so a stage 1 that still changes it is sent back.
 */
function proposalHomesOf(pipeline: Readonly<Pipeline> | null, job: Readonly<Pick<Job, 'entity' | 'stage'>>, packagesLeftOut: readonly EntityKey[] = []): string[] {
  if (job.entity === undefined || job.stage !== TicketStageUtil.stageNumberOf('build')) return [];
  const entities = entitiesOf(pipeline);
  return whitelistOf(entities, job.entity).filter((packageKey) => !packagesLeftOut.includes(packageKey)).flatMap((packageKey) => homesOf(entities, packageKey));
}

/**
 * The whitelisted packages a stage 1 branch changed, in the order their stages run (a package before the packages that consume it): the
 * owners of `changedPaths`, given as git spells them, that `whitelist` names, the home entity's unless the ticket's own is given. None for a
 * branch that stayed in its entity.
 */
function crossedPackagesOf(
  pipeline: Readonly<Pipeline> | null, homeEntity: EntityKey, changedPaths: readonly string[], ticketWhitelist?: readonly EntityKey[]
): EntityKey[] {
  const entities = entitiesOf(pipeline);
  const whitelist = ticketWhitelist ?? whitelistOf(entities, homeEntity);
  if (whitelist.length === 0) return [];
  const owners = [...EntityOwnershipUtil.pathsByOwnerOf(entities, changedPaths.map((gitPath) => `${REPOSITORY_ROOT_FOLDER}${gitPath}`)).keys()];
  return EntityOwnershipUtil.stageOrderOf(entities, owners.filter((owner) => whitelist.includes(owner)));
}

/** A home as a git pathspec from the repository root. */
function pathspecOf(home: string): string {
  return EntityOwnershipUtil.homeFolderOf(home).replace(/^\/+/u, '');
}

/**
 * What a package's seal covers: its homes, each deeper home of another entity left out, which that entity owns (E2), and the `reach` paths
 * its package stages changed, as git spells them (E3).
 */
function sealPathspecsOf(pipeline: Readonly<Pipeline> | null, packageKey: EntityKey, sealedReachPaths: readonly string[] = []): string[] {
  const entities = entitiesOf(pipeline);
  const packageHomes = homesOf(entities, packageKey).map(pathspecOf);
  const deeperHomes = Object.entries(entities)
    .filter(([entityKey]) => entityKey !== packageKey)
    .flatMap(([, entity]) => entity.home.map(pathspecOf))
    .filter((home) => packageHomes.some((packageHome) => home.startsWith(`${packageHome}/`)));
  return [...packageHomes, ...sealedReachPaths, ...deeperHomes.map((home) => `:(exclude)${home}`)];
}

/**
 * Customs' view of a job of a crossing ticket: its stage and the seals so far, each on the pathspecs its package review sealed. `null` for
 * every job whose ticket's row stores no stage.
 */
function crossingStageScopeOf(board: Board, trackerDirectory: string, job: Readonly<Job>): CrossingStageScope | null {
  const [ticketId] = job.ticketIds;
  const jobStage = TicketStageUtil.stageOfJob(job);
  if (ticketId === undefined || jobStage === null || board.ticketStageOf(ticketId) === null) return null;
  const pipeline = board.pipeline();
  const logRecords = board.logRecordsSoFar();
  const seals: SealedChange[] = Object.entries(board.ticketSealsOf(ticketId)).map(([entity, seal]) => {
    const { sealedReachPaths } = packageStageStatementsOf(trackerDirectory, logRecords, ticketId, entity);
    return { entity, pathspecs: sealPathspecsOf(pipeline, entity, sealedReachPaths), seal };
  });
  return { stageName: jobStage.name, seals };
}

type StageLaunch = Readonly<{ entity?: string; stage?: number }>;

/**
 * The first job of the run that `job` belongs to: the ticket's build and review launches, back from `job`'s own, while each belongs to the
 * run. `job` itself when it starts its run or its launch is not logged.
 */
function runStartJobIdOf(logRecords: readonly LogRecord[], job: Readonly<Job>, belongsToTheRun: (launch: StageLaunch) => boolean): string {
  const [ticketId] = job.ticketIds;
  let launches: { jobId: string; launch: StageLaunch }[] = [];
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') launches = [];
    const isStageWork = record.kind === 'job-launched' && (record.fields.kind === 'build' || record.fields.kind === 'review');
    if (isStageWork && ticketId !== undefined && record.fields.ticketIds.includes(ticketId)) launches.push({ jobId: record.jobId, launch: record.fields });
    if (record.kind === 'job-launched' && record.jobId === job.id) break;
  }
  if (launches.at(-1)?.jobId !== job.id) return job.id;
  let runStart = job.id;
  for (let i = launches.length - 1; i >= 0 && belongsToTheRun(launches[i]?.launch ?? {}); i -= 1) runStart = launches[i]?.jobId ?? runStart;
  return runStart;
}

/** The first job of `job`'s stage run: the jobs of the same stage and entity back from it, a failed one that it retries among them. */
function stageRunStartJobIdOf(logRecords: readonly LogRecord[], job: Readonly<Job>): string {
  return runStartJobIdOf(logRecords, job, (launch) => launch.entity === job.entity && launch.stage === job.stage);
}

const PACKAGE_STAGE_NUMBERS: readonly number[] = [TicketStageUtil.stageNumberOf('package-build'), TicketStageUtil.stageNumberOf('package-review')];

/** The first job of the package stages that `job`, a package review, ends: the package builds and reviews of its package back from it. */
function packageRunStartJobIdOf(logRecords: readonly LogRecord[], job: Readonly<Job>): string {
  return runStartJobIdOf(logRecords, job, (launch) => launch.entity === job.entity && launch.stage !== undefined && PACKAGE_STAGE_NUMBERS.includes(launch.stage));
}

function stageStatementPathOf(trackerDirectory: string, jobId: string): string {
  return join(jobFolderIn(trackerDirectory, jobId), STAGE_STATEMENT_FILE);
}

function writeStageStatement(trackerDirectory: string, jobId: string, statement: StageStatement): void {
  mkdirSync(jobFolderIn(trackerDirectory, jobId), { recursive: true });
  writeFileAtomically(stageStatementPathOf(trackerDirectory, jobId), `${JSON.stringify(statement)}\n`);
}

function fieldOf(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, field) ? (value as Record<string, unknown>)[field] : undefined;
}

/** `null` for a job that left none, or one that cannot be read: the stage then counts as having stated nothing, so `adapt` runs. */
function stageStatementOf(trackerDirectory: string, jobId: string): StageStatement | null {
  let stored: unknown;
  try {
    stored = JSON.parse(readFileSync(stageStatementPathOf(trackerDirectory, jobId), 'utf8'));
  } catch {
    return null;
  }
  const exposedSurfaceChanged = fieldOf(stored, 'exposedSurfaceChanged');
  const refusedReason = fieldOf(stored, 'refusedReason');
  if (fieldOf(stored, 'stage') === 'package-refused' && typeof refusedReason === 'string') return { stage: 'package-refused', refusedReason };
  const returnedPackage = fieldOf(stored, 'returnedPackage');
  const packageReturnReason = fieldOf(stored, 'packageReturnReason');
  if (fieldOf(stored, 'stage') === 'adapt' && typeof returnedPackage === 'string' && typeof packageReturnReason === 'string') {
    return { stage: 'adapt', returnedPackage, packageReturnReason };
  }
  if (fieldOf(stored, 'stage') === 'package-build' && typeof exposedSurfaceChanged === 'boolean') return { stage: 'package-build', exposedSurfaceChanged };
  const reviewSection = fieldOf(stored, 'reviewSection');
  if (fieldOf(stored, 'stage') === 'package-review-findings' && typeof reviewSection === 'string') return { stage: 'package-review-findings', reviewSection };
  const exposedSurfaceConfirmed = fieldOf(stored, 'exposedSurfaceConfirmed');
  const reviewText = fieldOf(stored, 'reviewText');
  const sealedReachPaths = fieldOf(stored, 'sealedReachPaths');
  const readReachPaths = Array.isArray(sealedReachPaths) && sealedReachPaths.every((reachPath) => typeof reachPath === 'string') ? sealedReachPaths as string[] : [];
  if (fieldOf(stored, 'stage') === 'package-review' && typeof exposedSurfaceConfirmed === 'boolean' && typeof reviewText === 'string') {
    return {
      stage: 'package-review', exposedSurfaceConfirmed, reviewText, sealedReachPaths: readReachPaths
    };
  }
  return null;
}

/** The newest job of the ticket that ran `stage` and ended with `outcome`; `null` when none did. */
function newestStageJobIdOf(logRecords: readonly LogRecord[], ticketId: string, stage: TicketStage, outcome: string): string | null {
  const stageNumber = TicketStageUtil.stageNumberOf(stage.name);
  const stageJobIds = new Set<string>();
  let newest: string | null = null;
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') stageJobIds.clear();
    if (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId) && record.fields.entity === stage.entity && record.fields.stage === stageNumber) {
      stageJobIds.add(record.jobId);
    }
    if (record.kind === 'job-ended' && stageJobIds.has(record.jobId) && record.fields.outcome === outcome) newest = record.jobId;
  }
  return newest;
}

/** The newest job of the ticket that ran `stage` and ended, with its outcome; `null` when none did. */
function newestEndedStageJobOf(logRecords: readonly LogRecord[], ticketId: string, stage: TicketStage): { jobId: string; outcome: string } | null {
  const stageNumber = TicketStageUtil.stageNumberOf(stage.name);
  const stageJobIds = new Set<string>();
  let newest: { jobId: string; outcome: string } | null = null;
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') {
      stageJobIds.clear();
      newest = null;
    }
    if (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId) && record.fields.entity === stage.entity && record.fields.stage === stageNumber) {
      stageJobIds.add(record.jobId);
    }
    if (record.kind === 'job-ended' && stageJobIds.has(record.jobId)) newest = { jobId: record.jobId, outcome: record.fields.outcome };
  }
  return newest;
}

/**
 * The Review of the newest package review of `packageKey`, when it did not hold: the package build it sent back fixes what it found (E34).
 * `null` when the newest package review held, or none ended.
 */
function packageReviewFindingsOf(trackerDirectory: string, logRecords: readonly LogRecord[], ticketId: string, packageKey: EntityKey): string | null {
  const newestReview = newestEndedStageJobOf(logRecords, ticketId, { name: 'package-review', entity: packageKey });
  if (newestReview?.outcome !== 'does-not-hold') return null;
  const statement = stageStatementOf(trackerDirectory, newestReview.jobId);
  return statement?.stage === 'package-review-findings' ? statement.reviewSection : null;
}

/**
 * Whether the ticket's newest ended build or review job is a package review: an `adapt` job launched now takes up the home builder's session
 * after the package stages (E43), not after a home review that did not hold (E51).
 */
function followsThePackageStages(logRecords: readonly LogRecord[], ticketId: string): boolean {
  const stageByJobId = new Map<string, number | undefined>();
  let newestEndedStage: number | undefined;
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') {
      stageByJobId.clear();
      newestEndedStage = undefined;
    }
    const isStageWork = record.kind === 'job-launched' && (record.fields.kind === 'build' || record.fields.kind === 'review');
    if (isStageWork && record.fields.ticketIds.includes(ticketId)) stageByJobId.set(record.jobId, record.fields.stage);
    if (record.kind === 'job-ended' && stageByJobId.has(record.jobId)) newestEndedStage = stageByJobId.get(record.jobId);
  }
  return newestEndedStage === TicketStageUtil.stageNumberOf('package-review');
}

/** What the package build and the package review of `packageKey` stated, from their newest jobs that ended `built` and `reviewed`. */
function packageStageStatementsOf(trackerDirectory: string, logRecords: readonly LogRecord[], ticketId: string, packageKey: EntityKey): PackageStageStatements {
  const buildJobId = newestStageJobIdOf(logRecords, ticketId, { name: 'package-build', entity: packageKey }, 'built');
  const reviewJobId = newestStageJobIdOf(logRecords, ticketId, { name: 'package-review', entity: packageKey }, 'reviewed');
  const built = buildJobId === null ? null : stageStatementOf(trackerDirectory, buildJobId);
  const reviewed = reviewJobId === null ? null : stageStatementOf(trackerDirectory, reviewJobId);
  return {
    entity:                  packageKey,
    exposedSurfaceChanged:   built?.stage === 'package-build' ? built.exposedSurfaceChanged : null,
    exposedSurfaceConfirmed: reviewed?.stage === 'package-review' ? reviewed.exposedSurfaceConfirmed : null,
    reviewText:              reviewed?.stage === 'package-review' ? reviewed.reviewText : '',
    sealedReachPaths:        reviewed?.stage === 'package-review' ? reviewed.sealedReachPaths : [],
  };
}

/**
 * What the newest adapt build of the ticket that sent it back to `packageKey` wrote the package must give (E41, E42); `null` when no adapt
 * build sent it back there.
 */
function packageReturnReasonOf(trackerDirectory: string, logRecords: readonly LogRecord[], ticketId: string, homeEntity: EntityKey, packageKey: EntityKey): string | null {
  const adaptJobId = newestStageJobIdOf(logRecords, ticketId, { name: 'adapt', entity: homeEntity }, 'package-return');
  const statement = adaptJobId === null ? null : stageStatementOf(trackerDirectory, adaptJobId);
  return statement?.stage === 'adapt' && statement.returnedPackage === packageKey ? statement.packageReturnReason : null;
}

/**
 * Whether `adapt` is skipped (E40): for every crossed package the package builder stated that what the package exposes did not change
 * from the proposal, and the package reviewer confirmed it. A statement left out counts as a change.
 */
function adaptIsSkipped(statements: readonly PackageStageStatements[]): boolean {
  return statements.length > 0 && statements.every((statement) => statement.exposedSurfaceChanged === false && statement.exposedSurfaceConfirmed === true);
}

/** The package builder's statement as the package reviewer confirmed or corrected it; a missing statement or confirmation counts as a change. */
function confirmedExposedSurfaceChangedOf(statement: Readonly<PackageStageStatements>): boolean {
  if (statement.exposedSurfaceChanged === null || statement.exposedSurfaceConfirmed === null) return true;
  return statement.exposedSurfaceConfirmed ? statement.exposedSurfaceChanged : !statement.exposedSurfaceChanged;
}

/** The crossed packages so far: those a package review sealed, in the order they were sealed, which is the order their stages ran. */
function sealedPackagesOf(board: Board, ticketId: string): EntityKey[] {
  return Object.keys(board.ticketSealsOf(ticketId));
}

/** The packages of the ticket's crossing that its row stores: each sealed one, then the package whose stage the row is in. */
function rowCrossingPackagesOf(board: Board, ticketId: string): EntityKey[] {
  const stage = board.ticketStageOf(ticketId);
  const sealedPackages = sealedPackagesOf(board, ticketId);
  const packageStage = stage !== null && (stage.name === 'package-build' || stage.name === 'package-review') ? [stage.entity] : [];
  return [...new Set([...sealedPackages, ...packageStage])];
}

/** Each package whose build refused the ticket's change (E22), newest refusal last, with the job that refused it. */
function refusedPackageJobsOf(logRecords: readonly LogRecord[], ticketId: string): { entity: EntityKey; jobId: string }[] {
  const packageBuildNumber = TicketStageUtil.stageNumberOf('package-build');
  const packageByJobId = new Map<string, EntityKey>();
  let refused: { entity: EntityKey; jobId: string }[] = [];
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') {
      packageByJobId.clear();
      refused = [];
    }
    if (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId) && record.fields.stage === packageBuildNumber && record.fields.entity !== undefined) {
      packageByJobId.set(record.jobId, record.fields.entity);
    }
    if (record.kind !== 'job-ended' || record.fields.outcome !== 'refused') continue;
    const entity = packageByJobId.get(record.jobId);
    if (entity !== undefined) refused = [...refused.filter((earlier) => earlier.entity !== entity), { entity, jobId: record.jobId }];
  }
  return refused;
}

/** The packages whose build refused the ticket's change: stage 1 of the ticket may no longer write a proposal there (E22). */
function refusedPackagesOf(logRecords: readonly LogRecord[], ticketId: string): EntityKey[] {
  return refusedPackageJobsOf(logRecords, ticketId).map(({ entity }) => entity);
}

/** Each refused package with the reason its build kept in its job folder; an unread statement gives an empty reason. */
function refusedPackageChangesOf(trackerDirectory: string, logRecords: readonly LogRecord[], ticketId: string): RefusedPackageChange[] {
  return refusedPackageJobsOf(logRecords, ticketId).map(({ entity, jobId }) => {
    const statement = stageStatementOf(trackerDirectory, jobId);
    return { entity, refusedReason: statement?.stage === 'package-refused' ? statement.refusedReason : '' };
  });
}

/**
 * User answered a `whitelist-removed-mid-crossing` decision of the ticket with "finish under the old whitelist" since its crossing began: its
 * newest move back to `build`, or its newest entity assignment (E19).
 */
function finishesUnderTheOldWhitelist(logRecords: readonly LogRecord[], ticketId: string): boolean {
  const whitelistDecisionIds = new Set<string>();
  let finishes = false;
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') finishes = false;
    if (record.kind === 'entity-assigned' && record.ticketId === ticketId) finishes = false;
    if (record.kind === 'stage-started' && record.ticketId === ticketId && record.fields.stage === 'build') finishes = false;
    if (record.kind === 'decision-opened' && record.fields.kind === 'whitelist-removed-mid-crossing' && record.fields.ticketIds.includes(ticketId)) {
      whitelistDecisionIds.add(record.decisionId);
    }
    if (record.kind === 'decision-answered' && whitelistDecisionIds.has(record.decisionId)
      && Object.values(record.fields.answer).includes(ENTITY_DECISION_ANSWERS.finishUnderTheOldWhitelist)) finishes = true;
  }
  return finishes;
}

/**
 * The packages the ticket may cross into: its home's whitelist, with the packages of its stored crossing once User chose to finish it
 * under the old whitelist (E19), and without the packages whose build refused its change (E22).
 */
function ticketWhitelistOf(board: Board, ticketId: string, homeEntity: EntityKey): EntityKey[] {
  const logRecords = board.logRecordsSoFar();
  const keptPackages = finishesUnderTheOldWhitelist(logRecords, ticketId) ? rowCrossingPackagesOf(board, ticketId) : [];
  const refusedPackages = refusedPackagesOf(logRecords, ticketId);
  return [...new Set([...whitelistOf(entitiesOf(board.pipeline()), homeEntity), ...keptPackages])].filter((packageKey) => !refusedPackages.includes(packageKey));
}

/**
 * The packages of the ticket's stored crossing that its home's whitelist no longer names, unless User chose to finish under the old
 * whitelist (E19). None for a ticket that crosses into no package.
 */
function packagesRemovedMidCrossingOf(board: Board, ticketId: string, homeEntity: EntityKey): EntityKey[] {
  if (board.ticketStageOf(ticketId) === null || finishesUnderTheOldWhitelist(board.logRecordsSoFar(), ticketId)) return [];
  const whitelist = whitelistOf(entitiesOf(board.pipeline()), homeEntity);
  return rowCrossingPackagesOf(board, ticketId).filter((packageKey) => !whitelist.includes(packageKey));
}

/**
 * The packages the branch crosses into once a package review sealed one: those the ticket may cross into, and each package its stage 1
 * changed that the home's whitelist no longer names, since its package build had not started. That proposal is no longer crossable, so the
 * package's build opens `whitelist-removed-mid-crossing` as for a crossed package (E19). A package whose build refused the change stays out.
 */
function packagesCrossedAfterAPackageReviewOf(board: Board, ticketId: string, homeEntity: EntityKey, changedPaths: readonly string[]): EntityKey[] {
  const refusedPackages = refusedPackagesOf(board.logRecordsSoFar(), ticketId);
  const packageKeys = Object.entries(entitiesOf(board.pipeline()))
    .filter(([entityKey, entity]) => entity.kind === 'package' && entityKey !== homeEntity && !refusedPackages.includes(entityKey))
    .map(([entityKey]) => entityKey);
  const crossablePackages = [...new Set([...ticketWhitelistOf(board, ticketId, homeEntity), ...packageKeys])];
  return crossedPackagesOf(board.pipeline(), homeEntity, changedPaths, crossablePackages);
}

/**
 * What a build or review job of an entity is told of its stage; `null` for a job without an entity or stage, and for a stage 1 build of
 * an entity that whitelists nothing, which is told what any build of an entity is told.
 */
function crossingStageFactsOf(board: Board, trackerDirectory: string, job: Readonly<Job>, resumesSession: boolean): CrossingStageFacts | null {
  const [ticketId] = job.ticketIds;
  const jobStage = TicketStageUtil.stageOfJob(job);
  if (ticketId === undefined || jobStage === null) return null;
  const pipeline = board.pipeline();
  const homeEntity = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity ?? jobStage.entity;
  const logRecords = board.logRecordsSoFar();
  const stageFactsOf: Readonly<Record<TicketStageName, () => CrossingStageFacts | null>> = {
    'build': () => {
      const refusedPackageChanges = refusedPackageChangesOf(trackerDirectory, logRecords, ticketId);
      const refusedPackages = refusedPackageChanges.map(({ entity }) => entity);
      const whitelistedPackages = whitelistOf(entitiesOf(pipeline), jobStage.entity).filter((packageKey) => !refusedPackages.includes(packageKey));
      if (whitelistedPackages.length === 0 && refusedPackageChanges.length === 0) return null;
      return { stage: 'build', whitelistedPackages, ...(refusedPackageChanges.length === 0 ? {} : { refusedPackageChanges }) };
    },
    'package-build': () => {
      const packageReturnReason = packageReturnReasonOf(trackerDirectory, logRecords, ticketId, homeEntity, jobStage.entity);
      const packageReviewFindings = packageReviewFindingsOf(trackerDirectory, logRecords, ticketId, jobStage.entity);
      return {
        stage: 'package-build',
        homeEntity,
        ...(packageReturnReason === null ? {} : { packageReturnReason }),
        ...(packageReviewFindings === null ? {} : { packageReviewFindings }),
      };
    },
    'package-review': () => ({
      stage:                 'package-review',
      homeEntity,
      exposedSurfaceChanged: packageStageStatementsOf(trackerDirectory, logRecords, ticketId, jobStage.entity).exposedSurfaceChanged ?? true,
    }),
    'adapt': () => ({
      stage:           'adapt',
      crossedPackages: sealedPackagesOf(board, ticketId).map((packageKey) => {
        const statements = packageStageStatementsOf(trackerDirectory, logRecords, ticketId, packageKey);
        return { entity: packageKey, exposedSurfaceChanged: confirmedExposedSurfaceChangedOf(statements), reviewText: statements.reviewText };
      }),
      resumesSession,
    }),
    'review': () => (board.ticketStageOf(ticketId) === null ? null : {
      stage:           'review',
      crossedPackages: sealedPackagesOf(board, ticketId).map((packageKey) => {
        const { reviewText } = packageStageStatementsOf(trackerDirectory, logRecords, ticketId, packageKey);
        return { entity: packageKey, reviewText };
      }),
    }),
  };
  return stageFactsOf[jobStage.name]();
}

export const CrossingStages = Object.freeze({
  proposalHomesOf,
  crossedPackagesOf,
  reachOf,
  sealPathspecsOf,
  crossingStageScopeOf,
  stageRunStartJobIdOf,
  packageRunStartJobIdOf,
  writeStageStatement,
  stageStatementOf,
  packageStageStatementsOf,
  packageReturnReasonOf,
  packageReviewFindingsOf,
  followsThePackageStages,
  adaptIsSkipped,
  confirmedExposedSurfaceChangedOf,
  sealedPackagesOf,
  rowCrossingPackagesOf,
  refusedPackageJobsOf,
  refusedPackagesOf,
  refusedPackageChangesOf,
  finishesUnderTheOldWhitelist,
  ticketWhitelistOf,
  packagesRemovedMidCrossingOf,
  packagesCrossedAfterAPackageReviewOf,
  crossingStageFactsOf,
});
