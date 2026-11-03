/**
 * The Bridge served by a real Overseer and loaded in headless Chrome, skipped by name where Chrome is missing. What matters: the shell
 * renders the board's project from the live event stream, every tab routes, and nothing errs: no console error, no exception, no failed
 * request and no CSP violation. The page is the URL `open` prints, so it reads the board only with the cookie the session code buys.
 * Git plays recorded answers, here and in each spawned binary.
 */
import { expect } from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../src/testing/ChildProcessCaseTimeout.ts';
// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { useRecordedGit as recordedGitOfThisSpecFile }   from '../src/testing/RecordedGit.ts';
import { chromeExecutablePath, testWhenChromeIsPresent } from '../src/testing/ToolGuard.ts';
import { BRIDGE_TABS }                                   from './shell/HashRouter.ts';
import { HEADLESS_CHECK_PROJECT, readTheBridgeHeadless } from './testing/HeadlessBridgeCheck.ts';

const recordedGit = recordedGitOfThisSpecFile();

testWhenChromeIsPresent('A3: after open, the Bridge spends the code, renders the live board, routes every tab, sends a command, and nothing errs', async () => {
  const reading = await readTheBridgeHeadless(chromeExecutablePath() ?? '', recordedGit);
  expect(reading.problems).toEqual([]);
  expect(reading.projectHeading).toBe(HEADLESS_CHECK_PROJECT);
  expect(reading.visitedTabs).toEqual([...BRIDGE_TABS]);
  expect(reading.addressAfterLoad).not.toContain('session=');
  expect(reading.commandStatus).toBe(200);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
