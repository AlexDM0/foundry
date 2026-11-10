/**
 * A job's transcript from its Watcher event logs. What matters: a client line reads as what it said, never as the Watcher's frame JSON, and
 * who sent it is derived from the board's own records. A build job's first message, wind-down and resume lines are the Overseer's; a chat
 * equal to User's next unmatched `job message` is User's, so the same text sent twice matches two records in order; an answer is User's
 * unless the Assistant gave it under an incident. The Assistant's k-th chat is chat k: chat 1 its first message, and an incident delivery
 * carries its chat number and incidents. A follower that resumes after a cursor goes on counting from the lines before it. Agent lines
 * keep `toolUseId`, a `result` closes the turn as `turn-end`, and the entries of one log line share its cursor and differ in `entryKey`.
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
import { CLAUDE_STREAM_LINES }                            from '../../lib/claude-code/ClaudeStreamLines.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import type { ActingFrame }                               from '../../lib/watcher/@types/WatcherFrame.ts';
import { createEventLogWriter }                           from '../../lib/watcher/EventLog.ts';
import { watcherFilesOf }                                 from '../../lib/watcher/WatcherFiles.ts';
import type { TranscriptEntry }                           from '../../shared/@types/TranscriptEntry.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { JobTranscript, type TranscriptSenderFacts }      from './JobTranscript.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

type LoggedLine =
  | { readonly origin: 'client'; readonly frame: ActingFrame }
  | { readonly origin: 'agent'; readonly events: readonly AgentSessionEvent[] }
  | { readonly origin: 'watcher'; readonly line: string };

const EXAMPLE_STAMP = '2026-11-10T09:30:00.000Z';
const QUESTION = {
  question: 'Which colour should the button be?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'Blue.' }]
};
const NO_SENDER_FACTS: TranscriptSenderFacts = { userMessageTexts: [], assistantChats: null, requestIdsAnsweredByAssistant: [] };

function chat(text: string): LoggedLine {
  return { origin: 'client', frame: { kind: 'write', line: CLAUDE_STREAM_LINES.chatLineOf(text) } };
}

function answer(requestId: string, answers: Readonly<Record<string, string>>): LoggedLine {
  return { origin: 'client', frame: { kind: 'write', line: CLAUDE_STREAM_LINES.answerLineOf(requestId, [QUESTION], answers) } };
}

function agent(...events: AgentSessionEvent[]): LoggedLine {
  return { origin: 'agent', events };
}

function scratchTrackerDirectory(): string {
  const directory = createScratchDirectory('job-transcript');
  scratchDirectories.push(directory);
  return directory;
}

/** Each instance's lines into its own event log of the job's folder, stamped as a Watcher stamps them. */
function writeEventLogs(trackerDirectory: string, jobId: string, linesByInstance: readonly (readonly LoggedLine[])[]): string {
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, jobId);
  mkdirSync(jobFolder, { recursive: true });
  linesByInstance.forEach((lines, index) => {
    const writer = createEventLogWriter(watcherFilesOf(jobFolder, index + 1).eventLogPath, () => EXAMPLE_STAMP);
    for (const logged of lines) {
      if (logged.origin === 'client') writer.append('client', JSON.stringify(logged.frame));
      else if (logged.origin === 'agent') writer.append('agent', JSON.stringify(logged.events));
      else writer.append('watcher', logged.line);
    }
    writer.syncAndClose();
  });
  return jobFolder;
}

function transcriptOf(
  jobFolder: string,
  newestInstance: number,
  senderFacts: TranscriptSenderFacts,
  after = '',
): { entries: TranscriptEntry[]; senderFactReads: number } {
  let senderFactReads = 0;
  const { entries } = JobTranscript.entriesAfter(jobFolder, newestInstance, JobTranscript.cursorOf(after) ?? { instance: 1, sequence: 0 }, {
    eventsOf:      (line) => JSON.parse(line) as AgentSessionEvent[],
    sentLineOf:    CLAUDE_STREAM_LINES.sentLineOf,
    senderFactsOf: () => {
      senderFactReads += 1;
      return senderFacts;
    },
  });
  return { entries, senderFactReads };
}

interface SenderColumns {
  role:      string;
  sentBy:    string | undefined;
  clientAct: string | undefined;
  text:      string;
}

function senderColumnsOf(entries: readonly TranscriptEntry[]): SenderColumns[] {
  return entries.map(({
    role, sentBy, clientAct, text
  }) => ({
    role, sentBy, clientAct, text
  }));
}

