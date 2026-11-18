/**
 * The real answers of this platform for the Watcher socket folder and the files in it: the mode bits on macOS and Linux, and what `icacls`
 * prints on Windows. What matters is the folder: a socket file another user could reach is guarded by the owner-only folder above it.
 */
import { writeFileSync }          from 'node:fs';
import { createServer }           from 'node:net';
import { userInfo }               from 'node:os';
import { join }                   from 'node:path';
import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }                                   from '../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { ownerOnlyFilesFor }                              from './OwnerOnlyFilesFor.ts';
import { REAL_POSIX_OWNER_ONLY_PRIMITIVES }               from './PosixOwnerOnlyFiles.ts';
import { REAL_WINDOWS_OWNER_ONLY_PRIMITIVES }             from './WindowsOwnerOnlyFiles.ts';

const OWNER_ONLY_CALL_SHAPES = {
  SOCKET_FOLDER:   'access <socket folder>, after restrictFolder',
  SOCKET_FILE:     'access <socket file>, as a listener made it in the restricted folder',
  RESTRICTED_FILE: 'access <file>, after restrictFile in the restricted folder',
} as const;

const PERMISSION_BITS = 0o777;
const OCTAL = 8;
const IS_WINDOWS = process.platform === 'win32';

const scratchFolders: string[] = [];

afterAll(() => {
  for (const folder of scratchFolders) removeScratchDirectory(folder);
});

/** The mode bits as octal digits on POSIX; on Windows what `icacls` prints, its path and the user's name made placeholders. */
function accessOf(path: string, placeholder: string): string | null {
  if (!IS_WINDOWS) return (REAL_POSIX_OWNER_ONLY_PRIMITIVES.modeOf(path) & PERMISSION_BITS).toString(OCTAL);
  const accessList = REAL_WINDOWS_OWNER_ONLY_PRIMITIVES.accessListOf(path);
  return accessList?.replaceAll(path, placeholder).replaceAll(userInfo().username, '<user>') ?? null;
}

function restrictedSocketFolder(): string {
  // The short prefix keeps a socket path under the macOS limit inside the scratch root.
  const monitorFolder = createScratchDirectory('o');
  scratchFolders.push(monitorFolder);
  const socketFolder = join(monitorFolder, 'private');
  ownerOnlyFilesFor(process.platform).restrictFolder(socketFolder);
  return socketFolder;
}

test('the socket folder is owner-only after restrictFolder', () => {
  const socketFolder = restrictedSocketFolder();
  const access = accessOf(socketFolder, '<socket folder>');
  recordAnswer(OWNER_ONLY_CALL_SHAPES.SOCKET_FOLDER, access);
  expect(ownerOnlyFilesFor(process.platform).isOwnerOnly(socketFolder)).toBe(true);
});

test('a socket file a listener made in the restricted folder keeps the mode the listener gave it', async () => {
  if (IS_WINDOWS) {
    recordAnswer(OWNER_ONLY_CALL_SHAPES.SOCKET_FILE, 'no file: the endpoint is a named pipe');
    return;
  }
  const socketPath = join(restrictedSocketFolder(), 'a.sock');
  const server = createServer(() => undefined);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve());
  });
  const access = accessOf(socketPath, '<socket file>');
  server.close();
  recordAnswer(OWNER_ONLY_CALL_SHAPES.SOCKET_FILE, access);
  expect(access).not.toBeNull();
});

test('a file in the restricted folder is owner-only after restrictFile', () => {
  const filePath = join(restrictedSocketFolder(), 'secret');
  writeFileSync(filePath, 'example secret');
  ownerOnlyFilesFor(process.platform).restrictFile(filePath);
  const access = accessOf(filePath, '<file>');
  recordAnswer(OWNER_ONLY_CALL_SHAPES.RESTRICTED_FILE, access);
  expect(ownerOnlyFilesFor(process.platform).isOwnerOnly(filePath)).toBe(true);
});
