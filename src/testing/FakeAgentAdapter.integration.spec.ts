/**
 * The fake agent stands in for a vendor in every Overseer, Watcher and crash spec, so it must behave as a session does where those specs
 * look: it takes its first line, asks, waits for the answer, reports, and exits; and it can die without a result, as a killed session does.
 * It ends as the recorded `claude` did on a stdin line that is not JSON, and refuses a scenario line no recording holds.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import type { AgentAdapter }                       from '../lib/agent-launch/AgentAdapter.ts';
import type { AgentSessionEvent }                  from '../lib/agent-launch/AgentSessionEvent.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';
import {
  fakeAgentAdapter,
  fakeQuestionLine,
  fakeResultLine,
  fakeStartedLine
} from './FakeAgentAdapter.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { recordedSessionOf }                                       from './fake-agent/RecordedClaudeLines.ts';

const UNRECORDED_LINE_EXIT_CODE = 3;

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

const QUESTION = {
  question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'Blue.' }]
};

function launched(adapter: AgentAdapter): ReturnType<typeof Bun.spawn<'pipe', 'pipe', 'pipe'>> {
  const scratch = createCanonicalScratchDirectory('fake-agent');
  scratchDirectories.push(scratch);
  const plan = adapter.planOf({
    programPath:       process.execPath,
    sessionId:         'fake-session',
    resume:            false,
    workingDirectory:  scratch,
    homeDirectory:     scratch,
    firstMessage:      'Start.',
    roleBrief:         '',
    model:             'fake-model',
    effort:            'low',
    environment:       {},
    jobFilesDirectory: join(scratch, 'job'),
    reportSchema:      null,
    confinement:       'confined',
    profile:           {
      writableRoots:          [],
      deniedWritableRoots:    [],
      deniedReadableRoots:    [],
      bashNetworkDomains:     [],
      webNetworkDomains:      'none',
      hatchDirectory:         scratch,
      allowedCommandPrefixes: [],
      deniedCommandPrefixes:  [],
      askUser:                true,
      skills:                 false,
      subagents:              [],
      attribution:            'none',
      instructionsRoot:       scratch,
      gitHooksDirectory:      scratch,
      commitSigning:          { kind: 'unsigned' },
      networkDomainGuard:     null,
    },
  });
  for (const file of plan.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.text);
  }
  return Bun.spawn([...plan.argv], {
    cwd: scratch, env: plan.environment, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'
  });
}

describe('the fake agent session', () => {
  test('takes its first line, asks, waits for the answer, reports and exits 0', async () => {
    const adapter = fakeAgentAdapter([
      { kind: 'await-line' },
      { kind: 'print', line: fakeStartedLine('fake-session') },
      { kind: 'print', line: fakeQuestionLine('request-1', [QUESTION]) },
      { kind: 'await-line' },
      { kind: 'print', line: fakeResultLine({ colour: 'Blue' }) },
      { kind: 'exit', code: 0 },
    ]);
    const session = launched(adapter);
    session.stdin.write(`${adapter.chatLineOf('Start.')}\n`);
    session.stdin.write(`${adapter.answerLineOf('request-1', [QUESTION], { 'Which colour?': 'Blue' })}\n`);
    await session.stdin.end();
    const events: AgentSessionEvent[] = (await new Response(session.stdout).text()).split('\n').flatMap((line) => [...adapter.eventsOf(line)]);
    expect(await session.exited).toBe(0);
    expect(events.map((event) => event.kind)).toEqual(['started', 'question', 'result']);
    expect(events.at(-1)).toMatchObject({ kind: 'result', isError: false, structuredReport: { colour: 'Blue' } });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('ends on a stdin line that is not JSON as the recorded claude did: nothing on stdout, its stderr and its exit code', async () => {
    const session = launched(fakeAgentAdapter([{ kind: 'await-line' }, { kind: 'print', line: fakeStartedLine('fake-session') }]));
    session.stdin.write('this line is not JSON\n');
    await session.stdin.end();
    const { ending } = recordedSessionOf('unreadable-input-line');
    expect(await session.exited).toBe(ending.exitCode ?? Number.NaN);
    expect(await new Response(session.stdout).text()).toBe('');
    expect(await new Response(session.stderr).text()).toBe(ending.stderr);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('refuses a scenario line no recording holds: it prints nothing of it and exits 3, naming it', async () => {
    const unrecordedLine = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true });
    const session = launched(fakeAgentAdapter([{ kind: 'print', line: unrecordedLine }, { kind: 'exit', code: 0 }]));
    await session.stdin.end();
    expect(await session.exited).toBe(UNRECORDED_LINE_EXIT_CODE);
    expect(await new Response(session.stdout).text()).toBe('');
    expect(await new Response(session.stderr).text()).toContain(unrecordedLine);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('dies without a result when its scenario crashes, as a killed session does', async () => {
    const session = launched(fakeAgentAdapter([{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'crash' }]));
    await session.stdin.end();
    const output = await new Response(session.stdout).text();
    await session.exited;
    expect(session.signalCode).toBe('SIGKILL');
    expect(output).not.toContain('"result"');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
