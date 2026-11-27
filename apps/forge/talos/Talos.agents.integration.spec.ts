/**
 * Agent children end to end with the Talos binary, launched as the fake agent's adapter plans them. What matters: a permission request is
 * answered by the plan's standing reply while a question waits; a `write-line` reaches the child and a `close` ends it, each in the event
 * log as a `client` entry before anything the child did after it; a quit at the turn end applies the launch's own act, logged as that act,
 * and an agent launched with none refuses it; a stop of an agent is logged as one too; input to a line, an ended agent
 * or an unknown child is refused; and an ending of the plan's patterns is recognised from the closing line's sequence and the counted
 * lines, the record holding it before the event log holds the line.
 */
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { ChildLaunch }                        from '../src/domain/talos/ChildLaunch.ts';
import { standingReplyFor }                        from '../src/domain/talos/StandingReplies.ts';
import { clientEntryLineOf }                       from '../src/domain/talos/TalosFrames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../src/testing/ChildProcessCaseTimeout.ts';
import {
  fakeAgentAdapter,
  fakePermissionRequestLine,
  fakeQuestionLine,
  fakeResultLine,
  fakeStartedLineSelectorOf
} from '../src/testing/FakeAgentAdapter.ts';
import { fakeAgentChildLaunch }                  from '../src/testing/FakeAgentChildLaunch.ts';
import { createScratchTalos, type ScratchTalos } from '../src/testing/ScratchTalos.ts';
import { firstValueOf, waitUntil }               from '../src/testing/WaitUntil.ts';

const START_NUMBER = 1;
/** Stage 0's recording of a session that ended on a network outage, which a child of the spec's own prints line by line. */
const RECORDED_NETWORK_OUTAGE_STANDARD_OUTPUT_PATH = join(
  import.meta.dir, '..', 'src', 'lib', 'claude-code', 'testing', 'fixtures', 'network-outage-retries-spent.stdout.jsonl',
);
const AGENT_FOLDER = 'jobs/J-1';
const AGENT_ID = 'jobs/J-1#1';
const QUESTION = {
  question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'Blue.', isRecommended: false }]
};
/** The recorded outage session's closing line is its twentieth and last, after ten retries. */
const OUTAGE_CLOSING_LINE_SEQUENCE = 20;
const OUTAGE_RETRIES = 10;
const STOP_GRACE_MILLISECONDS = 100;

let currentScratchTalos: ScratchTalos | null = null;

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

function launchFrameOf(launch: ChildLaunch): object {
  return { kind: 'launch', launch };
}

async function eventsOnceThereAre(count: number): Promise<readonly { origin: string; line: string }[]> {
  const scratch = scratchTalos();
  return firstValueOf(() => {
    const entries = scratch.eventsOf(AGENT_FOLDER, 1);
    return entries.length >= count ? entries.map(({ origin, line }) => ({ origin, line })) : undefined;
  }, () => `${count} entries in the agent's event log; it holds ${JSON.stringify(scratch.eventsOf(AGENT_FOLDER, 1))}`);
}