describe('a build job\'s client lines', () => {
  test('read as plain text: the first message, wind-down and resume lines are the Overseer\'s, a job message is User\'s', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [
      [chat('Build #004 Account pages dark mode.'), chat('Use the tokens file.'), chat('Wind down now.')],
      [chat('Resume where you stopped.')],
    ]);
    const facts = { ...NO_SENDER_FACTS, userMessageTexts: ['Use the tokens file.'] };
    expect(senderColumnsOf(transcriptOf(jobFolder, 2, facts).entries)).toEqual([
      {
        role: 'overseer', sentBy: 'overseer', clientAct: 'chat', text: 'Build #004 Account pages dark mode.'
      },
      {
        role: 'user', sentBy: 'user', clientAct: 'chat', text: 'Use the tokens file.'
      },
      {
        role: 'overseer', sentBy: 'overseer', clientAct: 'chat', text: 'Wind down now.'
      },
      {
        role: 'overseer', sentBy: 'overseer', clientAct: 'chat', text: 'Resume where you stopped.'
      },
    ]);
  });

  test('match the same text sent twice to two job messages in order, and a third copy to the Overseer', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[chat('Go on.'), chat('Go on.'), chat('Go on.')]]);
    const facts = { ...NO_SENDER_FACTS, userMessageTexts: ['Go on.', 'Go on.'] };
    expect(transcriptOf(jobFolder, 1, facts).entries.map((entry) => entry.sentBy)).toEqual(['user', 'user', 'overseer']);
  });

  test('read an answer as User\'s with its answers joined, and one the Assistant gave under an incident as the Assistant\'s', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[
      answer('request-user', { [QUESTION.question]: 'Blue' }),
      answer('request-incident', { [QUESTION.question]: 'Red' }),
    ]]);
    const facts = { ...NO_SENDER_FACTS, requestIdsAnsweredByAssistant: ['request-incident'] };
    expect(senderColumnsOf(transcriptOf(jobFolder, 1, facts).entries)).toEqual([
      {
        role: 'user', sentBy: 'user', clientAct: 'answer', text: 'Blue'
      },
      {
        role: 'overseer', sentBy: 'assistant', clientAct: 'answer', text: 'Red'
      },
    ]);
  });

  test('read an interrupt, a closed input and a stop as the Overseer\'s acts, with no text', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[
      { origin: 'client', frame: { kind: 'write', line: CLAUDE_STREAM_LINES.interruptLineOf() } },
      { origin: 'client', frame: { kind: 'close-input' } },
      { origin: 'client', frame: { kind: 'stop', graceMilliseconds: 5000 } },
    ]]);
    expect(senderColumnsOf(transcriptOf(jobFolder, 1, NO_SENDER_FACTS).entries)).toEqual(['interrupt', 'close-input', 'stop'].map((clientAct) => ({
      role: 'overseer', sentBy: 'overseer', clientAct, text: ''
    })));
  });

  test('give no entry for a written line the adapter does not read back', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[{ origin: 'client', frame: { kind: 'write', line: '{"type":"unknown"}' } }]]);
    expect(transcriptOf(jobFolder, 1, NO_SENDER_FACTS).entries).toEqual([]);
  });

  test('resumed after a cursor, go on matching job messages from the lines before it', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[chat('Go on.'), chat('Go on.')]]);
    const facts = { ...NO_SENDER_FACTS, userMessageTexts: ['Go on.'] };
    expect(transcriptOf(jobFolder, 1, facts, '1.1').entries.map((entry) => entry.sentBy)).toEqual(['overseer']);
  });

  test('read no sender facts while no client line is among the entries read', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[chat('Build it.'), { origin: 'watcher', line: 'session started' }]]);
    const { entries, senderFactReads } = transcriptOf(jobFolder, 1, NO_SENDER_FACTS, '1.1');
    expect(entries.map((entry) => entry.role)).toEqual(['watcher']);
    expect(senderFactReads).toBe(0);
  });
});

describe('the Assistant\'s chats', () => {
  test('number its chats: chat 1 is the Overseer\'s, an incident delivery carries its number and incidents, a carried message is User\'s', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J1', [[chat('You are the Assistant.'), chat('Incident I3 is open.'), chat('Look at #004 first.')]]);
    const facts: TranscriptSenderFacts = {
      ...NO_SENDER_FACTS,
      userMessageTexts: ['Look at #004 first.'],
      assistantChats:   [{ sequence: 2, incidentIds: ['I3'], messageNumber: null }, { sequence: 3, incidentIds: [], messageNumber: 1 }],
    };
    expect(transcriptOf(jobFolder, 1, facts).entries.map(({
      role, sentBy, chatSequence, incidentIds
    }) => ({
      role, sentBy, chatSequence, incidentIds
    }))).toEqual([
      {
        role: 'overseer', sentBy: 'overseer', chatSequence: 1, incidentIds: undefined
      },
      {
        role: 'overseer', sentBy: 'overseer', chatSequence: 2, incidentIds: ['I3']
      },
      {
        role: 'user', sentBy: 'user', chatSequence: undefined, incidentIds: undefined
      },
    ]);
  });
});

