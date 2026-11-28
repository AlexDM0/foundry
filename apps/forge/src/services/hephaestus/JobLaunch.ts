/**
 * What a session's launch keeps in its job folder for later checks: the job start Customs measures from, the instruction files read and
 * the launch settings, read back.
 */
import { existsSync, mkdirSync }            from 'node:fs';
import { dirname, join }                    from 'node:path';
import { createInstructionsReadWriter }     from '../../adapters/instructions-read/InstructionsReadWriter.ts';
import { type JobStart, JobStartIngestion } from '../../adapters/job-start/JobStartIngestion.ts';
import { createJobStartWriter }             from '../../adapters/job-start/JobStartWriter.ts';
import { LaunchSettingsIngestion }          from '../../adapters/launch-settings/LaunchSettingsIngestion.ts';
import { createLaunchSettingsWriter }       from '../../adapters/launch-settings/LaunchSettingsWriter.ts';
import type { Job }                         from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                       from '../../domain/tracker-model/Board.ts';
import { TicketStageUtil }                  from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { VocabularyUtil }                   from '../../domain/tracker-model/utils/VocabularyUtil.ts';
import { GitProcess }                       from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                     from '../../lib/git/GitWorktrees.ts';
import { SESSION_STOP_GRACE_MILLISECONDS }  from '../../shared/constants/HephaestusLimits.ts';
import { launchSnapshotOf }                 from '../lifecycle/CustomsLaunchSnapshot.ts';
import type { PackageBuildStart }           from './@types/JobGateRun.ts';
import type { JobLaunchContext }            from './@types/JobLaunchContext.ts';
import { DependentFixTickets }              from './DependentFixTickets.ts';
import { jobFolderIn }                      from './HephaestusFiles.ts';
import type { InstructionFileRead }         from './InstructionFiles.ts';
import { JobPipelines }                     from './JobPipelines.ts';
import { JobTicketDocuments }               from './JobTicketDocuments.ts';
import type { SessionLaunchSettings }       from './LaunchSettings.ts';
import { StoredFileUnreadable }             from './StoredFileUnreadable.ts';
import { JOB_FILES, WorktreeJobs }          from './WorktreeJobs.ts';

/** A build or review winds down, so a group its session left would hold a port and the worktree; any other job keeps its groups. */
function treeStopAtEndOf(job: Readonly<Job>): { treeStopAtEndGraceMilliseconds?: number } {
  return WorktreeJobs.isWorktreeJob(job) ? { treeStopAtEndGraceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS } : {};
}

/** The start the job's first launch kept; `null` before one was kept. */
function jobStartOf(trackerDirectory: string, jobId: string): JobStart | null | StoredFileUnreadable {
  const startFilePath = join(jobFolderIn(trackerDirectory, jobId), JOB_FILES.start);
  const reading = new JobStartIngestion(startFilePath).read();
  if (reading.verdict === 'readable') return reading.start;
  return reading.verdict === 'absent' ? null : StoredFileUnreadable.unreadableFileOf(trackerDirectory, startFilePath, reading.problem);
}

/** What a package build's start records of the entities its gate run leaves out; nothing for every other job. */
function packageBuildStartOf(board: Board, job: Readonly<Job>): PackageBuildStart {
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === WorktreeJobs.ticketIdOf(job));
  const homeEntity = TicketStageUtil.stageOfJob(job)?.name === 'package-build' ? ticket?.frontmatter.entity : undefined;
  if (ticket === undefined || homeEntity === undefined) return {};
  const dependentsFixedInGroup = DependentFixTickets.dependentsFixedInGroupOf(board, ticket.frontmatter.id, JobPipelines.dependentsOfThePackageOf(board.pipeline(), job));
  return { homeEntity, ...(dependentsFixedInGroup.length === 0 ? {} : { dependentsFixedInGroup }) };
}

/**
 * Written as the session's child is first launched: the commit verification measures from, the content hash V6 compares with, and the refs,
 * worktree HEADs and hooks folder V13 and V14 compare with.
 */
function recordJobStart(context: JobLaunchContext, board: Board, job: Readonly<Job>): void {
  const startPath = join(WorktreeJobs.jobFolderOf(context.workspace, job), JOB_FILES.start);
  if (existsSync(startPath)) return;
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === WorktreeJobs.ticketIdOf(job));
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const startCommit = GitProcess.resolvedCommitOf(worktree, 'HEAD', GitWorktrees.ceilingOf(worktree));
  const launchSnapshot = launchSnapshotOf(worktree);
  if (ticket === undefined || startCommit === null || launchSnapshot === null) return;
  const documentVersionsAtLaunch = JobTicketDocuments.ticketDocumentVersionsOf(board, ticket.frontmatter.id);
  const start: JobStart = {
    startCommit,
    contentHashAtLaunch: ticket.frontmatter.contentHash ?? '',
    ...(documentVersionsAtLaunch === '' ? {} : { documentVersionsAtLaunch }),
    launchSnapshot,
    ...packageBuildStartOf(board, job),
  };
  mkdirSync(dirname(startPath), { recursive: true });
  createJobStartWriter(startPath).write(start);
}

/** Each child instance's launch keeps the path and content hash of every instruction file its session was given. */
function recordInstructionsRead(jobFolder: string, childInstance: number, files: readonly InstructionFileRead[]): void {
  mkdirSync(jobFolder, { recursive: true });
  createInstructionsReadWriter(join(jobFolder, `${JOB_FILES.instructionsReadPrefix}${childInstance}.json`)).write(files);
}

/** Written once, at the job's first launch: every later instance resumes on it. */
function recordLaunchSettings(jobFolder: string, settings: SessionLaunchSettings): void {
  if (existsSync(join(jobFolder, JOB_FILES.launchSettings))) return;
  mkdirSync(jobFolder, { recursive: true });
  createLaunchSettingsWriter(join(jobFolder, JOB_FILES.launchSettings)).write(settings);
}

/**
 * The pair the job's first launch recorded; `null` with none, or one naming a model or effort forge no longer offers, which a later forge
 * may have retired, so the session's pair is resolved again as before. A pair that cannot be read stops the launch that reads it.
 */
function recordedLaunchSettingsOf(trackerDirectory: string, jobId: string): SessionLaunchSettings | null | StoredFileUnreadable {
  const settingsFilePath = join(jobFolderIn(trackerDirectory, jobId), JOB_FILES.launchSettings);
  const recorded = new LaunchSettingsIngestion(settingsFilePath).read();
  if (recorded.verdict === 'absent') return null;
  if (recorded.verdict === 'unreadable') return StoredFileUnreadable.unreadableFileOf(trackerDirectory, settingsFilePath, recorded.problem);
  const { model, effort } = recorded.settings;
  return VocabularyUtil.agentModelIsKnown(model) && VocabularyUtil.agentEffortIsKnown(effort) ? { model, effort } : null;
}

export const JobLaunch = Object.freeze({
  treeStopAtEndOf,
  jobStartOf,
  packageBuildStartOf,
  recordJobStart,
  recordInstructionsRead,
  recordLaunchSettings,
  recordedLaunchSettingsOf,
});
