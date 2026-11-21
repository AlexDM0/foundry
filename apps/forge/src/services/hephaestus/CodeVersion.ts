/**
 * The version of the program's code as it stands on disk: a content hash over its shipping files, the workspace packages it depends on
 * and its part of the workspace's `bun.lock`, so a landing, a pull or an edit in the checkout the binary links to reads as new code,
 * while a spec, a timestamp, a checkout's path or a dependency only another workspace member uses never does.
 */
import { createHash }                          from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep }                 from 'node:path';

import { workspaceRootOf }           from '../../shared/WorkspaceRoot.ts';
import { lockfileDependencyGraphOf } from './LockfileDependencyGraph.ts';

const PROGRAM_ROOT = join(import.meta.dir, '..', '..', '..');

const SHIPPING_FILES   = ['agent-progress.ts', 'talos.ts', 'package.json'];
const SHIPPING_FOLDERS = ['cli', 'src', 'resources', 'skills'];
const LOCKFILE_NAME    = 'bun.lock';

const SKIPPED_FOLDER_NAMES = new Set(['node_modules', 'testing']);
/** Specs, a package's DOM specs among them, and a package's stories ship nothing. */
const UNSHIPPED_FILE_SUFFIXES = ['.spec.ts', '.dom.tsx', '.stories.tsx'];
/** A package's tool folders, such as `.storybook`, ship nothing; the program's shipping folders hold none. */
const HIDDEN_ENTRY_PREFIX  = '.';

const CODE_VERSION_LENGTH_CHARACTERS = 12;

function filesUnder(folderPath: string): string[] {
  let entryNames: string[];
  try {
    entryNames = readdirSync(folderPath);
  } catch {
    return [];
  }
  return entryNames.flatMap((entryName) => {
    if (entryName.startsWith(HIDDEN_ENTRY_PREFIX)) return [];
    const entryPath = join(folderPath, entryName);
    const entry     = statSync(entryPath, { throwIfNoEntry: false });
    if (entry === undefined) return [];
    if (entry.isDirectory()) return SKIPPED_FOLDER_NAMES.has(entryName) ? [] : filesUnder(entryPath);
    return UNSHIPPED_FILE_SUFFIXES.some((suffix) => entryName.endsWith(suffix)) ? [] : [entryPath];
  });
}

function lockfileTextIn(workspaceRoot: string): string {
  try {
    return readFileSync(join(workspaceRoot, LOCKFILE_NAME), 'utf8');
  } catch {
    return '';
  }
}

function codeVersionOf(programRoot: string): string {
  const workspaceRoot     = workspaceRootOf(programRoot) ?? programRoot;
  const programFolder     = relative(workspaceRoot, programRoot).split(sep).join('/');
  const dependencyGraph   = lockfileDependencyGraphOf(lockfileTextIn(workspaceRoot), programFolder);
  const dependencyFolders = dependencyGraph.workspaceFolders.filter((folder) => folder !== programFolder).map((folder) => join(workspaceRoot, folder));
  const filePaths = [
    ...SHIPPING_FILES.map((fileName) => join(programRoot, fileName)),
    ...SHIPPING_FOLDERS.flatMap((folderName) => filesUnder(join(programRoot, folderName))),
    ...dependencyFolders.flatMap(filesUnder),
  ].sort();
  const digest = createHash('sha256');
  for (const filePath of filePaths) {
    let contents: Buffer;
    try {
      contents = readFileSync(filePath);
    } catch {
      continue;
    }
    digest.update(relative(workspaceRoot, filePath)).update('\0').update(contents).update('\0');
  }
  digest.update(LOCKFILE_NAME).update('\0').update(JSON.stringify(dependencyGraph.entries));
  return digest.digest('hex').slice(0, CODE_VERSION_LENGTH_CHARACTERS);
}

/** The code on disk of the program this module belongs to. */
function onDisk(): string {
  return codeVersionOf(PROGRAM_ROOT);
}

export const CodeVersion = Object.freeze({ onDisk, codeVersionOf });
