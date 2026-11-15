/**
 * No spec or test helper sleeps a fixed time or counts tries before an assertion: its verdict would hang on how fast the machine is. A wait
 * goes through `src/testing/WaitUntil.ts`, on the state itself. Each form is planted and watched failing; the allowlist, each entry with why it
 * stays, is exact both ways. Comments are not scanned, so a docblock may name a sleep; `docs/development/guards-and-testing.md` holds the audit.
 */
import { expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                    from './testing/ImportGraph.ts';
import { programTypeScriptSources, type RepositorySource } from './testing/RepositorySources.ts';

const THIS_SPEC = 'src/SpecSleeps.spec.ts';

const FIXED_WAIT_PATTERNS: readonly RegExp[] = [
  /\bBun\.sleep(?:Sync)?\(/,
  /\bsetTimeout\(/,
  /\bAtomics\.wait\(/,
  /\bawait sleep\(/,
  /\btimers\/promises\b/,
  /\bfor \(let \w+ = 0; \w+ < [\w.]*(?:TRIES|ATTEMPTS|POLLS|tries|attempts|polls)\b/,
];

/** `<path>: <trimmed line>`, each with the reason it stays. */
const KEPT_FIXED_WAITS: Readonly<Record<string, string>> = {
  'bridge/views/detail-panel/DetailPanel.dom.tsx: setTimeout(resolve, 20);':
    'A negative: a planted payload never runs, so there is no state to wait on; load only shortens what the window watches.',
  'cli/overseer/ChildSpawnOptions.integration.spec.ts: await Bun.sleep(descendantSeconds * 1000 - endedAfterMilliseconds + DESCENDANT_END_MARGIN_MILLISECONDS);':
    'The unreferenced `sleep` descendant has no handle to wait on, and the run\'s leak check fails on it while it runs.',
  'cli/RegisterWrittenTracker.integration.spec.ts: await Bun.sleep(LOCK_HELD_WHILE_THE_CHILDREN_START_MILLISECONDS);':
    'A negative across processes: nothing writes the registry while its lock is held; a hold ending on the children\'s state could outlast their retry budget.',
  'cli/overseer/OverseerDrivePass.integration.spec.ts: for (let attempt = 0; attempt < WATCHER_CLAIM_WAIT_TRIES; attempt += 1) {':
    'Teardown cleanup, no verdict: a Watcher that never claims has nothing to end.',
  'cli/overseer/OverseerDrivePass.integration.spec.ts: await Bun.sleep(WATCHER_CLAIM_WAIT_MILLISECONDS);':
    'The same teardown wait.',
  'src/lib/watcher/Watcher.protocol.integration.spec.ts: watcherJob().writeLaunch(1, \'process\', \'await Bun.sleep(30_000);\');':
    'The script of a child that only has to stay alive until the case stops it.',
  // eslint-disable-next-line @stylistic/max-len -- the key is the scanned line itself
  'src/lib/watcher/Watcher.integration.spec.ts: writeLaunch(1, \'process\', `require(\'node:fs\').appendFileSync(${JSON.stringify(markerPath)}, \'spawned\\\\n\'); await Bun.sleep(200);`);':
    'The script of a child that keeps its claim while the second Watcher races it; the case awaits both exits.',
  'src/services/overseer/WatcherFleet.integration.spec.ts: await Bun.sleep(LINGER_WATCHED_MILLISECONDS);':
    'A negative: an ended Watcher does not exit unacknowledged, so there is no state to wait on; load only shortens what the window watches.',
  'src/lib/watcher/LocalEndpoint.answers.integration.spec.ts: const timer = setTimeout(() => resolve(false), NEVER_ARRIVES_WAIT_MILLISECONDS);':
    'A negative recorded as an answer: the end of a connection never reaches a client that does not read, so there is no state to wait on.',
  'src/services/overseer/WatcherFleet.integration.spec.ts: setTimeout(() => resolve(\'timed-out\'), SEND_SETTLE_BOUND_MILLISECONDS);':
    'Settling inside the bound is the claim: a send that does not read waits out the 2 s frame timeout, ten times the bound.',
  'src/services/overseer/WatcherFleet.spec.ts: setTimeout(() => resolve(\'timed-out\'), SEND_SETTLE_BOUND_MILLISECONDS);':
    'The same claim over the fake socket, which settles at once when the send reads.',
  'src/testing/SharedCaseDeadlinePreload.integration.spec.ts: await Bun.sleep(PAST_THE_DEFAULT_DEADLINE_MILLISECONDS);':
    'Outliving the default deadline is the claim itself, and Bun exposes no reading of it.',
  'src/testing/ProcessesInFolder.ts: for (let poll = 0; poll < polls; poll += 1) {':
    'Cleanup, no verdict: a leftover that ignores SIGTERM for the grace gets SIGKILL, and a killed one gets time to go.',
  'src/testing/ProcessesInFolder.ts: await Bun.sleep(POLL_INTERVAL_MILLISECONDS);':
    'The same cleanup wait.',
  'src/testing/TestRunLeakCheck.ts: for (let poll = 0; poll < PROCESS_SETTLE_POLLS && leftovers.length > 0; poll += 1) {':
    'A bound on how long the run waits for a signalled child to exit; the shared wait would hold a run with a real leak for a whole case budget.',
  'src/testing/TestRunLeakCheck.ts: await Bun.sleep(PROCESS_SETTLE_POLL_MILLISECONDS);':
    'The same settle wait.',
  'src/testing/WaitUntil.ts: await Bun.sleep(intervalMilliseconds);':
    'The shared wait\'s own poll.',
  'src/testing/WaitUntil.ts: Bun.sleepSync(DEFAULT_POLL_INTERVAL_MILLISECONDS);':
    'The shared wait\'s own poll, for a synchronous hook.',
  'cli/testing/CutoverSmoke.ts: await Bun.sleep(milliseconds);':
    'The owner\'s live smoke run against a real session, which no `bun test` runs and whose deadlines are its report.',
  'cli/testing/CutoverSmoke.ts: await sleep(POLL_INTERVAL_MILLISECONDS);':
    'The same smoke run.',
  'cli/testing/CutoverSmoke.ts: await sleep(POLL_INTERVAL_MILLISECONDS / 10);':
    'The same smoke run.',
  'cli/testing/CutoverSmoke.ts: await sleep(SETTLE_AFTER_REGROUPING_MILLISECONDS);':
    'The same smoke run.',
  'cli/testing/CutoverSmoke.ts: await sleep(SETTLE_AFTER_RESTART_MILLISECONDS);':
    'The same smoke run.',
  'cli/testing/CutoverSmoke.ts: await sleep(STOPPING_JOB_INTERVAL_MILLISECONDS);':
    'The same smoke run.',
  'cli/testing/CutoverSmoke.ts: while (processIsAlive(baton.processId)) await sleep(POLL_INTERVAL_MILLISECONDS / 10);':
    'The same smoke run.',
  'cli/testing/CutoverSmoke.ts: for (let attempt = 0; attempt < STOPPING_JOB_TRIES && (await liveJobs()).some((liveJob) => liveJob.state === \'stopping\'); attempt++) {':
    'The same smoke run.',
};

function isScanned(path: string): boolean {
  return path !== THIS_SPEC && (path.endsWith('.spec.ts') || path.endsWith('.dom.tsx') || path.includes('/testing/') || path.startsWith('testing/'));
}

function isCommentLine(line: string): boolean {
  return line.startsWith('//') || line.startsWith('*') || line.startsWith('/*');
}

function fixedWaitsIn(sources: readonly RepositorySource[]): string[] {
  return sources.filter((source) => isScanned(source.path)).flatMap((source) => source.text.split('\n')
    .map((line) => line.trim())
    .filter((line) => !isCommentLine(line) && FIXED_WAIT_PATTERNS.some((pattern) => pattern.test(line)))
    .map((line) => `${source.path}: ${line}`));
}

test('the scan finds fixed waits, and every one is allowlisted and every allowlist entry is found', () => {
  const found = fixedWaitsIn(programTypeScriptSources(repositoryRootOfThisCheckout()));
  expect(found.length).toBeGreaterThan(0);
  expect([...new Set(found)].sort()).toEqual(Object.keys(KEPT_FIXED_WAITS).sort());
});

test.each([
  ['an awaited sleep', 'await Bun.sleep(50);'],
  ['a blocking sleep', 'Bun.sleepSync(50);'],
  ['a timer promise', 'await new Promise((resolve) => setTimeout(resolve, 50));'],
  ['a sleep from a helper', 'await sleep(50);'],
  ['an atomics wait', 'Atomics.wait(cell, 0, 0, 50);'],
  ['the promised timers', 'import { setTimeout as pause } from \'node:timers/promises\';'],
  ['a try-count loop', 'for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {'],
  ['a poll-count loop', 'for (let poll = 0; poll < PROCESS_GONE_POLLS; poll++) {'],
])('%s before an assertion is refused', (_formName, plantedLine) => {
  const planted = { path: 'cli/Planted.spec.ts', text: `test('example', async () => {\n  ${plantedLine}\n  expect(state).toBe(1);\n});\n` };
  expect(fixedWaitsIn([planted])).toEqual([`cli/Planted.spec.ts: ${plantedLine}`]);
});

test('a test helper and a DOM spec are scanned; a comment and shipping code are not', () => {
  const sleepLine = 'await Bun.sleep(50);';
  expect(fixedWaitsIn([
    { path: 'cli/testing/Planted.ts', text: sleepLine },
    { path: 'bridge/Planted.dom.tsx', text: sleepLine },
    { path: 'cli/Planted.spec.ts', text: `// ${sleepLine}\n * ${sleepLine}\n` },
    { path: 'cli/Planted.ts', text: sleepLine },
  ])).toEqual([`cli/testing/Planted.ts: ${sleepLine}`, `bridge/Planted.dom.tsx: ${sleepLine}`]);
});
