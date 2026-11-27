/**
 * The registry's ingestion over a recorded registry of five boards and variants written to the scratch root: the recording maps to five
 * forges in order, an older entry's token file or program reads as unknown, a newer version maps nothing, a broken entry is left out or
 * loses its live Hephaestus, and every file that is no readable registry answers a verdict naming the reason, never a throw.
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

type RecordedStamp = 'lastChangedAt' | 'hephaestusStartedAt' | 'presenceAt';

interface RecordedEntryStamps {
  readonly lastChangedAt?: string;
  readonly hephaestus?:    { readonly startedAt?: string } | null;
  readonly presence?:      { readonly at?: string } | null;
}

/** A stamp the forge wrote into a board's entry when the recording was taken, read from the recording so a fresh take reads alike. */
function recordedStampOf(trackerId: string, stamp: RecordedStamp): string {
  const { projects } = recordedRegistryDocument() as { projects: Record<string, RecordedEntryStamps> };
  const entry = projects[trackerId];
  const stampValue = { lastChangedAt: entry?.lastChangedAt, hephaestusStartedAt: entry?.hephaestus?.startedAt, presenceAt: entry?.presence?.at }[stamp];
  if (stampValue === undefined) throw new Error(`The recorded entry of ${trackerId} holds no ${stamp}.`);
  return stampValue;
}

/** What the recorded registry maps to; retake the last commands from the recording after `bun run record forge-registry`. */
const RECORDED_FORGES: readonly RegisteredForge[] = [
  {
    trackerId:  AGENCY_TRACKER_ID,
    project:    'Example Agency',
    root:       BOARDS['example-agency'].root,
    program:    EXAMPLE_PROGRAM,
    hephaestus: {
      url:       'http://127.0.0.1:4987/',
      processId: 4242,
      startedAt: recordedStampOf(AGENCY_TRACKER_ID, 'hephaestusStartedAt'),
      tokenPath: `/Users/example/.forge-monitor/private/${AGENCY_TRACKER_ID}/token`,
    },
    lastCommand:   'start',
    lastChangedAt: recordedStampOf(AGENCY_TRACKER_ID, 'lastChangedAt'),
    presence:      {
      state: 'serving', generation: 1, at: recordedStampOf(AGENCY_TRACKER_ID, 'presenceAt'), crash: null,
    },
  },
  {
    trackerId:  BOOKSHOP_TRACKER_ID,
    project:    'Example Bookshop',
    root:       BOARDS['example-bookshop'].root,
    program:    EXAMPLE_PROGRAM,
    hephaestus: {
      url:       'http://127.0.0.1:4988/',
      processId: 5151,
      startedAt: recordedStampOf(BOOKSHOP_TRACKER_ID, 'hephaestusStartedAt'),
      tokenPath: `/Users/example/.forge-monitor/private/${BOOKSHOP_TRACKER_ID}/token`,
    },
    lastCommand:   'start',
    lastChangedAt: recordedStampOf(BOOKSHOP_TRACKER_ID, 'lastChangedAt'),
    presence:      {
      state:      'crashed',
      generation: 1,
      at:         recordedStampOf(BOOKSHOP_TRACKER_ID, 'presenceAt'),
      crash:      {
        component:    'talos',
        suspected:    false,
        errorName:    'TalosLost',
        errorMessage: 'Talos 1 was lost while serving; 0 of its children were swept.',
      },
    },
  },
  {
    trackerId:     BOARDS['example-clinic'].trackerId,
    project:       'Example Clinic',
    root:          BOARDS['example-clinic'].root,
    program:       EXAMPLE_PROGRAM,
    hephaestus:    null,
    lastCommand:   'start',
    lastChangedAt: recordedStampOf(BOARDS['example-clinic'].trackerId, 'lastChangedAt'),
    presence:      {
      state: 'stopped', generation: 1, at: recordedStampOf(BOARDS['example-clinic'].trackerId, 'presenceAt'), crash: null,
    },
  },
  {
    trackerId:     DAIRY_TRACKER_ID,
    project:       'Example Dairy',
    root:          BOARDS['example-dairy'].root,
    program:       EXAMPLE_PROGRAM,
    hephaestus:    null,
    lastCommand:   'init',
    lastChangedAt: recordedStampOf(DAIRY_TRACKER_ID, 'lastChangedAt'),
    presence:      null,
  },
  {
    trackerId:  ESTATE_TRACKER_ID,
    project:    'Example Estate',
    root:       BOARDS['example-estate'].root,
    program:    EXAMPLE_PROGRAM,
    hephaestus: {
      url:       'http://127.0.0.1:4989/',
      processId: 6060,
      startedAt: recordedStampOf(ESTATE_TRACKER_ID, 'hephaestusStartedAt'),
      tokenPath: `/Users/example/.forge-monitor/private/${ESTATE_TRACKER_ID}/token`,
    },
    lastCommand:   'start',
    lastChangedAt: recordedStampOf(ESTATE_TRACKER_ID, 'lastChangedAt'),
    presence:      {
      state: 'serving', generation: 1, at: recordedStampOf(ESTATE_TRACKER_ID, 'presenceAt'), crash: null,
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
    expect(await registryWith(JSON.stringify(fixtureDocument(), null, 2)).read()).toEqual({ verdict: 'readable', forges: RECORDED_FORGES });
  });
});

