/** What every part of the Airlocks reads of a slot's job, the board and git, outside any hold's writes. */
import type { Job, Airlock }                      from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline, PipelineGate } from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                             from '../../domain/tracker-model/Board.ts';
import { BoardRefusal }                           from '../../domain/tracker-model/BoardRefusal.ts';
import { PipelineUtil }                           from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { readCurrentBranch }                      from '../../lib/git/BranchIntegration.ts';
import { GitProcess }                             from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                           from '../../lib/git/GitWorktrees.ts';
import { OperationRefusal }                       from '../../shared/OperationRefusal.ts';
import type { CrossingLanding }                   from '../lifecycle/MergeRun.ts';

export function treeOfCommit(worktree: string, commit: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

/** The red gate a handoff names: from the pipeline of the entity whose gate it is, or from the forge's own gates without one. */
export function redGateOf(pipeline: Readonly<Pipeline> | null, entityKey: EntityKey | undefined, gateName: string): PipelineGate | undefined {
  const gatesPipeline = pipeline === null || entityKey === undefined ? pipeline : PipelineUtil.pipelineOfEntity(pipeline, entityKey);
  return gatesPipeline?.gates.find((gate) => gate.name === gateName);
}

export function slotOf(job: Readonly<Job>): Readonly<Airlock> {
  if (job.airlock === undefined) throw new OperationRefusal('unrepaired', { kind: 'merge-job-holds-no-slot', jobId: job.id });
  return job.airlock;
}

export function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

export function isRefresh(job: Readonly<Job>): boolean {
  return job.kind === 'refresh';
}

export function isConstitutionCommit(job: Readonly<Job>): boolean {
  return job.kind === 'constitution-commit';
}

export function mergeAgentOf(board: Board, job: Readonly<Job>): Readonly<Job> | undefined {
  return board.jobs().find((candidate) => candidate.kind === 'merge-agent' && candidate.parentJobId === job.id);
}

export function uncommittedPathsOf(directory: string): string[] | null {
  const status = GitProcess.run(directory, ['status', '--porcelain=v1', '--untracked-files=no'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  if (!GitProcess.succeeded(status)) return null;
  return status.standardOutput.split('\n').filter((line) => line !== '').map((line) => line.slice('XY '.length));
}

export function pathsTheFastForwardChangesOf(directory: string, commit: string): string[] | null {
  const changed = GitProcess.run(directory, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  if (!GitProcess.succeeded(changed)) return null;
  return changed.standardOutput.split('\0').filter((path) => path !== '');
}

/** A ticket that crossed into packages, as its landing reads it; `null` for every other ticket, whose Airlock runs as it always did. */
export function crossingLandingOf(board: Board, ticketId: string): CrossingLanding | null {
  const entities = board.pipeline()?.entities;
  if (entities === undefined || board.ticketStageOf(ticketId) === null) return null;
  const homeEntity = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity;
  return homeEntity === undefined ? null : { entities, homeEntity, sealedPackages: Object.keys(board.ticketSealsOf(ticketId)) };
}

export function tailOf(output: string, lineCount: number): string {
  return output.trimEnd().split('\n').slice(-lineCount).join('\n');
}

export function currentBranchIn(directory: string): string | null {
  const branch = readCurrentBranch(directory);
  return branch.verdict === 'on-branch' ? branch.branch : null;
}

/** A refused claim (a higher priority queued meanwhile, the slot taken, a release queued) is derived again in the next round. */
export function claimed(claim: () => void): boolean {
  try {
    claim();
    return true;
  } catch (refusal) {
    if (refusal instanceof BoardRefusal) return true;
    throw refusal;
  }
}
