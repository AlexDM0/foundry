/**
 * A job file Hephaestus kept that its ingestion cannot read stops the step that needs it. What matters: the hold opens one
 * `system-file-unreadable` incident on the job whose step read the file, naming the file inside the board's data folder, also when the file
 * is another job's; the job keeps its state and takes no step on the file, nothing is recorded as if the file said something, and the next
 * pass opens no second incident. A park stops the job, so no pass after it opens the incident again; a fresh agent ends a job whose child
 * was never launched, and a stop is never held up by an unreadable red handoff. A file that is absent keeps the meaning absence always had.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import { afterEach, expect, test }  from 'bun:test';

import type { Job }                                                   from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                              from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Board }                                                 from '../../lib/tracker-model/Board.ts';
import { transitionalWordedProblemOf }                                from '../../shared/TransitionalWordedProblem.ts';
import { boardFixture, ticketFixture }                                from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import type { BoardTransaction }                                      from '../tracker/BoardTransaction.ts';
import { jobFolderIn }                                                from './HephaestusFiles.ts';
import { type BuildJobObservation, JobLaunch, type JobLaunchContext } from './JobLaunch.ts';
import { UnreadableJobFileIncident }                                  from './UnreadableJobFileIncident.ts';

const AT = '2026-11-26T10:00:00+01:00';
const NEXT_PASS_AT = '2026-11-26T10:00:30+01:00';
const EXAMPLE_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const EXITED_CHILD: BuildJobObservation['agentEnd'] = {
  reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 0
};
const PIPELINE: Pipeline = {
  version: 5,
  prepare: [],
  gates:   [{ name: 'tests', run: 'true' }],
  phases:  { build: ['tests'], review: ['tests'], merge: ['tests'] },
};

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface UnreadableFileScene {
  board:            Board;
  job:              Readonly<Job>;
  context:          JobLaunchContext;
  trackerDirectory: string;
}

const STATES_TO: Readonly<Record<'running' | 'in-customs' | 'gating', readonly Parameters<Board['moveJob']>[1][]>> = {
  'running':    ['preparing', 'running'],
  'in-customs': ['preparing', 'running', 'in-customs'],
  'gating':     ['preparing', 'running', 'in-customs', 'gating'],
};

/** A build job of ticket 001 in `state`, after `earlierFailedBuilds` builds of the same ticket that failed. */
function sceneIn(state: keyof typeof STATES_TO, earlierFailedBuilds = 0): UnreadableFileScene {
  const rootDirectory = createScratchDirectory('job-unreadable-files');
  folders.push(rootDirectory);
  const trackerDirectory = join(rootDirectory, '.example-tracker');
  const { board } = boardFixture({ pipeline: PIPELINE, tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
  const launch = {
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  } as const;
  for (let i = 0; i < earlierFailedBuilds; i += 1) {
    const { job: failedBuild } = board.launchJob(launch, AT);
    board.endJob(failedBuild.id, { outcome: 'failed', cause: 'git-failed' }, AT);
  }
  const { job } = board.launchJob(launch, AT);
  for (const nextState of STATES_TO[state]) board.moveJob(job.id, nextState, AT);
  const context = { workspace: { rootDirectory, trackerDirectory }, mainLine: 'main', log: () => undefined, } as unknown as JobLaunchContext;
  return {
    board, job, context, trackerDirectory
  };
}

function plantJobFile(scene: UnreadableFileScene, jobId: string, fileName: string, text: string): void {
  const jobFolder = jobFolderIn(scene.trackerDirectory, jobId);
  mkdirSync(jobFolder, { recursive: true });
  writeFileSync(join(jobFolder, fileName), text);
}

function observationOf(scene: UnreadableFileScene, reading: Partial<BuildJobObservation> = {}): BuildJobObservation {
  return {
    jobId:            scene.job.id,
    setup:            'installed',
    installStepRuns:  [],
    calls:            0,
    report:           { headCommit: 'example-head-commit', handoff: 'Example handoff.' },
    agentEnd:         null,
    gate:             { verdict: 'pending' },
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' },
    mainMerge:        null,
    conflictReReview: null,
    ...reading,
  };
}

function applyPass(scene: UnreadableFileScene, observation: BuildJobObservation, at = AT): void {
  JobLaunch.applyBuildJobObservations({ board: scene.board, at } as unknown as BoardTransaction, scene.context, [observation]);
}

/** The facts a transitional problem opens its incident with, until the file's format carries problems of its own. */
function transitionalFactsOf(file: string, sentence: unknown): Record<string, unknown> {
  return { file, problem: 'transitional-worded', sentence };
}

/** The facts a file of another version opens its incident with: its problem's values stored as text. */
function versionDiffersFactsOf(file: string): Record<string, string> {
  return {
    file, problem: 'version-differs', field: 'version', expectedVersion: '1'
  };
}

function unreadableFileIncidentsOf(board: Board): unknown[] {
  return board.incidents().filter((incident) => incident.kind === 'system-file-unreadable').map((incident) => [incident.jobId, incident.facts]);
}

test('a start in Customs that cannot be read opens the incident once, and the job waits in Customs instead of failing', () => {
  const scene = sceneIn('in-customs');
  plantJobFile(scene, scene.job.id, 'start.json', '{"startCommit": ');

  applyPass(scene, observationOf(scene));
  applyPass(scene, observationOf(scene), NEXT_PASS_AT);

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([[scene.job.id, { file: `jobs/${scene.job.id}/start.json`, problem: 'not-json', parserError: expect.any(String) }]]);
  expect(scene.board.jobById(scene.job.id)?.state).toBe('in-customs');
});

test('the start of the failed build a job retries, unreadable, opens the incident on the retrying job, naming the failed build\'s file', () => {
  const scene = sceneIn('in-customs', 1);
  const [failedBuildId] = scene.board.logRecordsSoFar().flatMap((record) => (record.kind === 'job-ended' ? [record.jobId] : []));
  plantJobFile(scene, scene.job.id, 'start.json', `${JSON.stringify({
    version: 1, startCommit: 'a1b2c3', contentHashAtLaunch: '', launchSnapshot: { refs: {}, hooksFolderDigest: null }
  })}\n`);
  plantJobFile(scene, failedBuildId ?? '', 'start.json', `${JSON.stringify({ startCommit: 'a1b2c3' })}\n`);

  applyPass(scene, observationOf(scene));

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([[scene.job.id, versionDiffersFactsOf(`jobs/${failedBuildId}/start.json`)]]);
  expect(scene.board.jobById(scene.job.id)?.state).toBe('in-customs');
});

test('a job in Customs that kept no start still fails as git-failed', () => {
  const scene = sceneIn('in-customs');

  applyPass(scene, observationOf(scene));

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([]);
  expect(scene.board.jobById(scene.job.id)).toBeUndefined();
});

test('a judged gate run whose job\'s start cannot be read records nothing, and the job waits in gating on the incident', () => {
  const scene = sceneIn('gating');
  plantJobFile(scene, scene.job.id, 'start.json', `${JSON.stringify({ version: 2 })}\n`);
  const gate: BuildJobObservation['gate'] = {
    verdict: 'judged', treeId: EXAMPLE_TREE, outcome: 'passed', step: null, output: '', ran: true, manifest: null, cacheReports: [], stepRuns: []
  };

  applyPass(scene, observationOf(scene, { gate }));

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([[scene.job.id, versionDiffersFactsOf(`jobs/${scene.job.id}/start.json`)]]);
  expect(scene.board.jobById(scene.job.id)?.state).toBe('gating');
  expect(scene.board.logRecordsSoFar().some((record) => record.kind === 'gate-ran')).toBe(false);
});

test('a reading of the observation that met an unreadable file opens its incident and moves the job nowhere', () => {
  const scene = sceneIn('gating');
  const gateProblem = transitionalWordedProblemOf('it is not a JSON object');
  const gate = { verdict: 'unreadable-file', file: `jobs/${scene.job.id}/gate-run.json`, problem: gateProblem } as const;

  applyPass(scene, observationOf(scene, { gate }));

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([[scene.job.id, transitionalFactsOf(gate.file, gate.problem.sentence)]]);
  expect(scene.board.jobById(scene.job.id)?.state).toBe('gating');
  expect(JobLaunch.someBuildJobAwaitsAPass(scene.board, [observationOf(scene, { gate })])).toBe(false);
});

test('a job whose own red handoff facts cannot be read takes no step on its calls: it is neither stopped nor wound down past any budget', () => {
  const scene = sceneIn('running');
  const unreadableRedHandoffProblem = transitionalWordedProblemOf('its "resume" is not a count');
  const unreadableRedHandoff = { verdict: 'unreadable-file', file: `jobs/${scene.job.id}/red-handoff.json`, problem: unreadableRedHandoffProblem } as const;

  applyPass(scene, observationOf(scene, { calls: 10_000, unreadableRedHandoff }));

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([[scene.job.id, transitionalFactsOf(unreadableRedHandoff.file, unreadableRedHandoff.problem.sentence)]]);
  expect(scene.board.incidents().map((incident) => incident.kind)).not.toContain('out-of-calls');
  expect(scene.board.jobById(scene.job.id)?.state).toBe('running');
});

test('a sandbox refusal kept that cannot be read is still a refused line: the incident opens and the job neither ends nor moves', () => {
  const scene = sceneIn('gating');
  const sandboxRefusalProblem = transitionalWordedProblemOf('its "reason" is not text');
  const sandboxRefusal = { verdict: 'unreadable-file', file: `jobs/${scene.job.id}/sandbox-refusal.json`, problem: sandboxRefusalProblem } as const;

  applyPass(scene, observationOf(scene, { sandboxRefusal }));

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([[scene.job.id, transitionalFactsOf(sandboxRefusal.file, sandboxRefusal.problem.sentence)]]);
  expect(scene.board.incidents().map((incident) => incident.kind)).not.toContain('sandbox-unavailable');
  expect(scene.board.jobById(scene.job.id)?.state).toBe('gating');
});

test('a park on the incident stops the job, and the passes after it open no second incident and end the job', () => {
  const scene = sceneIn('in-customs');
  plantJobFile(scene, scene.job.id, 'start.json', '{"startCommit": ');
  applyPass(scene, observationOf(scene));
  const [incident] = scene.board.incidents();

  scene.board.parkTicket('001', 'Example reason', incident?.id ?? '', NEXT_PASS_AT);
  applyPass(scene, observationOf(scene), NEXT_PASS_AT);
  expect(scene.board.incidents()).toEqual([]);
  applyPass(scene, observationOf(scene, { agentEnd: EXITED_CHILD }), NEXT_PASS_AT);

  expect(scene.board.incidents()).toEqual([]);
  expect(scene.board.decisions().map((decision) => decision.kind)).toEqual(['parked']);
  expect(scene.board.jobById(scene.job.id)).toBeUndefined();
  expect(scene.board.ticketByReference('001')?.frontmatter.hold).toBe('parked:system-file-unreadable');
});

test('a fresh agent asked for a job whose child was never launched ends the job replaced, though no child ever ends', () => {
  const scene = sceneIn('running');
  const launchSettingsFile = `jobs/${scene.job.id}/launch-settings.json`;
  UnreadableJobFileIncident.openOnce(scene.board, { jobId: scene.job.id, file: launchSettingsFile, problem: transitionalWordedProblemOf('example reason') }, AT);
  scene.board.requestJobStop(scene.job.id, 'fresh', AT);
  expect(scene.board.jobById(scene.job.id)?.state).toBe('stopping');

  applyPass(scene, observationOf(scene, { childIsUnlaunched: true }), NEXT_PASS_AT);

  expect(scene.board.jobById(scene.job.id)).toBeUndefined();
  expect(scene.board.logRecordsSoFar().find((record) => record.kind === 'job-ended')).toMatchObject({ jobId: scene.job.id, fields: { outcome: 'replaced' } });
});

test('a job asked for a fresh agent ends once its session does, though its red handoff facts cannot be read', () => {
  const scene = sceneIn('running');
  const unreadableRedHandoffProblem = transitionalWordedProblemOf('its "resume" is not a count');
  const unreadableRedHandoff = { verdict: 'unreadable-file', file: `jobs/${scene.job.id}/red-handoff.json`, problem: unreadableRedHandoffProblem } as const;
  scene.board.requestJobStop(scene.job.id, 'fresh', AT);

  applyPass(scene, observationOf(scene, { unreadableRedHandoff, agentEnd: EXITED_CHILD }), NEXT_PASS_AT);

  expect(unreadableFileIncidentsOf(scene.board)).toEqual([]);
  expect(scene.board.logRecordsSoFar().find((record) => record.kind === 'job-ended')).toMatchObject({ jobId: scene.job.id, fields: { outcome: 'replaced' } });
});
