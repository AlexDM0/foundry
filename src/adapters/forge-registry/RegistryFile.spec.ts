/**
 * The registry's ingestion, over the authored five-entry fixture and variants of it written to the scratch root: the fixture maps to five
 * forges in its order, a newer version maps nothing, a malformed entry is left out and named while the rest map, and every file that is no
 * registry at version 1 answers a verdict, never a throw.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import type { RegisteredForge }                      from './@types/RegisteredForge.ts';
import { RegistryFile }                              from './RegistryFile.ts';

const FIXTURE_PATH = join(import.meta.dir, 'testing', 'fixtures', 'projects-v1.json');

const AGENCY_TRACKER_ID = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c0a37';
const DAIRY_TRACKER_ID  = 'e2b86d14-9f3a-4c70-a5d2-3b8e0f6c7a91';

const FIXTURE_FORGES: readonly RegisteredForge[] = [
  {
    trackerId: AGENCY_TRACKER_ID,
    project:   'Example Agency',
    root:      '/Users/alex.example/development/example-agency',
    program:   '/Users/alex.example/development/forge/bin/forge',
    overseer:  {
      url:       'http://127.0.0.1:4987/',
      processId: 4242,
      startedAt: '2026-10-21T10:05:00+02:00',
      tokenPath: `/Users/alex.example/.forge-monitor/watchers/${AGENCY_TRACKER_ID}/token`,
    },
  },
  {
    trackerId: '8a3d1f60-2c4b-4e7a-b915-6f0e2d8c4b19',
    project:   'Example Bookshop',
    root:      '/Users/alex.example/development/example-bookshop',
    program:   '/Users/alex.example/development/forge/bin/forge',
    overseer:  {
      url:       'http://127.0.0.1:4988/',
      processId: 5151,
      startedAt: '2026-11-12T08:15:00+01:00',
      tokenPath: null,
    },
  },
  {
    trackerId: 'c47e9b2a-0d5f-4a18-8e63-91b7f4a2d0c5',
    project:   'Example Clinic',
    root:      '/Users/alex.example/development/example-clinic',
    program:   '/Users/alex.example/development/forge-next/bin/forge',
    overseer:  null,
  },
  {
    trackerId: DAIRY_TRACKER_ID,
    project:   'Example Dairy',
    root:      '/Users/alex.example/development/example-dairy',
    program:   null,
    overseer:  null,
  },
  {
    trackerId: '1d7f3c58-6a2e-4b9d-8c04-e5a19b3f6d82',
    project:   'Example Estate',
    root:      '/Users/alex.example/development/example-estate',
    program:   null,
    overseer:  {
      url:       'http://127.0.0.1:4989/',
      processId: 6060,
      startedAt: '2026-11-12T07:55:00+01:00',
      tokenPath: '/Users/alex.example/.forge-monitor/watchers/1d7f3c58-6a2e-4b9d-8c04-e5a19b3f6d82/token',
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
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as RegistryDocument;
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

describe('the registry fixture', () => {
  test('maps its five entries to five forges, in the registry order, with nothing left out', async () => {
    expect(await new RegistryFile(FIXTURE_PATH).read()).toEqual({ verdict: 'readable', forges: FIXTURE_FORGES, leftOutEntries: [] });
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
      forges:         FIXTURE_FORGES.filter((forge) => forge.trackerId !== DAIRY_TRACKER_ID),
      leftOutEntries: [{ trackerId: DAIRY_TRACKER_ID, problems: [{ key: 'root', reason: 'missing' }] }],
    });
  });

  test('is left out and named with the overseer key it lacks', async () => {
    const document = fixtureDocument();
    delete (fixtureEntry(document, AGENCY_TRACKER_ID)['overseer'] as Record<string, unknown>)['url'];
    const reading = await registryWith(JSON.stringify(document)).read();
    expect(reading).toEqual({
      verdict:        'readable',
      forges:         FIXTURE_FORGES.filter((forge) => forge.trackerId !== AGENCY_TRACKER_ID),
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
