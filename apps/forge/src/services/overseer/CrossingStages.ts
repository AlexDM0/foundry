/**
 * The stages of a ticket that crosses into whitelisted packages (strategy 4.2), as the Overseer runs them: which packages the branch crossed
 * into after stage 1, what Customs holds each stage to, the statement each package stage leaves in its job folder, whether `adapt` is
 * skipped (C15), and what each stage's session is told.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join }                    from 'node:path';

import { writeFileAtomically }                        from '../../lib/atomic-file/AtomicFile.ts';
import type { Job }                                   from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                             from '../../lib/tracker-model/@types/LogRecord.ts';
import type { EntityKey, Pipeline }                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage, TicketStageName }          from '../../lib/tracker-model/@types/Task.ts';
import type { Board }                                 from '../../lib/tracker-model/Board.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { TicketStageUtil }                            from '../../lib/tracker-model/utils/TicketStageUtil.ts';
import type { CrossingStageScope, SealedChange }      from '../lifecycle/Customs.ts';
import { WatcherFleet }                               from './WatcherFleet.ts';

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
export type CrossingStageFacts =
  | { stage: 'build'; whitelistedPackages: readonly string[] }
  | { stage: 'package-build'; homeEntity: string }
  | { stage: 'package-review'; homeEntity: string; exposedSurfaceChanged: boolean }
  | { stage: 'adapt'; crossedPackages: readonly CrossedPackageResult[]; resumesSession: boolean }
  | { stage: 'review'; crossedPackages: readonly SealedPackageReview[] };

/**
 * What a package stage's verified report stated, kept in its job folder, since the stages after it read it once the job ended. A package
 * review also keeps the `reach` paths its package's stages changed, which its seal covers (E3).
 */
export type StageStatement =
  | { stage: 'package-build'; exposedSurfaceChanged: boolean }
  | { stage: 'package-review'; exposedSurfaceConfirmed: boolean; reviewText: string; sealedReachPaths: readonly string[] };

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

/** In stage 1 the builder may write a proposal in the homes of the packages its entity whitelists; in no other stage. */
function proposalHomesOf(pipeline: Readonly<Pipeline> | null, job: Readonly<Pick<Job, 'entity' | 'stage'>>): string[] {
  if (job.entity === undefined || job.stage !== TicketStageUtil.stageNumberOf('build')) return [];
  const entities = entitiesOf(pipeline);
  return whitelistOf(entities, job.entity).flatMap((packageKey) => homesOf(entities, packageKey));
}

/**
 * The whitelisted packages a stage 1 branch changed, in the order their stages run (a package before the packages that consume it): the
 * owners of `changedPaths`, given as git spells them, that the home entity whitelists. None for a branch that stayed in its entity.
 */
function crossedPackagesOf(pipeline: Readonly<Pipeline> | null, homeEntity: EntityKey, changedPaths: readonly string[]): EntityKey[] {
  const entities = entitiesOf(pipeline);
  const whitelist = whitelistOf(entities, homeEntity);
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
  return join(WatcherFleet.jobFolderOf(trackerDirectory, jobId), STAGE_STATEMENT_FILE);
}

function writeStageStatement(trackerDirectory: string, jobId: string, statement: StageStatement): void {
  mkdirSync(WatcherFleet.jobFolderOf(trackerDirectory, jobId), { recursive: true });
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
  if (fieldOf(stored, 'stage') === 'package-build' && typeof exposedSurfaceChanged === 'boolean') return { stage: 'package-build', exposedSurfaceChanged };
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
 * Whether `adapt` is skipped (C15, A1): for every crossed package the package builder stated that what the package exposes did not change
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
      const whitelistedPackages = whitelistOf(entitiesOf(pipeline), jobStage.entity);
      return whitelistedPackages.length === 0 ? null : { stage: 'build', whitelistedPackages: [...whitelistedPackages] };
    },
    'package-build':  () => ({ stage: 'package-build', homeEntity }),
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
  adaptIsSkipped,
  confirmedExposedSurfaceChangedOf,
  sealedPackagesOf,
  crossingStageFactsOf,
});
