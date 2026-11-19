/**
 * Where a job's session starts and what its sandbox writes. What matters: in a ticket worktree of a tracker below its repository's root the
 * session starts at the worktree's root, where its confinement lets it commit, and knows the project's folder from there; a tracker
 * at its repository's root starts at the worktree's root as it always has, a job of an entity of a top-level forge too; before the
 * worktree exists a session works in a folder of its own either way; a pipeline agent's snapshot, which it only reads, still starts in
 * the project's folder of it; and a resumed session whose agent finds it by its folder starts where its first instance started, a project
 * folder from before the change included, but never outside its checkout, while one whose agent does not starts in today's place. The
 * gates a session reads name each folder from where it starts. The `.git` entry is planted, since finding the project's place runs no git.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';

import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import type { PipelineGate }                              from '../../lib/tracker-model/@types/Pipeline.ts';
import { WorktreesFolder }                                from '../../shared/WorktreesFolder.ts';
import { PlantedChild }                                   from '../../testing/PlantedChild.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { projectLocationOf }                              from '../tracker/ProjectLocation.ts';
import { workspacePathsFor }                              from '../tracker/Workspace.ts';
import { type SessionPlace, SessionPlaces }               from './SessionPlace.ts';

const PROJECT_PREFIX = 'apps/forge';
const FINDS_SESSION_BY_FOLDER = { resumeFindsSessionByFolder: true } as const;
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

function placeOf(projectDirectory: string): SessionPlace {
  return SessionPlaces.ticketSessionPlaceOf(workspacePathsFor(projectDirectory), projectLocationOf(projectDirectory), JOB);
}

/** A job folder whose first instance's launch file records the folder its session started in. */
function sessionOwnerJobFolderStartedIn(startFolder: string): string {
  const boardFolder = createScratchDirectory('session-owner');
  scratchDirectories.push(boardFolder);
  PlantedChild.plantChildRecord({ boardFolder, childFolder: 'J1', instance: 1 }, { workingDirectory: startFolder });
  return join(boardFolder, 'J1');
}

describe('a ticket worktree', () => {
  test('of a tracker below its repository\'s root starts the session at the worktree\'s root, the project\'s folder named from there', () => {
    const projectDirectory = trackerIn(PROJECT_PREFIX, true);
    const worktree = WorktreesFolder.ticketWorktreeOf(projectDirectory, TICKET_ID);
    expect(placeOf(projectDirectory)).toEqual({
      checkout: worktree, workingDirectory: worktree, holdsRepository: true, projectFolderFromStart: PROJECT_PREFIX
    });
  });

  test('of a tracker at its repository\'s root starts the session at the worktree\'s root, as it always has', () => {
    const projectDirectory = trackerIn('', true);
    const worktree = WorktreesFolder.ticketWorktreeOf(projectDirectory, TICKET_ID);
    expect(placeOf(projectDirectory)).toEqual({
      checkout: worktree, workingDirectory: worktree, holdsRepository: true, projectFolderFromStart: ''
    });
  });

  test('of a top-level forge starts a job of an entity at the worktree\'s root, never in the entity\'s home', () => {
    const projectDirectory = trackerIn('', true);
    const worktree = WorktreesFolder.ticketWorktreeOf(projectDirectory, TICKET_ID);
    const entityJob = { ...JOB, entity: 'gaia', stage: 2 };
    expect(SessionPlaces.ticketSessionPlaceOf(workspacePathsFor(projectDirectory), projectLocationOf(projectDirectory), entityJob)).toEqual({
      checkout: worktree, workingDirectory: worktree, holdsRepository: true, projectFolderFromStart: ''
    });
  });
});

describe('no worktree yet', () => {
  test.each([['below its repository\'s root', PROJECT_PREFIX], ['at its repository\'s root', '']])(
    'a tracker %s works in a session folder of its own, made for it',
    (_placeName, projectPrefix) => {
      const projectDirectory = trackerIn(projectPrefix, false);
      const sessionFolder = join(WorktreesFolder.worktreesRootOf(projectDirectory), 'sessions', JOB.id);
      expect(placeOf(projectDirectory)).toEqual({
        checkout: sessionFolder, workingDirectory: sessionFolder, holdsRepository: false, projectFolderFromStart: ''
      });
      expect(existsSync(sessionFolder)).toBe(true);
    },
  );
});

