/**
 * The registry's ingestion, over the registry a forge wrote for five boards (recorded) and variants of it written to the scratch root: the
 * recording maps to five forges in its order, an entry from a forge before F4 or F9 maps its token file or program as unknown, a newer
 * version maps nothing, a malformed entry is left out and named while the rest map, every file that is no registry at version 1
 * answers a verdict, never a throw, and a registry Gaia cannot read names no forge but the reason.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath }            from '../../testing/ScratchRoot.ts';
import type { RegisteredForge }                                 from './@types/RegisteredForge.ts';
import { RegistryFile, registeredForgesOf, registryFilePathIn } from './RegistryFile.ts';
import { REGISTRY_RECORDING, recordedRegistryDocument }         from './testing/RecordedRegistry.ts';

const BOARDS = REGISTRY_RECORDING.boards;
const AGENCY_TRACKER_ID   = BOARDS['example-agency'].trackerId;
const BOOKSHOP_TRACKER_ID = BOARDS['example-bookshop'].trackerId;
const DAIRY_TRACKER_ID    = BOARDS['example-dairy'].trackerId;
const ESTATE_TRACKER_ID   = BOARDS['example-estate'].trackerId;
const EXAMPLE_PROGRAM = '/Users/example/.bun/bin/forge';

/** What the recorded registry maps to; retake the stamps from the recording after `bun run record forge-registry`. */
const RECORDED_FORGES: readonly RegisteredForge[] = [
  {
    trackerId: AGENCY_TRACKER_ID,
    project:   'Example Agency',
    root:      BOARDS['example-agency'].root,
    program:   EXAMPLE_PROGRAM,
    overseer:  {
      url:       'http://127.0.0.1:4987/',
      processId: 4242,
      startedAt: '2026-11-13T09:58:06+01:00',
      tokenPath: `/Users/example/.forge-monitor/watchers/${AGENCY_TRACKER_ID}/token`,
    },
  },
  {
    trackerId: BOOKSHOP_TRACKER_ID,
    project:   'Example Bookshop',
    root:      BOARDS['example-bookshop'].root,
    program:   EXAMPLE_PROGRAM,
    overseer:  {
      url:       'http://127.0.0.1:4988/',
      processId: 5151,
      startedAt: '2026-11-13T09:58:06+01:00',
      tokenPath: `/Users/example/.forge-monitor/watchers/${BOOKSHOP_TRACKER_ID}/token`,
    },
  },
  {
    trackerId: BOARDS['example-clinic'].trackerId,
    project:   'Example Clinic',
    root:      BOARDS['example-clinic'].root,
    program:   EXAMPLE_PROGRAM,
    overseer:  null,
  },
  {
    trackerId: DAIRY_TRACKER_ID,
    project:   'Example Dairy',
    root:      BOARDS['example-dairy'].root,
    program:   EXAMPLE_PROGRAM,
    overseer:  null,
  },
  {
    trackerId: ESTATE_TRACKER_ID,
    project:   'Example Estate',
    root:      BOARDS['example-estate'].root,
    program:   EXAMPLE_PROGRAM,
    overseer:  {
      url:       'http://127.0.0.1:4989/',
      processId: 6060,
      startedAt: '2026-11-13T09:58:09+01:00',
      tokenPath: `/Users/example/.forge-monitor/watchers/${ESTATE_TRACKER_ID}/token`,
    },
  },
];

interface RegistryDocument {
  version:  unknown;
  projects: Record<string, Record<string, unknown>>;
}

let folder = '';

beforeEach(() => {
  folder = createScratchDirectory('forge-registry');
});

afterEach(() => {
  removeScratchPath(folder);
});

function fixtureDocument(): RegistryDocument {
  return structuredClone(recordedRegistryDocument()) as unknown as RegistryDocument;
}

function registryWith(contents: string): RegistryFile {
  const registryPath = join(folder, 'projects.json');
  writeFileSync(registryPath, contents);
  return new RegistryFile(registryPath);
}

function fixtureEntry(document: RegistryDocument, trackerId: string): Record<string, unknown> {
  const entry = document.projects[trackerId];
  if (entry === undefined) throw new Error(`the fixture has no entry ${trackerId}`);
  return entry;
}

describe('the registry a forge wrote', () => {
  test('maps its five entries to five forges, in the registry order, with nothing left out', async () => {
    expect(await registryWith(JSON.stringify(fixtureDocument(), null, 2)).read()).toEqual({ verdict: 'readable', forges: RECORDED_FORGES, leftOutEntries: [] });
  });
});

