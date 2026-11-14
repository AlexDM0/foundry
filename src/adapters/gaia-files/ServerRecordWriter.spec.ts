/**
 * The server record under a scratch home: it is written at version 1 with the origin taken from the url, a second write replaces it, and
 * it goes away by `remove()` and by nothing else, which a scan of the source holds: no other module names the record's file or its path.
 * `remove()` takes it away only while it names the process that asks, so an older Gaia's slow stop leaves a newer Gaia's record standing.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath }                       from '../../testing/ScratchRoot.ts';
import { createServerRecordWriter, serverRecordPathIn, type ServerRecord } from './ServerRecordWriter.ts';
import { SettingsFile }                                                    from './SettingsFile.ts';
import { createSettingsWriter }                                            from './SettingsWriter.ts';
import { GAIA_SETTINGS_DEFAULTS }                                          from './constants/GaiaSettingsDefaults.ts';

const SOURCE_FOLDER = join(import.meta.dir, '..', '..');

/** The only modules that may name the record's file or the function that answers its path; exact both ways. */
const MODULES_NAMING_THE_RECORD = ['adapters/gaia-files/ServerRecordWriter.ts'];

const RECORD_FILE_NAME = basename(serverRecordPathIn('/'));

/** The exported way to the record's path is a naming too: through it a module could remove the record without naming its file. */
const RECORD_NAMINGS = [RECORD_FILE_NAME, serverRecordPathIn.name];

const EXAMPLE_RECORD: ServerRecord = {
  url:       new URL('http://127.0.0.1:4790/'),
  processId: 4242,
  startedAt: '2026-11-12T09:30:00.000Z',
};

let homeDirectory = '';

beforeEach(() => {
  homeDirectory = createScratchDirectory('server-record');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

function storedRecord(): unknown {
  return JSON.parse(readFileSync(serverRecordPathIn(homeDirectory), 'utf8'));
}

/** Every non-spec TypeScript module below `folder` whose text holds any of `namings`, as paths relative to `folder`. */
function modulesNaming(folder: string, namings: readonly string[]): string[] {
  const namingModules: string[] = [];
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
    const modulePath = join(entry.parentPath, entry.name);
    const moduleText = readFileSync(modulePath, 'utf8');
    if (namings.some((naming) => moduleText.includes(naming))) namingModules.push(relative(folder, modulePath));
  }
  return namingModules.sort();
}

describe('the server record', () => {
  test('lives in the forge\'s monitor folder at gaia/server.json', () => {
    expect(serverRecordPathIn('/Users/alex-example')).toBe('/Users/alex-example/.forge-monitor/gaia/server.json');
  });

  test('is written at version 1 with the url, its origin, the process and the start', async () => {
    expect(await createServerRecordWriter(homeDirectory).write(EXAMPLE_RECORD)).toEqual({ verdict: 'written' });
    expect(storedRecord()).toEqual({
      version:   1,
      url:       'http://127.0.0.1:4790/',
      origin:    'http://127.0.0.1:4790',
      processId: 4242,
      startedAt: '2026-11-12T09:30:00.000Z',
    });
  });

  test('is replaced whole by a second write, as a start after a crash replaces the dead process\'s record', async () => {
    const writer = createServerRecordWriter(homeDirectory);
    await writer.write(EXAMPLE_RECORD);
    await writer.write({ url: new URL('http://127.0.0.1:4791/'), processId: 4343, startedAt: '2026-11-12T10:00:00.000Z' });
    expect(storedRecord()).toMatchObject({ origin: 'http://127.0.0.1:4791', processId: 4343 });
  });

  test('is removed by remove() from the process it names, which then finds it absent', async () => {
    const writer = createServerRecordWriter(homeDirectory);
    await writer.write(EXAMPLE_RECORD);
    expect(await writer.remove(EXAMPLE_RECORD.processId)).toEqual({ verdict: 'removed' });
    expect(existsSync(serverRecordPathIn(homeDirectory))).toBe(false);
    expect(await writer.remove(EXAMPLE_RECORD.processId)).toEqual({ verdict: 'absent' });
  });

  test('is left standing by remove() from a process it does not name', async () => {
    const writer = createServerRecordWriter(homeDirectory);
    await writer.write(EXAMPLE_RECORD);
    expect(await writer.remove(EXAMPLE_RECORD.processId + 1)).toEqual({ verdict: 'held-by-another-process' });
    expect(storedRecord()).toMatchObject({ processId: EXAMPLE_RECORD.processId });
  });

  test('is left standing by remove() when it cannot be read as a record of its version', async () => {
    const writer = createServerRecordWriter(homeDirectory);
    await writer.write(EXAMPLE_RECORD);
    const recordOfAnotherVersion = `${JSON.stringify({ ...storedRecord() as object, version: 2 })}\n`;
    writeFileSync(serverRecordPathIn(homeDirectory), recordOfAnotherVersion);
    expect(await writer.remove(EXAMPLE_RECORD.processId)).toEqual({ verdict: 'held-by-another-process' });
    writeFileSync(serverRecordPathIn(homeDirectory), 'no JSON');
    expect(await writer.remove(EXAMPLE_RECORD.processId)).toEqual({ verdict: 'held-by-another-process' });
    expect(readFileSync(serverRecordPathIn(homeDirectory), 'utf8')).toBe('no JSON');
  });

  test('is removed by nothing else: writing it again, and reading and writing the settings, leave it standing', async () => {
    const writer = createServerRecordWriter(homeDirectory);
    await writer.write(EXAMPLE_RECORD);
    await writer.write(EXAMPLE_RECORD);
    await createSettingsWriter(homeDirectory).write(GAIA_SETTINGS_DEFAULTS);
    await new SettingsFile(homeDirectory).read();
    expect(storedRecord()).toMatchObject({ processId: 4242 });
  });

  test('is named by no module but its writer, so no other module can remove it', () => {
    expect(modulesNaming(SOURCE_FOLDER, RECORD_NAMINGS)).toEqual(MODULES_NAMING_THE_RECORD);
  });

  test('answers unwritable, and unremovable, where a file stands in place of its folder', async () => {
    writeFileSync(join(homeDirectory, '.forge-monitor'), 'a file where the folder belongs');
    expect((await createServerRecordWriter(homeDirectory).write(EXAMPLE_RECORD)).verdict).toBe('unwritable');
    expect((await createServerRecordWriter(homeDirectory).remove(EXAMPLE_RECORD.processId)).verdict).toBe('unremovable');
  });
});

describe('the scan for modules that name the record', () => {
  test('finds a planted module for each naming and passes over a spec that names it', () => {
    const plantedFolder = createScratchDirectory('server-record-scan');
    try {
      mkdirSync(join(plantedFolder, 'features', 'example'), { recursive: true });
      writeFileSync(join(plantedFolder, 'features', 'example', 'PlantedFileName.ts'), `await rm('${RECORD_FILE_NAME}');\n`);
      writeFileSync(join(plantedFolder, 'features', 'example', 'PlantedPath.ts'), `await rm(${serverRecordPathIn.name}(home));\n`);
      writeFileSync(join(plantedFolder, 'features', 'example', 'Planted.spec.ts'), `${RECORD_NAMINGS.join('\n')}\n`);
      expect(modulesNaming(plantedFolder, RECORD_NAMINGS)).toEqual(['features/example/PlantedFileName.ts', 'features/example/PlantedPath.ts']);
    } finally {
      removeScratchPath(plantedFolder);
    }
  });
});