test('a pipeline agent\'s snapshot, a checkout of the whole repository it only reads, starts its session in the project\'s folder of it', () => {
  const projectDirectory = trackerIn(PROJECT_PREFIX, false);
  const snapshot = join(WorktreesFolder.worktreesRootOf(projectDirectory), 'pipeline-agent', 'S1');
  expect(SessionPlaces.snapshotSessionPlaceOf(projectLocationOf(projectDirectory), snapshot)).toEqual({
    checkout: snapshot, workingDirectory: join(snapshot, PROJECT_PREFIX), holdsRepository: true, projectFolderFromStart: ''
  });
});

describe('a resumed session', () => {
  test('first started in the project\'s folder of a folder tracker\'s worktree resumes there, the project\'s folder its own', () => {
    const projectDirectory = trackerIn(PROJECT_PREFIX, true);
    const place = placeOf(projectDirectory);
    const projectFolderInWorktree = join(place.checkout, PROJECT_PREFIX);
    const resumedPlace = SessionPlaces.resumedSessionPlaceOf(place, sessionOwnerJobFolderStartedIn(projectFolderInWorktree), FINDS_SESSION_BY_FOLDER);
    expect(resumedPlace).toEqual({ ...place, workingDirectory: projectFolderInWorktree, projectFolderFromStart: '' });
  });

  test('first started at the worktree\'s root resumes at the root', () => {
    const projectDirectory = trackerIn(PROJECT_PREFIX, true);
    const place = placeOf(projectDirectory);
    expect(SessionPlaces.resumedSessionPlaceOf(place, sessionOwnerJobFolderStartedIn(place.checkout), FINDS_SESSION_BY_FOLDER)).toEqual(place);
  });

  test('first started outside its checkout, or with no launch file, takes the place as it is', () => {
    const projectDirectory = trackerIn(PROJECT_PREFIX, true);
    const place = placeOf(projectDirectory);
    expect(SessionPlaces.resumedSessionPlaceOf(place, sessionOwnerJobFolderStartedIn(projectDirectory), FINDS_SESSION_BY_FOLDER)).toEqual(place);
    expect(SessionPlaces.resumedSessionPlaceOf(place, join(projectDirectory, 'no-such-job-folder'), FINDS_SESSION_BY_FOLDER)).toEqual(place);
  });

  test('whose agent finds it otherwise than by its folder starts in today\'s place, wherever its first instance started', () => {
    const projectDirectory = trackerIn(PROJECT_PREFIX, true);
    const place = placeOf(projectDirectory);
    const ownerJobFolder = sessionOwnerJobFolderStartedIn(join(place.checkout, PROJECT_PREFIX));
    expect(SessionPlaces.resumedSessionPlaceOf(place, ownerJobFolder, { resumeFindsSessionByFolder: false })).toEqual(place);
  });
});

describe('the gates a session reads', () => {
  const GATES: readonly PipelineGate[] = [
    { name: 'tests', run: 'bun test' },
    { name: 'lint', run: 'bun run lint', in: 'tools' },
    { name: 'workspace', run: 'bun run verify', in: '/' },
    { name: 'docs', run: 'bun run docs', in: '/docs' },
  ];

  test('at the root of a folder tracker\'s worktree name each folder from the root, a gate with no in folder in the project\'s folder', () => {
    const place = placeOf(trackerIn(PROJECT_PREFIX, true));
    expect(SessionPlaces.gatesFromStartOf(place, GATES)).toEqual([
      { name: 'tests', run: 'bun test', in: PROJECT_PREFIX },
      { name: 'lint', run: 'bun run lint', in: `${PROJECT_PREFIX}/tools` },
      { name: 'workspace', run: 'bun run verify' },
      { name: 'docs', run: 'bun run docs', in: 'docs' },
    ]);
  });

  test('are the stored gates for a session that starts in the project\'s folder: a root tracker\'s, a snapshot\'s, or one resumed there', () => {
    const rootTrackerPlace = placeOf(trackerIn('', true));
    const folderTrackerDirectory = trackerIn(PROJECT_PREFIX, true);
    const folderTrackerPlace = placeOf(folderTrackerDirectory);
    const resumedPlace = SessionPlaces.resumedSessionPlaceOf(
      folderTrackerPlace, sessionOwnerJobFolderStartedIn(join(folderTrackerPlace.checkout, PROJECT_PREFIX)), FINDS_SESSION_BY_FOLDER
    );
    const snapshotPlace = SessionPlaces.snapshotSessionPlaceOf(projectLocationOf(folderTrackerDirectory), join(folderTrackerDirectory, 'snapshot'));
    for (const place of [rootTrackerPlace, resumedPlace, snapshotPlace]) expect(SessionPlaces.gatesFromStartOf(place, GATES)).toBe(GATES);
  });
});
