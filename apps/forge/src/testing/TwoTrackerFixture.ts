/**
 * The fixture repository of two sibling trackers and a shared package: forge's tracker in `apps/forge`, Gaia's in `apps/gaia`, the
 * workspace's root files, the hooks folder, both levels of instruction files and a person's checkout in `.claude/worktrees`. It names each
 * place a tracker asks git from, and writes the tracked files; `src/lib/git/TwoTrackerFixture.integration.spec.ts` builds its git states.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import { branchNamesOf }   from '../shared/BranchNames.ts';
import { WorktreesFolder } from '../shared/WorktreesFolder.ts';
import { PRODUCT_NAMES }   from '../shared/constants/ProductNames.ts';

export const TWO_TRACKER_MAIN_LINE = 'main';
export const TWO_TRACKER_HOOKS_FOLDER = '.githooks';
export const TWO_TRACKER_TICKET_ID = '001';
export const TWO_TRACKER_PERSON_BRANCH = 'person';
export const TWO_TRACKER_TAG = 'example-tag';

/** The two trackers: each project's folder below the repository and the branch namespace its tickets are made in. */
export const TWO_TRACKER_PROJECTS = {
  FORGE: { folder: 'apps/forge', namespace: 'forge' },
  GAIA:  { folder: 'apps/gaia', namespace: 'gaia' },
} as const;

export type TwoTrackerProject = typeof TWO_TRACKER_PROJECTS[keyof typeof TWO_TRACKER_PROJECTS];

export const TWO_TRACKER_SHARED_PACKAGE_FOLDER = 'packages/design-system';
export const TWO_TRACKER_PERSON_CHECKOUT_FOLDER = '.claude/worktrees/person';

/** The file each ticket of the fixture changes in its own project, and the shared package's file forge's ticket also changes. */
export const TWO_TRACKER_PROJECT_SOURCE_FILE = 'src/Example.ts';
export const TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE = `${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/src/Example.ts`;

export function ticketBranchOfProject(project: TwoTrackerProject): string {
  return `${project.namespace}/${branchNamesOf(null).ticketBranchOf(TWO_TRACKER_TICKET_ID)}`;
}

/** The ticket's worktree, a checkout of the whole repository inside its project's worktrees folder. */
export function ticketWorktreeFolderOf(project: TwoTrackerProject): string {
  return WorktreesFolder.ticketWorktreeOf(project.folder, TWO_TRACKER_TICKET_ID);
}

/** What a place is: a toplevel (the main checkout, the person's checkout, a ticket worktree), or a project or package folder below one. */
export type TwoTrackerPlaceKind = 'main checkout' | 'person checkout' | 'ticket worktree' | 'project' | 'shared package';

/** Each folder below the repository git is asked from. */
export interface TwoTrackerPlace {
  readonly folder: string;
  readonly kind:   TwoTrackerPlaceKind;
}

const TOPLEVEL_KINDS: ReadonlySet<TwoTrackerPlaceKind> = new Set(['main checkout', 'person checkout', 'ticket worktree']);

export function placeIsAToplevel(place: TwoTrackerPlace): boolean {
  return TOPLEVEL_KINDS.has(place.kind);
}

/** A ticket worktree and the project folder inside it exist only once the tickets are made. */
export function placeIsMadeWithTheTickets(place: TwoTrackerPlace): boolean {
  return place.folder.includes(PRODUCT_NAMES.WORKTREES_FOLDER);
}

/** Every place of the fixture. */
export function twoTrackerPlaces(): readonly TwoTrackerPlace[] {
  const projects = Object.values(TWO_TRACKER_PROJECTS);
  return [
    { folder: '', kind: 'main checkout' },
    ...projects.map((project): TwoTrackerPlace => ({ folder: project.folder, kind: 'project' })),
    { folder: TWO_TRACKER_SHARED_PACKAGE_FOLDER, kind: 'shared package' },
    { folder: TWO_TRACKER_PERSON_CHECKOUT_FOLDER, kind: 'person checkout' },
    { folder: join(TWO_TRACKER_PERSON_CHECKOUT_FOLDER, TWO_TRACKER_PROJECTS.GAIA.folder), kind: 'project' },
    ...projects.flatMap((project): TwoTrackerPlace[] => [
      { folder: ticketWorktreeFolderOf(project), kind: 'ticket worktree' },
      { folder: join(ticketWorktreeFolderOf(project), project.folder), kind: 'project' },
    ]),
  ];
}

const IGNORED_BY_A_TRACKER = `${PRODUCT_NAMES.DATA_FOLDER}/\n${PRODUCT_NAMES.WORKTREES_FOLDER}/\n`;
const PASSING_HOOK = '#!/bin/sh\nexit 0\n';
const EXECUTABLE_FILE_MODE = 0o755;

function projectFilesOf(project: TwoTrackerProject): Record<string, string> {
  return {
    [`${project.folder}/package.json`]:                       `{ "name": "example-${project.namespace}", "private": true }\n`,
    [`${project.folder}/.gitignore`]:                         IGNORED_BY_A_TRACKER,
    [`${project.folder}/CLAUDE.md`]:                          `# Example ${project.namespace} instructions\n`,
    [`${project.folder}/CONSTITUTION.md`]:                    `# Example ${project.namespace} rules\n`,
    [`${project.folder}/${TWO_TRACKER_PROJECT_SOURCE_FILE}`]: `export const ${project.namespace}Example = 1;\n`,
  };
}

/** The tracked files of the main line at its start, by path below the repository. */
export const TWO_TRACKER_TRACKED_FILES: Readonly<Record<string, string>> = {
  'package.json':                                        '{ "name": "example-workspace", "private": true, "workspaces": ["apps/*", "packages/*"] }\n',
  'bun.lock':                                            '{ "lockfileVersion": 1, "workspaces": {} }\n',
  'turbo.json':                                          '{ "tasks": { "verify": {} } }\n',
  '.gitignore':                                          '.claude/worktrees/\nnode_modules/\n.turbo/\n',
  'CLAUDE.md':                                           '# Example workspace instructions\n',
  'CONSTITUTION.md':                                     '# Example workspace rules\n',
  [`${TWO_TRACKER_HOOKS_FOLDER}/pre-commit`]:            PASSING_HOOK,
  [`${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/package.json`]: '{ "name": "example-design-system", "private": true }\n',
  [TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE]:              'export const sharedExample = 1;\n',
  ...projectFilesOf(TWO_TRACKER_PROJECTS.FORGE),
  ...projectFilesOf(TWO_TRACKER_PROJECTS.GAIA),
};

/** Writes the tracked files into `repositoryDirectory`, and each project's data folder, which its `.gitignore` keeps out of git. */
export function writeTwoTrackerFiles(repositoryDirectory: string): void {
  for (const [path, text] of Object.entries(TWO_TRACKER_TRACKED_FILES)) {
    const filePath = join(repositoryDirectory, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, text, path.startsWith(`${TWO_TRACKER_HOOKS_FOLDER}/`) ? { mode: EXECUTABLE_FILE_MODE } : {});
  }
  for (const project of Object.values(TWO_TRACKER_PROJECTS)) mkdirSync(join(repositoryDirectory, project.folder, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
}
