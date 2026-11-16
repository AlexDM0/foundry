/**
 * Where an agent session works: the folder its sandbox writes and the folder it starts in. In a checkout of the repository it starts in the
 * tracker's project folder of that checkout, so a tracker below the repository root reads its own instructions there; in a folder of its own,
 * or for a tracker at its repository's root, the two are one folder.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';

import type { Job }                                        from '../../lib/tracker-model/@types/Job.ts';
import { WorktreesFolder }                                 from '../../shared/WorktreesFolder.ts';
import { type ProjectLocation, worktreeProjectLocationOf } from '../tracker/ProjectLocation.ts';
import type { Workspace }                                  from '../tracker/Workspace.ts';

export interface SessionPlace {
  checkout:         string;
  workingDirectory: string;
  /** A checkout of the whole repository, not a folder of the session's own. */
  holdsRepository:  boolean;
}

function sessionPlaceOf(location: ProjectLocation, checkout: string, holdsRepository: boolean): SessionPlace {
  const workingDirectory = holdsRepository ? worktreeProjectLocationOf(location, checkout).projectDirectoryInWorktree : checkout;
  return { checkout, workingDirectory, holdsRepository };
}

function ticketSessionPlaceOf(workspace: Workspace, location: ProjectLocation, job: Readonly<Pick<Job, 'id' | 'ticketIds'>>): SessionPlace {
  const [ticketId] = job.ticketIds;
  const ticketWorktree = ticketId === undefined ? null : WorktreesFolder.ticketWorktreeOf(workspace.rootDirectory, ticketId);
  if (ticketWorktree !== null && existsSync(ticketWorktree)) return sessionPlaceOf(location, ticketWorktree, true);
  // Preparing a ticket's worktree is a later step of the chain; until it exists the session works in a folder of its own.
  const sessionFolder = join(WorktreesFolder.worktreesRootOf(workspace.rootDirectory), 'sessions', job.id);
  mkdirSync(sessionFolder, { recursive: true });
  return sessionPlaceOf(location, sessionFolder, false);
}

export const SessionPlaces = Object.freeze({ sessionPlaceOf, ticketSessionPlaceOf });
