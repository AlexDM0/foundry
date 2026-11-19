/**
 * Where an agent session works: the folder its sandbox writes and the folder it starts in. A session in a job's worktree starts at the
 * worktree's root, where its confinement grants the worktree's own git admin folder, so it commits; a pipeline agent's snapshot, which it
 * only reads, starts in the tracker's project folder of it. In a folder of its own, or for a tracker at its repository's root, the folders
 * are one. A job of an entity of a top-level forge starts at the worktree's root too; its file-change rules, not its start, keep it to its
 * stage's folders. A resumed session starts where it began when its agent finds it by that folder.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep
} from 'node:path';

import type { AgentCapabilities }                          from '../../lib/agent-launch/AgentAdapter.ts';
import { childRecordOf }                                   from '../../lib/talos/ChildRecord.ts';
import { childFilesOf }                                    from '../../lib/talos/TalosFiles.ts';
import type { Job }                                        from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineGate }                               from '../../lib/tracker-model/@types/Pipeline.ts';
import { FIRST_CHILD_INSTANCE }                            from '../../lib/tracker-model/constants/JobStates.ts';
import { WorktreesFolder }                                 from '../../shared/WorktreesFolder.ts';
import { ProjectPathsUtil }                                from '../../shared/utils/ProjectPathsUtil.ts';
import { type ProjectLocation, worktreeProjectLocationOf } from '../tracker/ProjectLocation.ts';
import type { Workspace }                                  from '../tracker/Workspace.ts';

const GIT_SEPARATOR = '/';
const PARENT_FOLDER = '..';

export interface SessionPlace {
  checkout:               string;
  workingDirectory:       string;
  /** A checkout of the whole repository, not a folder of the session's own. */
  holdsRepository:        boolean;
  /** The tracker's project folder from the folder the session starts in, `/`-separated; `''` when it starts there or in a folder of its own. */
  projectFolderFromStart: string;
}

/** A checkout of the whole repository that the session only reads, a pipeline agent's snapshot: it starts in the project's folder of it. */
function snapshotSessionPlaceOf(location: ProjectLocation, snapshot: string): SessionPlace {
  const { projectDirectoryInWorktree } = worktreeProjectLocationOf(location, snapshot);
  return {
    checkout: snapshot, workingDirectory: projectDirectoryInWorktree, holdsRepository: true, projectFolderFromStart: ''
  };
}

function ticketSessionPlaceOf(workspace: Workspace, location: ProjectLocation, job: Readonly<Pick<Job, 'id' | 'ticketIds'>>): SessionPlace {
  const [ticketId] = job.ticketIds;
  const ticketWorktree = ticketId === undefined ? null : WorktreesFolder.ticketWorktreeOf(workspace.rootDirectory, ticketId);
  if (ticketWorktree !== null && existsSync(ticketWorktree)) {
    return {
      checkout: ticketWorktree, workingDirectory: ticketWorktree, holdsRepository: true, projectFolderFromStart: location.projectPrefix
    };
  }
  // Preparing a ticket's worktree is a later step of the chain; until it exists the session works in a folder of its own.
  const sessionFolder = join(WorktreesFolder.worktreesRootOf(workspace.rootDirectory), 'sessions', job.id);
  mkdirSync(sessionFolder, { recursive: true });
  return {
    checkout: sessionFolder, workingDirectory: sessionFolder, holdsRepository: false, projectFolderFromStart: ''
  };
}

/** The folder the first instance of a session owner's job started in, as its child record keeps it; `null` when no readable record says. */
function firstStartFolderOf(sessionOwnerJobFolder: string): string | null {
  const { recordPath } = childFilesOf(dirname(sessionOwnerJobFolder), basename(sessionOwnerJobFolder), FIRST_CHILD_INSTANCE);
  let text: string;
  try {
    text = readFileSync(recordPath, 'utf8');
  } catch {
    return null;
  }
  const reading = childRecordOf(text);
  return reading.verdict === 'read' ? reading.record.workingDirectory : null;
}

function folderLiesInCheckout(checkout: string, folder: string): boolean {
  const placeInCheckout = relative(checkout, folder);
  return !isAbsolute(placeInCheckout) && placeInCheckout.split(sep)[0] !== PARENT_FOLDER;
}

/**
 * A resumed session whose agent finds it by its folder starts in the folder its first instance started in, so a session started in the
 * project's folder before sessions started at the worktree's root still resumes. An agent that finds it otherwise, a first start outside the
 * checkout, or none recorded, leaves the place as it is.
 */
function resumedSessionPlaceOf(
  place: SessionPlace, sessionOwnerJobFolder: string, capabilities: Pick<AgentCapabilities, 'resumeFindsSessionByFolder'>
): SessionPlace {
  if (!capabilities.resumeFindsSessionByFolder) return place;
  const firstStartFolder = firstStartFolderOf(sessionOwnerJobFolder);
  if (firstStartFolder === null || !folderLiesInCheckout(place.checkout, firstStartFolder)) return place;
  const projectFolder = join(place.workingDirectory, place.projectFolderFromStart);
  return { ...place, workingDirectory: firstStartFolder, projectFolderFromStart: relative(firstStartFolder, projectFolder).split(sep).join(GIT_SEPARATOR) };
}

/**
 * The stored gates as a session reads them, each folder from where it starts: from the root of a folder tracker's worktree a gate with no
 * `in` runs in the project's folder. A session that starts in the project's folder reads them as stored.
 */
function gatesFromStartOf(place: SessionPlace, gates: readonly Readonly<PipelineGate>[]): readonly Readonly<PipelineGate>[] {
  if (place.projectFolderFromStart === '') return gates;
  return gates.map((gate) => {
    const folderFromStart = ProjectPathsUtil.toRepositoryPath(place.projectFolderFromStart, gate.in ?? '');
    const gateFromStart: PipelineGate = { ...gate };
    delete gateFromStart.in;
    return folderFromStart === '' ? gateFromStart : { ...gateFromStart, in: folderFromStart };
  });
}

export const SessionPlaces = Object.freeze({
  snapshotSessionPlaceOf, ticketSessionPlaceOf, resumedSessionPlaceOf, gatesFromStartOf
});
