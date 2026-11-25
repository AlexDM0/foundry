/**
 * One contract for the `ProgramFolders` port: every folder is absolute under the adapter's own path module, the home folders sit under the
 * home given, and no folder is named twice. Then each OS's own folders in order, since a program is looked for first where it is listed
 * first; that Windows finds a program by its `PATHEXT` extensions, never bare; and that Windows names no folder under a root its machine does not
 * name drive-absolute.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { describe, expect, test } from 'bun:test';

import { type PortClause, runPortContract }                            from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory }              from '../../testing/ScratchWorkspace.ts';
import { DARWIN_PROGRAM_FOLDERS }                                      from './DarwinProgramFolders.ts';
import { LINUX_PROGRAM_FOLDERS }                                       from './LinuxProgramFolders.ts';
import type { ProgramFolders }                                         from './ProgramFolders.ts';
import { programFoldersFor }                                           from './ProgramFoldersFor.ts';
import { createWindowsProgramFolders, type WindowsProgramFolderRoots } from './WindowsProgramFolders.ts';

const WINDOWS_ROOTS: WindowsProgramFolderRoots = {
  systemRoot:                   () => 'C:\\Windows',
  localApplicationDataFolder:   () => 'C:\\Users\\example\\AppData\\Local',
  roamingApplicationDataFolder: () => 'C:\\Users\\example\\AppData\\Roaming',
  programFilesFolder:           () => 'C:\\Program Files',
  programExtensions:            () => '.COM;.EXE;.BAT;.CMD',
};

const clausesOf = (homeDirectory: string): readonly PortClause<ProgramFolders>[] => [{
  claim: 'answers absolute folders, each once, an install folder under the home given and at least one base folder',
  check: (programFolders) => {
    const { pathModule } = programFolders;
    const installFolders = programFolders.installFoldersOf(homeDirectory);
    const everyFolder = [...installFolders, ...programFolders.nodeVersionFoldersOf(homeDirectory), ...programFolders.baseFolders()];
    expect(installFolders.length).toBeGreaterThan(0);
    expect(programFolders.baseFolders().length).toBeGreaterThan(0);
    expect(everyFolder.every((folder) => pathModule.isAbsolute(folder))).toBe(true);
    expect(new Set(everyFolder).size).toBe(everyFolder.length);
    expect(installFolders.some((folder) => folder.startsWith(pathModule.join(homeDirectory, '.local')))).toBe(true);
  },
}];

runPortContract('ProgramFolders', [
  { name: 'DarwinProgramFolders', build: () => DARWIN_PROGRAM_FOLDERS },
  { name: 'LinuxProgramFolders', build: () => LINUX_PROGRAM_FOLDERS },
  { name: 'the darwin selector', build: () => programFoldersFor('darwin', WINDOWS_ROOTS) },
  { name: 'the linux selector', build: () => programFoldersFor('linux', WINDOWS_ROOTS) },
], clausesOf('/home/example'));

runPortContract('ProgramFolders on Windows', [
  { name: 'WindowsProgramFolders', build: () => createWindowsProgramFolders(WINDOWS_ROOTS) },
  { name: 'the win32 selector', build: () => programFoldersFor('win32', WINDOWS_ROOTS) },
], clausesOf('C:\\Users\\example'));

describe('each OS\'s folders, in the order a program is looked for', () => {
  test('macOS: Bun, Homebrew on Apple silicon and on Intel, the native installers\' link folder, then the system\'s', () => {
    expect(DARWIN_PROGRAM_FOLDERS.installFoldersOf('/Users/example')).toEqual([
      '/Users/example/.bun/bin', '/opt/homebrew/bin', '/usr/local/bin', '/Users/example/.local/bin',
    ]);
    expect(DARWIN_PROGRAM_FOLDERS.baseFolders()).toEqual(['/usr/bin', '/bin', '/usr/sbin', '/sbin']);
  });

  test('Linux: Bun, the local prefix, the native installers\' link folder, Homebrew\'s Linux prefix and snap, then the system\'s; no macOS prefix', () => {
    expect(LINUX_PROGRAM_FOLDERS.installFoldersOf('/home/example')).toEqual([
      '/home/example/.bun/bin', '/usr/local/bin', '/home/example/.local/bin', '/home/linuxbrew/.linuxbrew/bin', '/snap/bin',
    ]);
    expect(LINUX_PROGRAM_FOLDERS.baseFolders()).toEqual(['/usr/bin', '/bin', '/usr/sbin', '/sbin']);
  });

  test('Windows: the native installers\' link folder, Bun, npm\'s shims, winget\'s links, node and Git for Windows, then the system root\'s', () => {
    const windows = createWindowsProgramFolders(WINDOWS_ROOTS);
    expect(windows.installFoldersOf('C:\\Users\\example')).toEqual([
      'C:\\Users\\example\\.local\\bin',
      'C:\\Users\\example\\.bun\\bin',
      'C:\\Users\\example\\AppData\\Roaming\\npm',
      'C:\\Users\\example\\AppData\\Local\\Microsoft\\WinGet\\Links',
      'C:\\Program Files\\nodejs',
      'C:\\Program Files\\Git\\cmd',
    ]);
    expect(windows.baseFolders()).toEqual([
      'C:\\Windows\\System32', 'C:\\Windows', 'C:\\Windows\\System32\\Wbem', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
    ]);
    expect(windows.nodeVersionFoldersOf('C:\\Users\\example')).toEqual([]);
  });

  test('Windows finds a program named alone only by an extension of PATHEXT, in its order, and one named with such an extension as it is', () => {
    const windows = createWindowsProgramFolders(WINDOWS_ROOTS);
    expect(windows.programFileNamesOf('bun')).toEqual(['bun.com', 'bun.exe', 'bun.bat', 'bun.cmd']);
    expect(windows.programFileNamesOf('bun.EXE')).toEqual(['bun.EXE']);
    const unset = createWindowsProgramFolders({ ...WINDOWS_ROOTS, programExtensions: () => undefined });
    expect(unset.programFileNamesOf('git')).toEqual(['git.com', 'git.exe', 'git.bat', 'git.cmd']);
    expect(DARWIN_PROGRAM_FOLDERS.programFileNamesOf('bun')).toEqual(['bun']);
    expect(LINUX_PROGRAM_FOLDERS.programFileNamesOf('bun')).toEqual(['bun']);
  });

  test('Windows names no folder under a root that is unset or not drive-absolute, and reads each root at the call', () => {
    let systemRoot: string | undefined = 'D:\\Windows';
    const windows = createWindowsProgramFolders({
      systemRoot:                   () => systemRoot,
      localApplicationDataFolder:   () => undefined,
      roamingApplicationDataFolder: () => 'AppData',
      programFilesFolder:           () => '\\Program Files',
      programExtensions:            () => undefined,
    });
    expect(windows.installFoldersOf('C:\\Users\\example')).toEqual(['C:\\Users\\example\\.local\\bin', 'C:\\Users\\example\\.bun\\bin']);
    expect(windows.baseFolders()[0]).toBe('D:\\Windows\\System32');
    systemRoot = undefined;
    expect(windows.baseFolders()).toEqual([]);
  });
});

describe('nodeVersionFoldersOf on macOS and Linux', () => {
  test('names nvm\'s newest node by version, not by name', () => {
    const home = createScratchDirectory('program-folders-nvm');
    try {
      for (const version of ['v9.11.2', 'v22.22.0', 'v22.3.1', 'not-a-version']) mkdirSync(join(home, '.nvm', 'versions', 'node', version, 'bin'), { recursive: true });
      const newest = [join(home, '.nvm', 'versions', 'node', 'v22.22.0', 'bin')];
      expect(DARWIN_PROGRAM_FOLDERS.nodeVersionFoldersOf(home)).toEqual(newest);
      expect(LINUX_PROGRAM_FOLDERS.nodeVersionFoldersOf(home)).toEqual(newest);
    } finally {
      removeScratchDirectory(home);
    }
  });

  test('a home without nvm names no node folder', () => {
    const home = createScratchDirectory('program-folders-no-nvm');
    try {
      expect(DARWIN_PROGRAM_FOLDERS.nodeVersionFoldersOf(home)).toEqual([]);
    } finally {
      removeScratchDirectory(home);
    }
  });
});

test('a platform with no adapter knows no folder', () => {
  const programFolders = programFoldersFor('example-platform', WINDOWS_ROOTS);
  expect([programFolders.installFoldersOf('/home/example'), programFolders.nodeVersionFoldersOf('/home/example'), programFolders.baseFolders()]).toEqual([[], [], []]);
});