describe('agent lines', () => {
  test('keep each call\'s toolUseId on the call and its result, and close a turn with turn-end', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[
      agent({
        kind: 'tool-call', toolUseId: 'toolu_example', toolName: 'Read', inputSummary: 'README.md', description: null, parentToolUseId: null
      }),
      agent({
        kind: 'tool-result', toolUseId: 'toolu_example', parentToolUseId: null, isError: false
      }),
      agent({
        kind: 'result', isError: false, structuredReport: null, usageTotals: null, contextTokens: null, costUsd: null, failure: null
      }),
      agent({
        kind: 'result', isError: true, structuredReport: null, usageTotals: null, contextTokens: null, costUsd: null, failure: null
      }),
    ]]);
    expect(transcriptOf(jobFolder, 1, NO_SENDER_FACTS).entries.map(({ role, text, toolUseId }) => ({ role, text, toolUseId }))).toEqual([
      { role: 'tool-call', text: 'README.md', toolUseId: 'toolu_example' },
      { role: 'tool-result', text: '', toolUseId: 'toolu_example' },
      { role: 'turn-end', text: '', toolUseId: undefined },
      { role: 'turn-end', text: 'error', toolUseId: undefined },
    ]);
  });

  test('give the entries of one log line its cursor and stamp, each with its own entry key', () => {
    const jobFolder = writeEventLogs(scratchTrackerDirectory(), 'J4', [[agent(
      {
        kind: 'assistant-turn', messageId: 'message-example', parentToolUseId: null, model: 'example-model', usage: null, text: 'Two calls.'
      },
      {
        kind: 'tool-call', toolUseId: 'toolu_read', toolName: 'Read', inputSummary: 'a.ts', description: null, parentToolUseId: null
      },
      {
        kind: 'tool-call', toolUseId: 'toolu_grep', toolName: 'Grep', inputSummary: 'b', description: null, parentToolUseId: null
      },
    )]]);
    expect(transcriptOf(jobFolder, 1, NO_SENDER_FACTS).entries.map(({ cursor, entryKey, at }) => ({ cursor, entryKey, at }))).toEqual([
      { cursor: '1.1', entryKey: '1.1.0', at: EXAMPLE_STAMP },
      { cursor: '1.1', entryKey: '1.1.1', at: EXAMPLE_STAMP },
      { cursor: '1.1', entryKey: '1.1.2', at: EXAMPLE_STAMP },
    ]);
  });
});

describe('JobTranscript.senderFactsOf', () => {
  const launched = (jobId: string, kind: 'build' | 'assistant'): LogRecord => ({
    at:     EXAMPLE_STAMP,
    kind:   'job-launched',
    jobId,
    fields: {
      kind, role: null, ticketIds: [], attempt: 1, target: null, parentJobId: null
    },
  });

  test('takes the job\'s own messages and reopening texts in log order, and every request answered under an incident', () => {
    const records: LogRecord[] = [
      launched('J4', 'build'),
      {
        at: EXAMPLE_STAMP, kind: 'job-messaged', jobId: 'J4', fields: { text: 'First.' }
      },
      {
        at: EXAMPLE_STAMP, kind: 'job-messaged', jobId: 'J5', fields: { text: 'Another job.' }
      },
      {
        at: EXAMPLE_STAMP, kind: 'job-reopened', jobId: 'J4', fields: { watcherInstance: 2, text: 'Second.', offeredTicketIds: [] }
      },
      {
        at: EXAMPLE_STAMP, kind: 'incident-answered', incidentId: 'I3', fields: { answer: { Colour: 'Blue' }, requestId: 'request-incident' }
      },
    ];
    const facts = JobTranscript.senderFactsOf(records, scratchTrackerDirectory(), 'J4');
    expect(facts.userMessageTexts).toEqual(['First.', 'Second.']);
    expect(facts.assistantChats).toBeNull();
    expect(facts.requestIdsAnsweredByAssistant).toEqual(['request-incident']);
  });

  test('reads the Assistant\'s chats file for an Assistant job', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const chats = [{ sequence: 2, incidentIds: ['I3'], messageNumber: null }];
    const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, 'J1');
    mkdirSync(jobFolder, { recursive: true });
    writeFileSync(join(jobFolder, 'assistant-chats.json'), `${JSON.stringify(chats)}\n`);
    expect(JobTranscript.senderFactsOf([launched('J1', 'assistant')], trackerDirectory, 'J1').assistantChats).toEqual(chats);
  });
});
