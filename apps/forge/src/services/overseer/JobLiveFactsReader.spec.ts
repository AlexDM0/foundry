/**
 * A job's live facts from its Talos event log. What matters: `toolCalls` counts only top-level `tool-call` events, each subagent (by
 * `parentToolUseId`) keeps its own count and last call, `toolCallsWithSubagents` adds them up, `lastToolCall` is the newest call stamped
 * with its log entry's `at` and `running` until its result arrives, and `calls` stays the top-level API turns the budget is held against. A
 * subagent runs until its parent call's result and carries that call's description. After a crash a subagent the log lost is the one the
 * adapter rebuilt from the session's transcripts, asked for past the parent calls the log tallied; the fake agent answers what the spec
 * plants and reads no transcript. The turn reads the newest instance's chats against its results (the Assistant's, its idle rule), the
 * waiting messages read the markers their sender writes, and a session's last line is its newest own words or User's newest chat, never the
 * Overseer's, read without decoding a picture. The usage window is the newest the session reported, so the monitor shows the window it is
 * in.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { AgentSessionEvent }                         from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { SubagentFacts }                             from '../../lib/agent-launch/AgentTranscripts.ts';
import type { ClientEntry }                               from '../../lib/talos/@types/TalosFrame.ts';
import { createEventLogWriter }                           from '../../lib/talos/EventLog.ts';
import type { Incident }                                  from '../../lib/tracker-model/@types/Incident.ts';
import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { DISPATCH_PROTOCOL }                              from '../../shared/constants/DispatchProtocol.ts';
import { fakeAgentAdapter }                               from '../../testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }           from '../../testing/TalosChildReadings.ts';
import { JobLiveFactsReader, type JobLiveFactsSource }    from './JobLiveFactsReader.ts';
import { jobFolderIn }                                    from './OverseerFiles.ts';
import { liveJobFixture }                                 from './testing/LiveJobFixture.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

const EXAMPLE_JOB = { id: 'J1', kind: 'build', childInstance: 1 } as unknown as Readonly<Job>;

/** The fake agent, an adapter of the port: it writes and reads the session's lines as the shipped adapter does. */
const AGENT_LINES = fakeAgentAdapter();

function toolCall(toolUseId: string, toolName: string, parentToolUseId: string | null, description: string | null = null): AgentSessionEvent {
  return {
    kind: 'tool-call', toolUseId, toolName, inputSummary: toolName, description, parentToolUseId, asksUser: false
  };
}

function toolResult(toolUseId: string, parentToolUseId: string | null): AgentSessionEvent {
  return {
    kind: 'tool-result', toolUseId, parentToolUseId, isError: false
  };
}

function assistantTurn(messageId: string, parentToolUseId: string | null, text = ''): AgentSessionEvent {
  return {
    kind:  'assistant-turn',
    messageId,
    parentToolUseId,
    model: 'example-model',
    usage: {
      inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0
    },
    text,
  };
}

const RESULT: AgentSessionEvent = {
  kind: 'result', isError: false, structuredReport: null, usageTotals: null, contextTokens: null, costUsd: null, failure: null
};

/** A line Talos logged for the job: what the session printed, or a client entry of what the Overseer sent it. */
type LoggedLine = AgentSessionEvent | ClientEntry;

function chat(text: string): ClientEntry {
  return { act: 'write-line', line: AGENT_LINES.chatLineOf(text) };
}

function messaged(jobId: string, text: string): LogRecord {
  return {
    kind: 'job-messaged', jobId, fields: { text }, at: '2026-10-29T11:59:00Z'
  };
}

function isClientEntry(logged: LoggedLine): logged is ClientEntry {
  return 'act' in logged;
}

const EVENTS_OF_ONE_EVENT_PER_LINE = (line: string): readonly AgentSessionEvent[] => [JSON.parse(line) as AgentSessionEvent];

/** The board a live facts read sees: its log, and the incidents the Assistant's chats are numbered by. */
interface ReadingBoard {
  logRecords?: readonly LogRecord[];
  incidents?:  readonly Incident[];
}

