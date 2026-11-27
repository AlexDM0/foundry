/** Every reason the install manifest gives today is frozen: a row's stored text reads as its sentence, whatever moves the wording. */
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_INSTALL_MANIFEST_PROBLEMS                   from './FrozenInstallManifestProblems.json';
import { InstallManifestIngestion }                       from './InstallManifestIngestion.ts';

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = {
  'a directory stands at its path':          (filePath) => mkdirSync(filePath),
  'its bytes are not UTF-8':                 (filePath) => writeFileSync(filePath, Uint8Array.of(0xff)),
  'it may not be read (no read permission)': (filePath) => {
    writeFileSync(filePath, '{}');
    chmodSync(filePath, 0o000);
  },
};

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, 'version.json');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

function reasonAt(): string | null {
  const reading = new InstallManifestIngestion(filePath()).read();
  return 'reason' in reading ? reading.reason : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-install-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_INSTALL_MANIFEST_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(reasonAt()).toBe(frozenProblem.sentence.replace('{systemError}', systemErrorAt(filePath())));
});