describe('an entry written by a forge before F4 or F9', () => {
  test('maps a live Overseer without its token file to an unknown token path, and an entry without its program to an unknown program', async () => {
    const document = fixtureDocument();
    delete (fixtureEntry(document, BOOKSHOP_TRACKER_ID)['overseer'] as Record<string, unknown>)['tokenPath'];
    delete fixtureEntry(document, DAIRY_TRACKER_ID)['program'];
    const reading = await registryWith(JSON.stringify(document)).read();
    expect(reading.verdict === 'readable' ? reading.forges.map(({ program, overseer }) => [program, overseer?.tokenPath ?? null]) : null).toEqual([
      [EXAMPLE_PROGRAM, RECORDED_FORGES[0]?.overseer?.tokenPath ?? null],
      [EXAMPLE_PROGRAM, null],
      [EXAMPLE_PROGRAM, null],
      [null, null],
      [EXAMPLE_PROGRAM, RECORDED_FORGES[4]?.overseer?.tokenPath ?? null],
    ]);
  });
});

describe('a registry at a version Gaia does not know', () => {
  test('answers newer-version at version 2 and maps nothing', async () => {
    const document = { ...fixtureDocument(), version: 2 };
    expect(await registryWith(JSON.stringify(document)).read()).toEqual({ verdict: 'newer-version', version: 2 });
  });

  test('answers unreadable when the version is missing, older or not a whole number', async () => {
    for (const version of [undefined, 0, 1.5, '1']) {
      const document = { ...fixtureDocument(), version };
      expect(await registryWith(JSON.stringify(document)).read()).toEqual({ verdict: 'unreadable', reason: 'version-unknown', failure: null });
    }
  });
});

describe('a malformed entry', () => {
  test('is left out and named with the missing required key while the other entries map', async () => {
    const document = fixtureDocument();
    delete fixtureEntry(document, DAIRY_TRACKER_ID)['root'];
    expect(await registryWith(JSON.stringify(document)).read()).toEqual({
      verdict:        'readable',
      forges:         RECORDED_FORGES.filter((forge) => forge.trackerId !== DAIRY_TRACKER_ID),
      leftOutEntries: [{ trackerId: DAIRY_TRACKER_ID, problems: [{ key: 'root', reason: 'missing' }] }],
    });
  });

  test('is left out and named with the overseer key it lacks', async () => {
    const document = fixtureDocument();
    delete (fixtureEntry(document, AGENCY_TRACKER_ID)['overseer'] as Record<string, unknown>)['url'];
    const reading = await registryWith(JSON.stringify(document)).read();
    expect(reading).toEqual({
      verdict:        'readable',
      forges:         RECORDED_FORGES.filter((forge) => forge.trackerId !== AGENCY_TRACKER_ID),
      leftOutEntries: [{ trackerId: AGENCY_TRACKER_ID, problems: [{ key: 'overseer.url', reason: 'missing' }] }],
    });
  });
});

describe('a file that is no registry', () => {
  test('answers absent for a missing file', async () => {
    expect(await new RegistryFile(join(folder, 'projects.json')).read()).toEqual({ verdict: 'absent' });
  });

  test('answers unreadable with the system code when the path is a folder', async () => {
    const registryPath = join(folder, 'projects.json');
    mkdirSync(registryPath);
    expect(await new RegistryFile(registryPath).read()).toEqual({ verdict: 'unreadable', reason: 'read-failed', failure: 'EISDIR' });
  });

  test('answers unreadable for text that is not JSON', async () => {
    expect(await registryWith('{"version": 1, "projects": {').read()).toEqual({ verdict: 'unreadable', reason: 'not-json', failure: null });
  });

  test('answers unreadable for JSON that is not an object', async () => {
    for (const contents of ['[]', 'null', '1']) {
      expect(await registryWith(contents).read()).toEqual({ verdict: 'unreadable', reason: 'not-a-json-object', failure: null });
    }
  });

  test('answers unreadable when projects is not an object', async () => {
    expect(await registryWith('{"version": 1, "projects": []}').read()).toEqual({ verdict: 'unreadable', reason: 'projects-not-an-object', failure: null });
  });
});

describe('a registry with no projects key', () => {
  test('reads as a registry of no forges', async () => {
    expect(await registryWith('{"version": 1}').read()).toEqual({ verdict: 'readable', forges: [], leftOutEntries: [] });
  });
});

describe('the forges a reading names', () => {
  test('are the forges of a readable registry, and none of an absent one', async () => {
    expect(registeredForgesOf(await registryWith(JSON.stringify(fixtureDocument())).read())).toEqual(RECORDED_FORGES);
    expect(registeredForgesOf({ verdict: 'absent' })).toEqual([]);
  });

  test('are none, but the reason Gaia cannot act on them, for a registry it cannot read or that is newer than it reads', () => {
    expect(registeredForgesOf({ verdict: 'unreadable', reason: 'not-json', failure: null })).toBe('registry-unreadable');
    expect(registeredForgesOf({ verdict: 'newer-version', version: 2 })).toBe('registry-newer-version');
  });
});

describe('the registry\'s place', () => {
  test('is projects.json in the forges\' monitor folder of the home folder', () => {
    expect(registryFilePathIn('/Users/alex-example')).toBe('/Users/alex-example/.forge-monitor/projects.json');
  });
});