test('a permission request is answered by the standing reply, a question is not, and each input is logged before what follows it', async () => {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER);
  const permissionRequestLine = fakePermissionRequestLine('request-permission');
  const questionLine = fakeQuestionLine('request-question', [QUESTION]);
  const resultLine = fakeResultLine({ summary: 'done' });
  const launch = fakeAgentChildLaunch(scratch.boardFolder, AGENT_FOLDER, 1, [
    { kind: 'print', line: permissionRequestLine },
    { kind: 'await-line' },
    { kind: 'print', line: questionLine },
    { kind: 'await-line' },
    { kind: 'print', line: resultLine },
    { kind: 'await-line' },
  ]);
  const standingReply = standingReplyFor(permissionRequestLine, launch.standingReplies);
  // The plan's own rules, so the question below waits because a rule says so, not because there is none.
  if (standingReply === null) throw new Error('The fake agent plans no standing reply for a permission request.');
  expect(standingReplyFor(questionLine, launch.standingReplies)).toBeNull();
  expect(await serving.send(launchFrameOf(launch))).toMatchObject({ verdict: 'done' });

  expect(await eventsOnceThereAre(3)).toEqual([
    { origin: 'agent', line: permissionRequestLine },
    { origin: 'talos', line: standingReply },
    { origin: 'agent', line: questionLine },
  ]);
  const answerLine = fakeAgentAdapter().chatLineOf('Blue.');
  expect(await serving.send({ kind: 'input', childId: AGENT_ID, input: { act: 'write-line', line: answerLine } })).toMatchObject({ verdict: 'done' });
  expect((await eventsOnceThereAre(5)).slice(3)).toEqual([
    { origin: 'client', line: clientEntryLineOf({ act: 'write-line', line: answerLine }) },
    { origin: 'agent', line: resultLine },
  ]);

  expect(await serving.send({ kind: 'input', childId: AGENT_ID, input: { act: 'close' } })).toMatchObject({ verdict: 'done' });
  expect((await scratch.endedRecordOf(AGENT_FOLDER, 1)).end).toMatchObject({ reason: 'exited', exitCode: 0 });
  expect(scratch.eventsOf(AGENT_FOLDER, 1).map(({ origin, line }) => ({ origin, line })).slice(5)).toEqual([
    { origin: 'client', line: clientEntryLineOf({ act: 'close' }) },
  ]);
  expect(await serving.send({ kind: 'input', childId: AGENT_ID, input: { act: 'close' } })).toMatchObject({ verdict: 'refused', reason: 'child-ended' });
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a stop of an agent is logged as a client entry and ends it', async () => {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER);
  const startedLine = fakeStartedLineSelectorOf('fake-session');
  await serving.send(launchFrameOf(fakeAgentChildLaunch(scratch.boardFolder, AGENT_FOLDER, 1, [{ kind: 'print', line: startedLine }, { kind: 'await-line' }])));
  await eventsOnceThereAre(1);
  expect(await serving.send({ kind: 'stop', childId: AGENT_ID, graceMilliseconds: STOP_GRACE_MILLISECONDS })).toMatchObject({ verdict: 'done' });
  await scratch.endedRecordOf(AGENT_FOLDER, 1);
  expect(scratch.eventsOf(AGENT_FOLDER, 1).map(({ origin, line }) => ({ origin, line })).slice(1)).toEqual([
    { origin: 'client', line: clientEntryLineOf({ act: 'stop', graceMilliseconds: STOP_GRACE_MILLISECONDS }) },
  ]);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a quit at the turn end applies the launch\'s own act, logged as the act applied, and an agent launched with none refuses it', async () => {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER);
  const startedLine = fakeStartedLineSelectorOf('fake-session');
  const startedThenWaiting = [{ kind: 'print', line: startedLine }, { kind: 'await-line' }, { kind: 'await-line' }] as const;
  const quitLine = JSON.stringify({ type: 'example-quit' });
  const launches = {
    closesInput: fakeAgentChildLaunch(scratch.boardFolder, 'jobs/J-1', 1, startedThenWaiting),
    writesLine:  fakeAgentChildLaunch(scratch.boardFolder, 'jobs/J-2', 1, startedThenWaiting, { quitAtTurnEnd: { act: 'write-line', line: quitLine } }),
    hasNoQuit:   fakeAgentChildLaunch(scratch.boardFolder, 'jobs/J-3', 1, startedThenWaiting, { quitAtTurnEnd: null }),
  };
  for (const launch of Object.values(launches)) await serving.send(launchFrameOf(launch));
  const loggedLinesOf = (childFolder: string): readonly { origin: string; line: string }[] => scratch.eventsOf(childFolder, 1).map(({ origin, line }) => ({ origin, line }));
  for (const childFolder of ['jobs/J-1', 'jobs/J-2', 'jobs/J-3']) await waitUntil(() => loggedLinesOf(childFolder).length === 1, `the started line of ${childFolder}`);

  const quitAtTurnEnd = { act: 'quit-at-turn-end' };
  expect(await serving.send({ kind: 'input', childId: 'jobs/J-1#1', input: quitAtTurnEnd })).toMatchObject({ verdict: 'done' });
  expect(await serving.send({ kind: 'input', childId: 'jobs/J-2#1', input: quitAtTurnEnd })).toMatchObject({ verdict: 'done' });
  expect(await serving.send({ kind: 'input', childId: 'jobs/J-3#1', input: quitAtTurnEnd })).toMatchObject({ verdict: 'refused', reason: 'no-quit-act' });

  expect((await scratch.endedRecordOf('jobs/J-1', 1)).end).toMatchObject({ reason: 'exited', exitCode: 0 });
  expect(loggedLinesOf('jobs/J-1').slice(1)).toEqual([{ origin: 'client', line: clientEntryLineOf({ act: 'close' }) }]);
  expect(loggedLinesOf('jobs/J-2').slice(1)).toEqual([{ origin: 'client', line: clientEntryLineOf({ act: 'write-line', line: quitLine }) }]);
  expect(loggedLinesOf('jobs/J-3')).toHaveLength(1);
  for (const childId of ['jobs/J-2#1', 'jobs/J-3#1']) await serving.send({ kind: 'stop', childId, graceMilliseconds: STOP_GRACE_MILLISECONDS });
  await scratch.endedRecordOf('jobs/J-2', 1);
  await scratch.endedRecordOf('jobs/J-3', 1);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('input to a line or to an unknown child is refused and logged nowhere', async () => {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER);
  await serving.send(launchFrameOf(scratch.lineLaunch('jobs/J-1/gate-1', 1, 'setInterval(() => undefined, 60000);')));
  expect(await serving.send({ kind: 'input', childId: 'jobs/J-1/gate-1#1', input: { act: 'close' } })).toMatchObject({ verdict: 'refused', reason: 'kind-takes-no-input' });
  expect(await serving.send({ kind: 'input', childId: 'jobs/J-9#1', input: { act: 'close' } })).toMatchObject({ verdict: 'refused', reason: 'unknown-child' });
  expect(scratch.eventsOf('jobs/J-1/gate-1', 1)).toEqual([]);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('an outage ending is recognised from the recorded session, the record holding it before the log holds its closing line', async () => {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER);
  const printsTheRecordedSession = [
    `const lines = require('node:fs').readFileSync(${JSON.stringify(RECORDED_NETWORK_OUTAGE_STANDARD_OUTPUT_PATH)}, 'utf8').split('\\n');`,
    'for (const line of lines) if (line !== \'\') process.stdout.write(`${line}\\n`);',
  ].join(' ');
  const launch = fakeAgentChildLaunch(scratch.boardFolder, AGENT_FOLDER, 1, [], { argv: [process.execPath, '-e', printsTheRecordedSession] });
  await serving.send(launchFrameOf(launch));

  const expectedEnding = { name: 'network-outage', closingLineSequence: OUTAGE_CLOSING_LINE_SEQUENCE, countedLines: OUTAGE_RETRIES };
  const recognitionsSeenWithTheLine = await firstValueOf(() => {
    const closingLineLogged = scratch.eventsOf(AGENT_FOLDER, 1).some(({ sequence }) => sequence === OUTAGE_CLOSING_LINE_SEQUENCE);
    return closingLineLogged ? scratch.childRecordOf(AGENT_FOLDER, 1)?.recognisedEndings ?? [] : undefined;
  }, 'the closing line in the event log');
  expect(recognitionsSeenWithTheLine).toEqual([expectedEnding]);
  const recognitionFrame = await serving.client.nextFrame((frame) => frame.kind === 'state' && frame.recognisedEnding !== null);
  expect(recognitionFrame).toMatchObject({ childId: AGENT_ID, recognisedEnding: expectedEnding });
  expect((await scratch.endedRecordOf(AGENT_FOLDER, 1)).recognisedEndings).toEqual([expectedEnding]);
  await waitUntil(() => scratch.eventsOf(AGENT_FOLDER, 1).length === OUTAGE_CLOSING_LINE_SEQUENCE, 'every recorded line in the event log');
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