describe('a registry at another minor', () => {
  test('reads a registry a newer forge wrote at a newer minor as at minor 0, passing over a key it adds', async () => {
    const document = { ...fixtureDocument(), minor: 2, exampleAddedKey: true };
    expect(await registryWith(JSON.stringify(document)).read()).toEqual({ verdict: 'readable', forges: RECORDED_FORGES });
  });

  test('answers unreadable for a minor that is no whole number', async () => {
    expect(await registryWith(JSON.stringify({ ...fixtureDocument(), minor: 'two' })).read()).toMatchObject({ verdict: 'unreadable', reason: 'version-unknown' });
  });
});

describe('an entry written by a forge before F4 or F9', () => {
  test('maps a live Hephaestus without its token file to an unknown token path, and an entry without its program to an unknown program', async () => {
    const document = fixtureDocument();
    delete (fixtureEntry(document, BOOKSHOP_TRACKER_ID)['hephaestus'] as Record<string, unknown>)['tokenPath'];
    delete fixtureEntry(document, DAIRY_TRACKER_ID)['program'];
    const reading = await registryWith(JSON.stringify(document)).read();
    expect(reading.verdict === 'readable' ? reading.forges.map(({ program, hephaestus }) => [program, hephaestus?.tokenPath ?? null]) : null).toEqual([
      [EXAMPLE_PROGRAM, RECORDED_FORGES[0]?.hephaestus?.tokenPath ?? null],
      [EXAMPLE_PROGRAM, null],
      [EXAMPLE_PROGRAM, null],
      [null, null],
      [EXAMPLE_PROGRAM, RECORDED_FORGES[4]?.hephaestus?.tokenPath ?? null],
    ]);
  });
});

describe('a registry at a version Gaia does not know', () => {
  test('answers newer-version at version 3 and maps nothing', async () => {
    const document = { ...fixtureDocument(), version: 3 };
    expect(await registryWith(JSON.stringify(document)).read()).toEqual({ verdict: 'newer-version', version: 3 });
  });

  test('answers unreadable when the version is missing, older or not a whole number', async () => {
    for (const version of [undefined, 0, 1, 2.5, '2']) {
      const document = { ...fixtureDocument(), version };
      expect(await registryWith(JSON.stringify(document)).read()).toEqual({ verdict: 'unreadable', reason: 'version-unknown', failure: null });
    }
  });
});

describe('a malformed entry', () => {
  test('is left out when it lacks its root, while the other entries map', async () => {
    const document = fixtureDocument();
    delete fixtureEntry(document, DAIRY_TRACKER_ID)['root'];
    expect(await registryWith(JSON.stringify(document)).read()).toEqual({
      verdict: 'readable',
      forges:  RECORDED_FORGES.filter((forge) => forge.trackerId !== DAIRY_TRACKER_ID),
    });
  });

  test('keeps its forge with no live Hephaestus when its `hephaestus` entry lacks a key', async () => {
    const document = fixtureDocument();
    delete (fixtureEntry(document, AGENCY_TRACKER_ID)['hephaestus'] as Record<string, unknown>)['url'];
    expect(await registryWith(JSON.stringify(document)).read()).toEqual({
      verdict: 'readable',
      forges:  RECORDED_FORGES.map((forge) => (forge.trackerId === AGENCY_TRACKER_ID ? { ...forge, hephaestus: null } : forge)),
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
    expect(await registryWith('{"version": 2, "projects": {').read()).toEqual({ verdict: 'unreadable', reason: 'not-json', failure: null });
  });

  test('answers unreadable for JSON that is not an object', async () => {
    for (const contents of ['[]', 'null', '1']) {
      expect(await registryWith(contents).read()).toEqual({ verdict: 'unreadable', reason: 'not-a-json-object', failure: null });
    }
  });

  test('answers unreadable when projects is not an object', async () => {
    expect(await registryWith('{"version": 2, "projects": []}').read()).toEqual({ verdict: 'unreadable', reason: 'projects-not-an-object', failure: null });
  });
});

describe('a registry with no projects key', () => {
  test('reads as a registry of no forges', async () => {
    expect(await registryWith('{"version": 2}').read()).toEqual({ verdict: 'readable', forges: [] });
  });
});

describe('the forges a reading names', () => {
  test('are the forges of a readable registry, and none of an absent one', async () => {
    expect(registeredForgesOf(await registryWith(JSON.stringify(fixtureDocument())).read())).toEqual(RECORDED_FORGES);
    expect(registeredForgesOf({ verdict: 'absent' })).toEqual([]);
  });

  test('are none, but the reason Gaia cannot act on them, for a registry it cannot read or that is newer than it reads', () => {
    expect(registeredForgesOf({ verdict: 'unreadable', reason: 'not-json', failure: null })).toBe('registry-unreadable');
    expect(registeredForgesOf({ verdict: 'newer-version', version: 3 })).toBe('registry-newer-version');
  });
});

describe('the registry\'s place', () => {
  test('is projects.json in the forges\' monitor folder of the home folder', () => {
    expect(registryFilePathIn('/Users/alex-example')).toBe('/Users/alex-example/.forge-monitor/projects.json');
  });
});
