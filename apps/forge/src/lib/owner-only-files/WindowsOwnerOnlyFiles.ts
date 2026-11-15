/**
 * Windows keeps what is secret under the user's profile, whose inherited ACL is the guarantee: nothing here writes an ACL. A restriction reads
 * the ACL back through the absolute `icacls.exe` and refuses a path it cannot prove, so a folder outside the profile fails at its first use.
 * Trustee names are read in English: another display language reads as not owner-only, which fails closed.
 */
import { mkdirSync } from 'node:fs';
import { userInfo }  from 'node:os';

import type { OwnerOnlyFiles } from './OwnerOnlyFiles.ts';

export interface WindowsOwnerOnlyPrimitives {
  readonly createFolder:    (folder: string) => void;
  /** What `icacls` prints for the path; `null` when it cannot run or exits with a failure. */
  readonly accessListOf:    (path: string) => string | null;
  readonly currentUserName: () => string;
}

const ICACLS_PATH = 'C:\\Windows\\System32\\icacls.exe';

const SUCCESS_EXIT_CODE = 0;

const ACCESS_ENTRY_PATTERN = /^(?<trustee>.+?):(?:\([A-Z,]+\))+$/;

const ALWAYS_ALLOWED_TRUSTEES: readonly string[] = ['nt authority\\system', 'builtin\\administrators'];

function runIcacls(path: string): string | null {
  try {
    const finished = Bun.spawnSync({
      cmd: [ICACLS_PATH, path], stdout: 'pipe', stderr: 'pipe', windowsHide: true
    });
    return finished.exitCode === SUCCESS_EXIT_CODE ? finished.stdout.toString() : null;
  } catch {
    return null;
  }
}

export const REAL_WINDOWS_OWNER_ONLY_PRIMITIVES: WindowsOwnerOnlyPrimitives = Object.freeze({
  createFolder: (folder: string) => {
    mkdirSync(folder, { recursive: true });
  },
  accessListOf:    runIcacls,
  currentUserName: () => userInfo().username,
});

/** The entries icacls prints before its first blank line, the first of them after the path; `null` when the text has another shape. */
function accessEntriesOf(accessList: string, path: string): string[] | null {
  if (!accessList.startsWith(path)) return null;
  const [entryBlock = ''] = accessList.slice(path.length).split(/\r?\n[ \t]*\r?\n/);
  const entries = entryBlock.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry !== '');
  return entries.length === 0 ? null : entries;
}

function trusteeIsAllowed(trustee: string, currentUserName: string): boolean {
  const name = trustee.toLowerCase();
  return ALWAYS_ALLOWED_TRUSTEES.includes(name) || name.split('\\').at(-1) === currentUserName.toLowerCase();
}

export function createWindowsOwnerOnlyFiles({ createFolder, accessListOf, currentUserName }: WindowsOwnerOnlyPrimitives): OwnerOnlyFiles {
  const isOwnerOnly = (path: string): boolean => {
    const accessList = accessListOf(path);
    if (accessList === null) return false;
    const entries = accessEntriesOf(accessList, path);
    if (entries === null) return false;
    return entries.every((entry) => {
      const trustee = ACCESS_ENTRY_PATTERN.exec(entry)?.groups?.['trustee'];
      return trustee !== undefined && trusteeIsAllowed(trustee, currentUserName());
    });
  };
  const requireOwnerOnly = (path: string): void => {
    if (!isOwnerOnly(path)) throw new Error(`the ACL of ${path} is not proved owner-only`);
  };
  return Object.freeze<OwnerOnlyFiles>({
    restrictFolder: (folder) => {
      createFolder(folder);
      requireOwnerOnly(folder);
    },
    restrictFile: requireOwnerOnly,
    isOwnerOnly,
  });
}
