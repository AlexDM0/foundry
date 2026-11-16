/**
 * Where a job's session starts and what its sandbox writes. What matters: in a ticket worktree of a tracker below its repository's root the
 * session starts in the project's folder of the worktree, so it reads the project's instructions, while it writes the whole worktree; a
 * tracker at its repository's root starts at the worktree's root as it always has; and before the worktree exists a session works in a
 * folder of its own either way. The `.git` entry is planted, since finding the project's place runs no git.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';

import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { WorktreesFolder }                                from '../../shared/WorktreesFolder.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { projectLocationOf }                              from '../tracker/ProjectLocation.ts';
import { workspacePathsFor }                              from '../tracker/Workspace.ts';
import { SessionPlaces }                                  from './SessionPlace.ts';

const PROJECT_PREFIX = 'apps/forge';
const TICKET_ID = '007';
const JOB = { id: 'J4', ticketIds: [TICKET_ID] };

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function folderMade(...segments: string[]): string {
  const folder = join(...segments);
  mkdirSync(folder, { recursive: true });
  return folder;
}

/** A main checkout holding the tracker's folder at `projectPrefix`, its ticket worktree made when asked. */
function trackerIn(projectPrefix: string, withWorktree: boolean): string {
  const repository = createScratchDirectory('session-place');
  scratchDirectories.push(repository);
  folderMade(repository, '.git');
  const projectDirectory = projectPrefix === '' ? repository : folderMade(repository, projectPrefix);
  if (withWorktree) folderMade(WorktreesFolder.ticketWorktreeOf(projectDirectory, TICKET_ID));
  return projectDirectory;
}

function placeOf(projectDirectory: string): ReturnType<typeof SessionPlaces.ticketSessionPlaceOf> {
  return SessionPlaces.ticketSessionPlaceOf(workspacePathsFor(projectDirectory), projectLocationOf(projectDirectory), JOB);
}

describe('a ticket worktree', () => {
  test('of a tracker below its repository\'s root starts the session in the project\'s folder and lets it write the worktree', () => {
    const projectDirectory = trackerIn(PROJECT_PREFIX, true);
    const worktree = WorktreesFolder.ticketWorktreeOf(projectDirectory, TICKET_ID);
    expect(placeOf(projectDirectory)).toEqual({ checkout: worktree, workingDirectory: join(worktree, PROJECT_PREFIX), holdsRepository: true });
  });

  test('of a tracker at its repository\'s root starts the session at the worktree\'s root, as it always has', () => {
    const projectDirectory = trackerIn('', true);
    const worktree = WorktreesFolder.ticketWorktreeOf(projectDirectory, TICKET_ID);
    expect(placeOf(projectDirectory)).toEqual({ checkout: worktree, workingDirectory: worktree, holdsRepository: true });
  });
});

describe('no worktree yet', () => {
  test.each([['below its repository\'s root', PROJECT_PREFIX], ['at its repository\'s root', '']])(
    'a tracker %s works in a session folder of its own, made for it',
    (_placeName, projectPrefix) => {
      const projectDirectory = trackerIn(projectPrefix, false);
      const sessionFolder = join(WorktreesFolder.worktreesRootOf(projectDirectory), 'sessions', JOB.id);
      expect(placeOf(projectDirectory)).toEqual({ checkout: sessionFolder, workingDirectory: sessionFolder, holdsRepository: false });
      expect(existsSync(sessionFolder)).toBe(true);
    },
  );
});

test('a pipeline agent\'s snapshot, a checkout of the whole repository, starts its session in the project\'s folder of it', () => {
  const projectDirectory = trackerIn(PROJECT_PREFIX, false);
  const snapshot = join(WorktreesFolder.worktreesRootOf(projectDirectory), 'pipeline-agent', 'S1');
  expect(SessionPlaces.sessionPlaceOf(projectLocationOf(projectDirectory), snapshot, true).workingDirectory).toBe(join(snapshot, PROJECT_PREFIX));
});
