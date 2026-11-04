/**
 * `open` hands the session code to the browser through a redirect file, with a fake opener here. What matters: the opener's arguments hold
 * no code (A1), the file is owner-only while it exists (A2), and it is removed when the code's life ends, also when the browser never read
 * it, after a stop signal, and when the opener fails (A3).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join }                      from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { ownerOnlyFilesFor }                              from '../../../src/lib/owner-only-files/OwnerOnlyFilesFor.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { openThroughARedirectFile, redirectPageOf }       from './OpenThroughARedirectFile.ts';

const SESSION_CODE = '0123456789abcdef0123456789abcdef';
const PAGE_URL = `http://127.0.0.1:4711/#session=${SESSION_CODE}`;
const OWNER_ONLY_MODE = 0o600;
const PERMISSION_BITS = 0o777;
const ownerOnlyFiles = ownerOnlyFilesFor(process.platform);

let scratchDirectory = '';
let ownerOnlyFolder = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('open-redirect-file');
  ownerOnlyFolder = join(scratchDirectory, 'watcher', 'tracker-example');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

interface FakeOpening {
  readonly openerArguments: string[][];
  readonly endTheCodeLife:  () => void;
  readonly sendStopSignal:  () => void;
  readonly opened:          Promise<string>;
}

function openWithAFakeOpener(launchFails = false): FakeOpening {
  const openerArguments: string[][] = [];
  let endTheCodeLife: () => void = () => undefined;
  let stopListener: () => void = () => undefined;
  const opened = openThroughARedirectFile({
    folder:  ownerOnlyFolder,
    pageUrl: PAGE_URL,
    ownerOnlyFiles,
    launch:  (redirectFilePath) => {
      openerArguments.push(['open', redirectFilePath]);
      if (launchFails) throw new Error('the fake opener failed');
    },
    waitForTheCodeLife: () => new Promise<void>((resolve) => {
      endTheCodeLife = resolve;
    }),
    onStopSignal: (listener) => {
      stopListener = listener;
      return () => {
        stopListener = () => undefined;
      };
    },
  });
  return {
    openerArguments, endTheCodeLife: () => endTheCodeLife(), sendStopSignal: () => stopListener(), opened
  };
}

function launchedRedirectFileOf(opening: FakeOpening): string {
  const [launched] = opening.openerArguments;
  if (launched === undefined) throw new Error('the fake opener was never started');
  return launched[launched.length - 1] ?? '';
}

test('A1: the opener gets only the redirect file path, and no argument holds the session code', async () => {
  const opening = openWithAFakeOpener();
  await Bun.sleep(0);
  expect(opening.openerArguments).toHaveLength(1);
  for (const argument of opening.openerArguments.flat()) expect(argument).not.toContain(SESSION_CODE);
  const redirectFilePath = launchedRedirectFileOf(opening);
  expect(dirname(redirectFilePath)).toBe(ownerOnlyFolder);
  expect(readFileSync(redirectFilePath, 'utf8')).toBe(redirectPageOf(PAGE_URL));
  opening.endTheCodeLife();
  await opening.opened;
});

test('A2: the redirect file and its folder are owner-only while the code lives', async () => {
  const opening = openWithAFakeOpener();
  await Bun.sleep(0);
  const redirectFilePath = launchedRedirectFileOf(opening);
  expect(ownerOnlyFiles.isOwnerOnly(redirectFilePath)).toBe(true);
  expect(ownerOnlyFiles.isOwnerOnly(ownerOnlyFolder)).toBe(true);
  if (process.platform !== 'win32') expect(statSync(redirectFilePath).mode & PERMISSION_BITS).toBe(OWNER_ONLY_MODE);
  opening.endTheCodeLife();
  await opening.opened;
});

test('A3: the redirect file stays while the code lives and is removed when its life ends, though no browser ever read it', async () => {
  const opening = openWithAFakeOpener();
  await Bun.sleep(0);
  const redirectFilePath = launchedRedirectFileOf(opening);
  expect(existsSync(redirectFilePath)).toBe(true);
  opening.endTheCodeLife();
  expect(await opening.opened).toBe(redirectFilePath);
  expect(existsSync(redirectFilePath)).toBe(false);
});

test('A3: a stop signal before the code life ends removes the redirect file', async () => {
  const opening = openWithAFakeOpener();
  await Bun.sleep(0);
  const redirectFilePath = launchedRedirectFileOf(opening);
  opening.sendStopSignal();
  await opening.opened;
  expect(existsSync(redirectFilePath)).toBe(false);
});

test('A3: an opener that fails leaves no redirect file behind', async () => {
  const opening = openWithAFakeOpener(true);
  await expect(opening.opened).rejects.toThrow('the fake opener failed');
  expect(existsSync(launchedRedirectFileOf(opening))).toBe(false);
});

test('the redirect page escapes the address it points to', () => {
  expect(redirectPageOf('http://127.0.0.1:1/?a="<b>&\'')).toContain('url=http://127.0.0.1:1/?a=&quot;&lt;b&gt;&amp;&#39;"');
});