const EXAMPLE_SESSION_ID = 'session-example';

function scratchDirectoryFor(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

/** A subagent the adapter rebuilt from its transcript: a tool call answered, a second left open, and one API turn of 100 tokens. */
function rebuiltSubagent(parentToolUseId: string, description: string | null = null): SubagentFacts {
  return {
    parentToolUseId,
    toolCalls:    2,
    lastToolCall: { toolName: 'Grep', startedAt: '2026-10-29T13:00:03Z', running: true },
    tokens:       100,
    description,
  };
}

/** Each instance's lines into its own event log in the job's folder, stamped in order across instances; an event is one agent line. */
function writeEventLogs(trackerDirectory: string, jobId: string, linesByInstance: readonly (readonly LoggedLine[])[]): string {
  const jobFolder = jobFolderIn(trackerDirectory, jobId);
  mkdirSync(jobFolder, { recursive: true });
  let second = 0;
  linesByInstance.forEach((lines, index) => {
    const writer = createEventLogWriter(childFilesIn(jobFolder, index + 1).eventLogPath, () => {
      second += 1;
      return `2026-10-29T12:00:${String(second).padStart(2, '0')}Z`;
    });
    for (const logged of lines) writer.append(isClientEntry(logged) ? 'client' : 'agent', JSON.stringify(logged));
    writer.syncAndClose();
  });
  return jobFolder;
}

/** The adapter's transcript read answers the planted subagents its session lost, as the fake agent answers what a spec plants. */
function liveFactsSourceOf(trackerDirectory: string, readingBoard: ReadingBoard = {}, lostSubagents: readonly SubagentFacts[] = []): JobLiveFactsSource {
  return {
    boardChildren: talosChildReadingsWith(nativePlatformPorts(), trackerDirectory),
    trackerDirectory,
    adapter:       {
      eventsOf:           EVENTS_OF_ONE_EVENT_PER_LINE,
      sentLineOf:         AGENT_LINES.sentLineOf,
      sessionSubagentsOf: fakeAgentAdapter(undefined, undefined, { sessionSubagents: lostSubagents }).sessionSubagentsOf,
    },
    board: { logRecordsSoFar: () => readingBoard.logRecords ?? [], incidents: () => readingBoard.incidents ?? [] },
  };
}

const EXAMPLE_SESSION = { homeDirectory: '/example/home', sessionId: EXAMPLE_SESSION_ID };

/** The live facts of `job` (J1, a build, by default) in a scratch tracker whose Talos logged one list of lines per instance. */
function liveFactsOfLoggedLines(linesByInstance: readonly (readonly LoggedLine[])[], job: Readonly<Job> = EXAMPLE_JOB, readingBoard: ReadingBoard = {}) {
  const trackerDirectory = scratchDirectoryFor('live-facts');
  writeEventLogs(trackerDirectory, job.id, linesByInstance);
  return JobLiveFactsReader.liveFactsOf(liveFactsSourceOf(trackerDirectory, readingBoard), job, EXAMPLE_SESSION);
}

/** A scratch tracker whose job J1 logged each event as one agent line, stamped in order; the mapper reads a line as the event itself. */
function liveFactsOfLoggedEvents(events: readonly AgentSessionEvent[], lostSubagents: readonly SubagentFacts[] = []) {
  const trackerDirectory = scratchDirectoryFor('live-facts');
  writeEventLogs(trackerDirectory, EXAMPLE_JOB.id, [events]);
  return JobLiveFactsReader.liveFactsOf(liveFactsSourceOf(trackerDirectory, {}, lostSubagents), EXAMPLE_JOB, EXAMPLE_SESSION);
}

describe('JobLiveFactsReader', () => {
  test('two top-level and three subagent tool calls count 2, 3 and 5, and the open call reads running with its log stamp', () => {
    const facts = liveFactsOfLoggedEvents([
      assistantTurn('message-1', null),
      toolCall('call-1', 'Read', null),
      toolResult('call-1', null),
      toolCall('call-2', 'Agent', null),
      assistantTurn('message-2', 'call-2'),
      toolCall('sub-1', 'Grep', 'call-2'),
      toolResult('sub-1', 'call-2'),
      toolCall('sub-2', 'Read', 'call-2'),
      toolResult('sub-2', 'call-2'),
      toolCall('sub-3', 'Bash', 'call-2'),
    ]);
    expect(facts.toolCalls).toBe(2);
    expect(facts.subagents).toEqual([{
      parentToolUseId: 'call-2',
      toolCalls:       3,
      lastToolCall:    { toolName: 'Bash', startedAt: '2026-10-29T12:00:10Z', running: true },
      tokens:          15,
      state:           'running',
      description:     null,
    }]);
    expect(facts.toolCallsWithSubagents).toBe(5);
    expect(facts.lastToolCall).toEqual({ toolName: 'Agent', startedAt: '2026-10-29T12:00:04Z', running: true });
    expect(facts.calls).toBe(1);
    expect(facts.callBudget).toBe(DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET);
    expect(facts.tokens).toBe(30);
  });

  test('a call whose result arrived reads not running, and a job that called no tool has no last call', () => {
    expect(liveFactsOfLoggedEvents([toolCall('call-1', 'Read', null), toolResult('call-1', null)]).lastToolCall)
      .toEqual({ toolName: 'Read', startedAt: '2026-10-29T12:00:01Z', running: false });
    const quiet = liveFactsOfLoggedEvents([assistantTurn('message-1', null)]);
    expect(quiet.lastToolCall).toBeNull();
    expect(quiet.toolCalls).toBe(0);
    expect(quiet.subagents).toEqual([]);
    expect(quiet.toolCallsWithSubagents).toBe(0);
  });

  test('a subagent that only spoke still gets its row and tokens, and with no parent call in the log it reads ended', () => {
    expect(liveFactsOfLoggedEvents([assistantTurn('message-1', 'call-9')]).subagents).toEqual([{
      parentToolUseId: 'call-9', toolCalls: 0, lastToolCall: null, tokens: 15, state: 'ended', description: null
    }]);
  });

  test('a subagent runs until its parent call\'s result, then reads ended, and carries the description its parent call gave', () => {
    const spawned = [
      toolCall('call-2', 'Agent', null, 'Example basket badge audit'),
      assistantTurn('message-2', 'call-2'),
      toolCall('sub-1', 'Grep', 'call-2'),
    ];
    expect(liveFactsOfLoggedEvents(spawned).subagents).toMatchObject([{ parentToolUseId: 'call-2', state: 'running', description: 'Example basket badge audit' }]);
    // The subagent's own call answered is not its parent's: it still runs.
    expect(liveFactsOfLoggedEvents([...spawned, toolResult('sub-1', 'call-2')]).subagents).toMatchObject([{ state: 'running' }]);
    expect(liveFactsOfLoggedEvents([...spawned, toolResult('sub-1', 'call-2'), toolResult('call-2', null)]).subagents)
      .toMatchObject([{ state: 'ended', description: 'Example basket badge audit' }]);
  });

  test('after a crash the event log lost its subagents, the two the adapter rebuilt from the session\'s transcripts are listed, added to the totals', () => {
    const facts = liveFactsOfLoggedEvents([
      assistantTurn('message-1', null),
      toolCall('call-2', 'Agent', null),
      toolCall('call-3', 'Agent', null),
    ], [rebuiltSubagent('call-2'), rebuiltSubagent('call-3')]);
    const rebuiltFacts = {
      toolCalls: 2, lastToolCall: { toolName: 'Grep', startedAt: '2026-10-29T13:00:03Z', running: true }, tokens: 100, state: 'running' as const, description: null
    };
    expect(facts.subagents).toEqual([{ parentToolUseId: 'call-2', ...rebuiltFacts }, { parentToolUseId: 'call-3', ...rebuiltFacts }]);
    expect(facts.toolCalls).toBe(2);
    expect(facts.toolCallsWithSubagents).toBe(6);
    expect(facts.tokens).toBe(215);
    expect(facts.calls).toBe(1);
  });

  test('a subagent the event log holds is read from the log alone, and only the one it lost comes from the adapter', () => {
    const facts = liveFactsOfLoggedEvents([
      toolCall('call-2', 'Agent', null),
      assistantTurn('message-2', 'call-2'),
      toolCall('sub-1', 'Bash', 'call-2'),
    ], [rebuiltSubagent('call-2'), rebuiltSubagent('call-3')]);
    expect(facts.subagents.map((subagent) => [subagent.parentToolUseId, subagent.toolCalls, subagent.tokens])).toEqual([['call-2', 1, 15], ['call-3', 2, 100]]);
    expect(facts.toolCallsWithSubagents).toBe(4);
  });

  test('a rebuilt subagent keeps the description the adapter read, and reads ended once its parent call is answered or the log lost that call', () => {
    const lostSubagents = [rebuiltSubagent('call-2', 'Example checkout audit'), rebuiltSubagent('call-3'), rebuiltSubagent('call-4')];
    const facts = liveFactsOfLoggedEvents([toolCall('call-2', 'Agent', null), toolCall('call-3', 'Agent', null), toolResult('call-3', null)], lostSubagents);
    expect(facts.subagents.map(({ parentToolUseId, state, description }) => ({ parentToolUseId, state, description }))).toEqual([
      { parentToolUseId: 'call-2', state: 'running', description: 'Example checkout audit' },
      { parentToolUseId: 'call-3', state: 'ended', description: null },
      { parentToolUseId: 'call-4', state: 'ended', description: null },
    ]);
  });

  test('the adapter is asked for the job session\'s subagents on its home, past the parent calls the log already tallied', () => {
    const trackerDirectory = scratchDirectoryFor('live-facts');
    writeEventLogs(trackerDirectory, EXAMPLE_JOB.id, [[toolCall('call-2', 'Agent', null), assistantTurn('message-2', 'call-2')]]);
    const asked: [string, string, string[]][] = [];
    const source = liveFactsSourceOf(trackerDirectory);
    const askingSource: JobLiveFactsSource = {
      ...source,
      adapter: {
        ...source.adapter,
        sessionSubagentsOf: (homeDirectory, sessionId, talliedParentToolUseIds) => {
          asked.push([homeDirectory, sessionId, [...talliedParentToolUseIds]]);
          return [];
        },
      },
    };
    JobLiveFactsReader.liveFactsOf(askingSource, EXAMPLE_JOB, EXAMPLE_SESSION);
    expect(asked).toEqual([['/example/home', EXAMPLE_SESSION_ID, ['call-2']]]);
  });
});

function usageWindow(window: string, lengthHours: number | null, resetsAt: string, requestsRefused = false): AgentSessionEvent {
  return {
    kind: 'usage-window', window, lengthHours, utilization: 0.5, resetsAt, status: requestsRefused ? 'rejected' : 'allowed', requestsRefused
  };
}

describe('the usage window', () => {
  test('is the newest window the session reported, of any instance, refused or not, stamped with its log entry', () => {
    const resumed = { ...EXAMPLE_JOB, childInstance: 2 };
    expect(liveFactsOfLoggedLines([
      [usageWindow('five_hour', 5, '2026-10-29T15:00:00.000Z'), RESULT],
      [usageWindow('seven_day', 168, '2026-11-02T09:00:00.000Z', true), assistantTurn('message-1', null)],
    ], resumed).usageWindow).toEqual({
      window: 'seven_day', lengthHours: 168, resetsAt: '2026-11-02T09:00:00.000Z', reportedAt: '2026-10-29T12:00:03Z'
    });
  });

  test('is null before the session reported one', () => {
    expect(liveFactsOfLoggedEvents([assistantTurn('message-1', null), RESULT]).usageWindow).toBeNull();
  });
});

describe('the turn', () => {
  test('a build is mid-turn after a chat it took and between turns once its session printed the result', () => {
    expect(liveFactsOfLoggedLines([[chat('Example first message')]]).turn).toBe('mid-turn');
    expect(liveFactsOfLoggedLines([[chat('Example first message'), assistantTurn('message-1', null), RESULT]]).turn).toBe('between-turns');
    expect(liveFactsOfLoggedLines([[chat('Example first message'), RESULT, chat('Use the tokens file.')]]).turn).toBe('mid-turn');
  });

  test('an answer to a question starts no turn', () => {
    const answerLine = AGENT_LINES.answerLineOf('request-1', [], { 'Which colour?': 'Blue' });
    expect(liveFactsOfLoggedLines([[chat('Example first message'), RESULT, { act: 'write-line', line: answerLine }]]).turn).toBe('between-turns');
  });

  // A crashed instance's unanswered chat is no turn of the resumed session: the resume line is its first chat.
  test('only the newest instance counts', () => {
    const resumed = { ...EXAMPLE_JOB, childInstance: 2 };
    expect(liveFactsOfLoggedLines([[chat('Example first message')], [chat('Example resume line'), RESULT]], resumed).turn).toBe('between-turns');
    expect(liveFactsOfLoggedLines([[chat('Example first message'), RESULT], [chat('Example resume line')]], resumed).turn).toBe('mid-turn');
  });

  test('a job with no agent session, and one before its first child logged a line, has no turn', () => {
    expect(liveFactsOfLoggedLines([[RESULT]], liveJobFixture({ id: 'J2', kind: 'merge', role: null })).turn).toBeNull();
    expect(liveFactsOfLoggedLines([]).turn).toBeNull();
  });

  // The Assistant numbers a chat on the board before its line is written, and its deliveries wait on that number, not on the log.
  test('the Assistant\'s turn is its idle rule: a chat decided on the board makes it mid-turn before any line is written', () => {
    const assistant = liveJobFixture({
      id: 'J900', kind: 'assistant', role: 'assistant', target: null
    });
    const answeredBoot = [[chat('Example boot prompt'), assistantTurn('message-1', null), RESULT]];
    expect(liveFactsOfLoggedLines(answeredBoot, assistant).turn).toBe('between-turns');
    const deliveredInChatTwo = { id: 'I1', deliveredInTurn: { jobId: 'J900', chatSequence: 2 } } as unknown as Incident;
    expect(liveFactsOfLoggedLines(answeredBoot, assistant, { incidents: [deliveredInChatTwo] }).turn).toBe('mid-turn');
    expect(liveFactsOfLoggedLines(answeredBoot, { ...assistant, state: 'stopping' }).turn).toBe('mid-turn');
  });
});

describe('the messages waiting', () => {
  test('a job\'s messages count until the marker their sender writes once Talos took the line', () => {
    const trackerDirectory = scratchDirectoryFor('live-facts');
    const jobFolder = writeEventLogs(trackerDirectory, EXAMPLE_JOB.id, [[]]);
    mkdirSync(join(jobFolder, 'control-frames'), { recursive: true });
    writeFileSync(join(jobFolder, 'control-frames', 'message-1'), '');
    const logRecords = [messaged('J1', 'Use the tokens file.'), messaged('J2', 'Another job\'s message.'), messaged('J1', 'And the dark theme.')];
    expect(JobLiveFactsReader.liveFactsOf(liveFactsSourceOf(trackerDirectory, { logRecords }), EXAMPLE_JOB, EXAMPLE_SESSION).messagesWaiting).toBe(1);
  });

  test('the Assistant\'s messages count until the chat that carries each was taken', () => {
    const assistant = liveJobFixture({
      id: 'J900', kind: 'assistant', role: 'assistant', target: null
    });
    const trackerDirectory = scratchDirectoryFor('live-facts');
    const jobFolder = writeEventLogs(trackerDirectory, assistant.id, [[]]);
    writeFileSync(join(jobFolder, 'assistant-chats.json'), JSON.stringify([
      { sequence: 2, incidentIds: [], messageNumber: 1 },
      { sequence: 3, incidentIds: [], messageNumber: 2 },
    ]));
    mkdirSync(join(jobFolder, 'assistant-frames'), { recursive: true });
    writeFileSync(join(jobFolder, 'assistant-frames', 'chat-2'), '');
    const logRecords = ['First example message.', 'Second example message.', 'Third example message.'].map((text) => messaged(assistant.id, text));
    expect(JobLiveFactsReader.liveFactsOf(liveFactsSourceOf(trackerDirectory, { logRecords }), assistant, EXAMPLE_SESSION).messagesWaiting).toBe(2);
  });
});

describe('the last line', () => {
  const productOwner = liveJobFixture({
    id: 'J7', kind: 'product-owner', role: 'product-owner', target: null
  });
  const intake = [
    chat('Example intake prompt from the Overseer'),
    assistantTurn('message-1', null, 'Which pages should change?'),
    RESULT,
    chat('The checkout pages.'),
  ];
  const userMessage = { logRecords: [messaged('J7', 'The checkout pages.')] };

  test('a session\'s last line is User\'s newest chat while the session said nothing since, and never the Overseer\'s line or a subagent\'s', () => {
    expect(liveFactsOfLoggedLines([intake], productOwner, userMessage).lastLine)
      .toEqual({ role: 'user', text: 'The checkout pages.', at: '2026-10-29T12:00:04Z' });
    const quietSince = [...intake, assistantTurn('message-2', 'call-9', 'A subagent\'s words.'), assistantTurn('message-3', null), chat('Example wind-down from the Overseer')];
    expect(liveFactsOfLoggedLines([quietSince], productOwner, userMessage).lastLine).toMatchObject({ role: 'user', text: 'The checkout pages.' });
  });

  test('the session\'s newest words with text are its last line, across child instances', () => {
    expect(liveFactsOfLoggedLines([intake, [assistantTurn('message-2', null, 'Filed two drafts.')]], { ...productOwner, childInstance: 2 }, userMessage).lastLine)
      .toEqual({ role: 'assistant', text: 'Filed two drafts.', at: '2026-10-29T12:00:05Z' });
  });

  test('the last line reads no picture: a chat\'s pictures are neither decoded nor hashed on a facts read', () => {
    const trackerDirectory = scratchDirectoryFor('live-facts');
    const pictureChat: ClientEntry = { act: 'write-line', line: AGENT_LINES.chatLineOf('Like this.', [{ mediaType: 'image/png', base64Data: 'iVBORw0KGgo=' }]) };
    writeEventLogs(trackerDirectory, productOwner.id, [[...intake, pictureChat]]);
    let pictureReads = 0;
    const source = liveFactsSourceOf(trackerDirectory, { logRecords: [messaged('J7', 'The checkout pages.'), messaged('J7', 'Like this.')] });
    const countingSource: JobLiveFactsSource = {
      ...source,
      adapter: {
        ...source.adapter,
        sentLineOf: (line) => {
          const sent = AGENT_LINES.sentLineOf(line);
          if (sent?.act !== 'chat') return sent;
          return {
            ...sent,
            pictures: sent.pictures.map((picture) => ({
              mediaType: picture.mediaType,
              get base64Data() {
                pictureReads += 1;
                return picture.base64Data;
              },
            })),
          };
        },
      },
    };
    expect(JobLiveFactsReader.liveFactsOf(countingSource, productOwner, EXAMPLE_SESSION).lastLine).toMatchObject({ role: 'user', text: 'Like this.' });
    expect(pictureReads).toBe(0);
  });

  test('a pipeline agent\'s newest words are its last line, as a product owner\'s are', () => {
    const pipelineAgent = liveJobFixture({
      id: 'J7', kind: 'pipeline-agent', role: 'pipeline-agent', target: null
    });
    expect(liveFactsOfLoggedLines([intake, [assistantTurn('message-2', null, 'Proposed two gates.')]], { ...pipelineAgent, childInstance: 2 }, userMessage).lastLine)
      .toEqual({ role: 'assistant', text: 'Proposed two gates.', at: '2026-10-29T12:00:05Z' });
  });

  test('a build has no last line, and a session that said nothing yet has none', () => {
    expect(liveFactsOfLoggedLines([[assistantTurn('message-1', null, 'Reading the code.')]]).lastLine).toBeNull();
    expect(liveFactsOfLoggedLines([[chat('Example intake prompt from the Overseer')]], productOwner).lastLine).toBeNull();
  });
});
