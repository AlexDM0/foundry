/**
 * The resume rules as pure verdicts. What matters: only an instance past the first is a resume, and it is told it was interrupted rather
 * than handed its task again; a resume fails only when the session exited by itself before it ever started, a first instance included when
 * its launch resumed the session of another job; and only the newest earlier job
 * of the same work decides whether a fresh job inherits a replaced session's worktree. An Airlock agent carries on the session of its
 * ticket's last worker, whatever its own role, unless an agent of its merge was replaced. A fresh instance's first message survives a Talos
 * that answers nothing on one pass and is sent once, its marker following the taken frame.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { RedHandoffFacts }                           from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { Job }                                       from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../domain/tracker-model/@types/LogRecord.ts';
import { type FrameRecordingTalos, frameRecordingTalos }  from '../../testing/FrameRecordingTalos.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { sentActLinesOf }                                 from '../../testing/SentActLines.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { JobResumption }                                  from './JobResumption.ts';
import { RedHandoff }                                     from './RedHandoff.ts';

const AT = '2026-09-18T22:11:03+02:00';

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id:                 'J2',
    kind:               'build',
    role:               'builder',
    ticketIds:          ['001'],
    parentJobId:        null,
    attempt:            1,
    target:             'main',
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...overrides,
  };
}

function launched(jobId: string, kind: 'build' | 'review', ticketIds: string[]): LogRecord {
  return {
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind, role: kind === 'build' ? 'builder' : 'reviewer', ticketIds, attempt: 1, target: 'main', parentJobId: null
    }
  };
}

function ended(jobId: string, outcome: 'replaced' | 'failed' | 'built' | 'does-not-hold'): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }
  };
}

describe('the launch of a job\'s current instance', () => {
  test('the first instance gets its task; a later one resumes and is told it was interrupted', () => {
    expect(JobResumption.launchPartsOf(buildJob(), 'Example task', 'Example resume')).toEqual({ resume: false, firstMessage: 'Example task' });
    expect(JobResumption.launchPartsOf(buildJob({ childInstance: 2 }), 'Example task', 'Example resume')).toEqual({ resume: true, firstMessage: 'Example resume' });
  });

  test('a reopened product owner resumes with User\'s message, in the instance its reopening names only', () => {
    const reopened: LogRecord = {
      at: AT, kind: 'job-reopened', jobId: 'J2', fields: { childInstance: 2, text: 'Example follow-up', offeredTicketIds: [] }
    };
    const job = buildJob({ kind: 'product-owner', role: 'product-owner', childInstance: 2 });
    const reopenText = JobResumption.reopenTextOf([reopened], job);
    expect(JobResumption.launchPartsOf(job, 'Example task', 'Example resume', reopenText)).toEqual({ resume: true, firstMessage: 'Example follow-up' });
    expect(JobResumption.reopenTextOf([reopened], { ...job, childInstance: 3 })).toBeNull();
  });
});

describe('the first message of a fresh instance', () => {
  let trackerDirectory = '';
  let talos: FrameRecordingTalos;

  beforeEach(() => {
    trackerDirectory = createScratchDirectory('first-message');
    talos            = frameRecordingTalos(trackerDirectory, nativePlatformPorts());
  });

  afterEach(() => {
    removeScratchDirectory(trackerDirectory);
  });

  function plantLiveSession(job: Job): void {
    talos.plantLiveChild(jobFolderIn(trackerDirectory, job.id), job.childInstance);
  }

  test('a Talos answering nothing on one pass is sent the line on the next pass, and never again once it took it', async () => {
    const job        = buildJob();
    const jobs       = { jobs: (): readonly Readonly<Job>[] => [job] };
    const adapter    = { chatLineOf: (message: string): string => `chat:${message}` };
    plantLiveSession(job);
    const jobFolder  = jobFolderIn(trackerDirectory, job.id);
    JobResumption.storeFirstMessage(jobFolder, 1, 'Example task');

    talos.answers(false);
    await JobResumption.deliverFirstMessages(talos.boardChildren, trackerDirectory, jobs, adapter);
    talos.answers(true);
    expect(existsSync(join(jobFolder, 'first-message-1.sent'))).toBe(false);

    await JobResumption.deliverFirstMessages(talos.boardChildren, trackerDirectory, jobs, adapter);
    await JobResumption.deliverFirstMessages(talos.boardChildren, trackerDirectory, jobs, adapter);
    expect(sentActLinesOf(talos.frames())).toEqual([JSON.stringify({ act: 'write-line', line: 'chat:Example task' })]);
    expect(existsSync(join(jobFolder, 'first-message-1.sent'))).toBe(true);
  });

  test('a resumed instance is never sent a stored first message', async () => {
    const job = buildJob({ childInstance: 2 });
    plantLiveSession(job);
    const jobFolder = jobFolderIn(trackerDirectory, job.id);
    JobResumption.storeFirstMessage(jobFolder, 2, 'Example task');
    await JobResumption.deliverFirstMessages(talos.boardChildren, trackerDirectory, { jobs: () => [job] }, { chatLineOf: (message) => message });
    expect(talos.frames()).toEqual([]);
    expect(existsSync(join(jobFolder, 'first-message-2.sent'))).toBe(false);
  });
});

describe('a failed resume', () => {
  test('is a resumed instance that exited by itself before its session started', () => {
    expect(JobResumption.resumeFailed(buildJob({ childInstance: 2 }), 'J2', true, false)).toBe(true);
  });

  test('is a first instance that exited by itself before it started when its launch resumed the session of another job', () => {
    expect(JobResumption.resumeFailed(buildJob(), 'J1', true, false)).toBe(true);
  });

  test('is never a first instance of its own session, a started session or one killed or lost before it started', () => {
    expect(JobResumption.resumeFailed(buildJob(), 'J2', true, false)).toBe(false);
    expect(JobResumption.resumeFailed(buildJob({ childInstance: 2 }), 'J2', true, true)).toBe(false);
    expect(JobResumption.resumeFailed(buildJob({ childInstance: 2 }), 'J2', false, false)).toBe(false);
  });
});

// A review that did not hold resumes the builder's own session, so the build job after it carries on the session it was sent back from.
describe('the session a build job carries on', () => {
  const builtThenSentBack = [launched('J1', 'build', ['001']), ended('J1', 'built'), launched('R1', 'review', ['001']), ended('R1', 'does-not-hold')];

  test('is the builder its review sent back, across every later round', () => {
    expect(JobResumption.sessionOwnerJobIdOf([...builtThenSentBack, launched('J2', 'build', ['001'])], buildJob())).toBe('J1');
    const secondRound = [...builtThenSentBack, launched('J2', 'build', ['001']), ended('J2', 'built'), launched('J3', 'build', ['001'])];
    expect(JobResumption.sessionOwnerJobIdOf(secondRound, buildJob({ id: 'J3' }))).toBe('J1');
  });

  test('is the job itself when it starts a new attempt, as after an unhold', () => {
    const nextAttempt: LogRecord = { ...launched('J2', 'build', ['001']), fields: { ...launched('J2', 'build', ['001']).fields, attempt: 2 } } as LogRecord;
    expect(JobResumption.sessionOwnerJobIdOf([...builtThenSentBack, nextAttempt], buildJob({ id: 'J2', attempt: 2 }))).toBe('J2');
  });

  test('is the job itself after a replaced or failed build, and for a reviewer', () => {
    const afterReplaced = [launched('J1', 'build', ['001']), ended('J1', 'replaced'), launched('J2', 'build', ['001'])];
    expect(JobResumption.sessionOwnerJobIdOf(afterReplaced, buildJob())).toBe('J2');
    const review = buildJob({ id: 'R2', kind: 'review', role: 'reviewer' });
    expect(JobResumption.sessionOwnerJobIdOf([...builtThenSentBack, launched('R2', 'review', ['001'])], review)).toBe('R2');
  });

  test('is sent only the newest review section of the ticket', () => {
    const body = '## Report\nx\n\n## Review 1\n\nold\n\n## Review 2\n\n- A1 does-not-hold — the example fails\n\n## Notes\nlater\n';
    expect(JobResumption.newestReviewSectionOf(body)).toBe('## Review 2\n\n- A1 does-not-hold — the example fails');
    expect(JobResumption.newestReviewSectionOf('## Report\nx\n')).toBe('');
  });
});

function launchedInAirlock(jobId: string, role: 'builder' | 'reviewer'): LogRecord {
  return {
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind: 'merge-agent', role, ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: 'M1'
    }
  };
}

// The Airlock sends a conflict or a red merged tree to the ticket's most recent agent, so that agent's own session must carry on.
describe('the session an Airlock agent carries on', () => {
  const reviewed = [
    launched('J1', 'build', ['001']),
    ended('J1', 'built'),
    launched('R1', 'review', ['001']),
    ended('R1', 'does-not-hold'),
    launched('J2', 'build', ['001']),
    ended('J2', 'built'),
    launched('R2', 'review', ['001']),
    ended('R2', 'built'),
  ];
  const airlockReviewer = buildJob({
    id: 'A1', kind: 'merge-agent', role: 'reviewer', parentJobId: 'M1'
  });

  test('is the ticket\'s last worker whatever the agent\'s role, or the builder session that last worker\'s build carried on', () => {
    expect(JobResumption.sessionOwnerJobIdOf([...reviewed, launchedInAirlock('A1', 'reviewer')], airlockReviewer)).toBe('R2');
    const airlockBuilder = buildJob({
      id: 'A1', kind: 'merge-agent', role: 'builder', parentJobId: 'M1'
    });
    expect(JobResumption.sessionOwnerJobIdOf([...reviewed, launchedInAirlock('A1', 'builder')], airlockBuilder)).toBe('R2');
    const builtLast = [...reviewed.slice(0, 6), launchedInAirlock('A1', 'reviewer')];
    expect(JobResumption.sessionOwnerJobIdOf(builtLast, airlockReviewer)).toBe('J1');
  });

  test('is its own after an Airlock agent of the same merge ended replaced, or with no ended worker on its ticket', () => {
    const afterReplaced = [...reviewed, launchedInAirlock('A1', 'reviewer'), ended('A1', 'replaced'), launchedInAirlock('A2', 'reviewer')];
    expect(JobResumption.sessionOwnerJobIdOf(afterReplaced, { ...airlockReviewer, id: 'A2' })).toBe('A2');
    expect(JobResumption.sessionOwnerJobIdOf([launchedInAirlock('A1', 'reviewer')], airlockReviewer)).toBe('A1');
  });

  test('failed to resume when its first instance exited by itself before starting, and only when it carries on a session', () => {
    const ownerOf = (records: readonly LogRecord[]): string => JobResumption.sessionOwnerJobIdOf(records, airlockReviewer);
    expect(JobResumption.resumeFailed(airlockReviewer, ownerOf([...reviewed, launchedInAirlock('A1', 'reviewer')]), true, false)).toBe(true);
    expect(JobResumption.resumeFailed(airlockReviewer, ownerOf([launchedInAirlock('A1', 'reviewer')]), true, false)).toBe(false);
  });
});

describe('the earlier-session note', () => {
  test('goes to a fresh job whose newest earlier job of the same work ended replaced', () => {
    const records = [launched('J1', 'build', ['001']), ended('J1', 'replaced'), launched('J2', 'build', ['001'])];
    expect(JobResumption.earlierSessionWasReplaced(records, buildJob())).toBe(true);
  });

  test('does not go to a job whose newest earlier job ended otherwise, or whose replaced job did other work', () => {
    const laterFailure = [launched('J1', 'build', ['001']), ended('J1', 'replaced'), launched('J3', 'build', ['001']), ended('J3', 'failed')];
    expect(JobResumption.earlierSessionWasReplaced(laterFailure, buildJob({ id: 'J4' }))).toBe(false);
    const otherWork = [launched('J1', 'review', ['001']), ended('J1', 'replaced'), launched('J3', 'build', ['002']), ended('J3', 'replaced')];
    expect(JobResumption.earlierSessionWasReplaced(otherWork, buildJob({ id: 'J4' }))).toBe(false);
  });
});

describe('a red handoff\'s resume', () => {
  let trackerDirectory = '';
  const messages = { resumeMessage: 'Example resume message', redHandoffMessageOf: (facts: Readonly<RedHandoffFacts>) => `Red ${facts.name}, resume ${facts.resume}` };

  beforeEach(() => {
    trackerDirectory = createScratchDirectory('red-resume');
  });

  afterEach(() => {
    removeScratchDirectory(trackerDirectory);
  });

  function writeRedFacts(jobId: string): void {
    const jobFolder = jobFolderIn(trackerDirectory, jobId);
    mkdirSync(jobFolder, { recursive: true });
    RedHandoff.writeRedHandoff(jobFolder, {
      kind:                'gate',
      name:                'tests',
      command:             'bun test',
      fixCommand:          null,
      commit:              'example-commit',
      exitCode:            1,
      gateFailureNotePath: RedHandoff.gateFailureNotePathOf(jobFolder),
      fullLogPath:         null,
      resume:              1,
      resumesAllowed:      2,
      callBudget:          30,
      interruptedInstance: 1,
    }, 'expected 2, received 3');
  }

  function interrupted(jobId: string, cause: 'handoff-red' | 'talos-lost'): LogRecord {
    return {
      at: AT, kind: 'job-interrupted', jobId, fields: { cause, childInstance: 1 }
    };
  }

  test('opens the resumed session with the red handoff\'s message, never the plain resume line', () => {
    writeRedFacts('J2');
    const board = { logRecordsSoFar: () => [] };

    expect(JobResumption.resumeLineOf(trackerDirectory, board, buildJob({ childInstance: 2, interruption: 'handoff-red' }), messages)).toBe('Red tests, resume 1');
    expect(JobResumption.resumeLineOf(trackerDirectory, board, buildJob({ childInstance: 2, interruption: 'talos-lost' }), messages)).toBe('Example resume message');
  });

  test('hands a fresh session taking over an unresumable red handoff the same facts, its calls counted from its own first instance', () => {
    writeRedFacts('J1');
    const records = [launched('J1', 'build', ['001']), interrupted('J1', 'handoff-red'), ended('J1', 'replaced'), launched('J2', 'build', ['001'])];

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, records, buildJob())).toMatchObject({ name: 'tests', resume: 1, interruptedInstance: 0 });
  });

  test('hands nothing to a fresh session whose predecessor was replaced after a crash', () => {
    writeRedFacts('J1');
    const records = [launched('J1', 'build', ['001']), interrupted('J1', 'talos-lost'), ended('J1', 'replaced'), launched('J2', 'build', ['001'])];

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, records, buildJob())).toBeNull();
  });
});
