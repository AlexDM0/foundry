/**
 * The incident a job's unreadable stored file opens: one per job and file while it stands, none for a job gone or parked on one, the
 * ticket parked by default; a session job neither move heals is retired, a running one moving to `stopping` and a stopping one opening nothing.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                    from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                  from '../../lib/tracker-model/Board.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { UnreadableJobFileIncident }   from './UnreadableJobFileIncident.ts';

const AT = '2026-11-26T10:00:00+01:00';
const NEXT_PASS_AT = '2026-11-26T10:00:30+01:00';

function buildJobScene(): { board: Board; buildJob: Readonly<Job> } {
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
  const { job: buildJob } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  return { board, buildJob };
}

describe('the unreadable job file incident', () => {
  test('an unreadable file opens system-file-unreadable once, defaulting to a park, and the next pass opens no second one', () => {
    const { board, buildJob } = buildJobScene();
    const unreadable = { jobId: buildJob.id, file: `jobs/${buildJob.id}/start.json`, reason: 'its version is not 1' };
    expect(UnreadableJobFileIncident.openOnce(board, unreadable, AT)).not.toEqual([]);
    expect(UnreadableJobFileIncident.openOnce(board, unreadable, NEXT_PASS_AT)).toEqual([]);
    expect(board.incidents().map((incident) => [incident.kind, incident.jobId, incident.ticketIds, incident.facts, incident.defaultMove])).toEqual([[
      'system-file-unreadable', buildJob.id, ['001'], { file: `jobs/${buildJob.id}/start.json`, reason: 'its version is not 1' }, 'ticket-park',
    ]]);
  });

  test('a second unreadable file of the same job opens its own incident', () => {
    const { board, buildJob } = buildJobScene();
    UnreadableJobFileIncident.openOnce(board, { jobId: buildJob.id, file: `jobs/${buildJob.id}/start.json`, reason: 'example reason' }, AT);
    UnreadableJobFileIncident.openOnce(board, { jobId: buildJob.id, file: `jobs/${buildJob.id}/launch-settings.json`, reason: 'example reason' }, AT);
    expect(board.incidents().map((incident) => incident.facts['file'])).toEqual([`jobs/${buildJob.id}/start.json`, `jobs/${buildJob.id}/launch-settings.json`]);
  });

  test('a job whose ticket stays parked on the incident opens no new one, and one unparked opens it again', () => {
    const { board, buildJob } = buildJobScene();
    const unreadable = { jobId: buildJob.id, file: `jobs/${buildJob.id}/start.json`, reason: 'example reason' };
    UnreadableJobFileIncident.openOnce(board, unreadable, AT);
    board.holdTicket('001', 'parked:system-file-unreadable', AT);
    const [incident] = board.incidents();
    board.handleIncident(incident?.id ?? '', 'ticket-park', AT);

    expect(UnreadableJobFileIncident.openOnce(board, unreadable, NEXT_PASS_AT)).toEqual([]);
    board.unholdTicket('001', NEXT_PASS_AT);
    expect(UnreadableJobFileIncident.openOnce(board, unreadable, NEXT_PASS_AT)).not.toEqual([]);
  });

  test('a job that has left the board opens nothing', () => {
    const { board, buildJob } = buildJobScene();
    board.endJob(buildJob.id, { outcome: 'stopped', cause: 'parked' }, AT);
    expect(UnreadableJobFileIncident.openOnce(board, { jobId: buildJob.id, file: 'jobs/J1/start.json', reason: 'example reason' }, NEXT_PASS_AT)).toEqual([]);
    expect(board.incidents()).toEqual([]);
  });

  test('the job waits only while its incident stands', () => {
    const { board, buildJob } = buildJobScene();
    expect(UnreadableJobFileIncident.standsOpenFor(board, buildJob.id)).toBe(false);
    UnreadableJobFileIncident.openOnce(board, { jobId: buildJob.id, file: `jobs/${buildJob.id}/start.json`, reason: 'example reason' }, AT);
    expect(UnreadableJobFileIncident.standsOpenFor(board, buildJob.id)).toBe(true);
    const [incident] = board.incidents();
    if (incident === undefined) throw new Error('no incident opened');
    board.handleIncident(incident.id, 'job-fresh', NEXT_PASS_AT);
    expect(UnreadableJobFileIncident.standsOpenFor(board, buildJob.id)).toBe(false);
  });
});

describe('retiring a session job neither move heals', () => {
  function pipelineAgentScene(): { board: Board; agentJobId: string; unreadable: { jobId: string; file: string; reason: string } } {
    const { board } = boardFixture();
    const { job } = board.startPipelineAgent(AT);
    return { board, agentJobId: job.id, unreadable: { jobId: job.id, file: `jobs/${job.id}/pipeline-agent-start.json`, reason: 'example reason' } };
  }

  test('a running job opens the incident and moves to stopping, and the next pass opens no second one', () => {
    const { board, agentJobId, unreadable } = pipelineAgentScene();
    board.moveJob(agentJobId, 'running', AT);
    UnreadableJobFileIncident.openAndRetire(board, unreadable, AT);
    UnreadableJobFileIncident.openAndRetire(board, unreadable, NEXT_PASS_AT);
    expect(board.incidents().map((incident) => [incident.kind, incident.jobId])).toEqual([['system-file-unreadable', agentJobId]]);
    expect(board.jobById(agentJobId)?.state).toBe('stopping');
  });

  test('a job not running opens the incident and keeps its state', () => {
    const { board, agentJobId, unreadable } = pipelineAgentScene();
    UnreadableJobFileIncident.openAndRetire(board, unreadable, AT);
    expect(board.incidents()).toHaveLength(1);
    expect(board.jobById(agentJobId)?.state).toBe('launching');
  });

  test('a job already stopping opens nothing', () => {
    const { board, agentJobId, unreadable } = pipelineAgentScene();
    board.moveJob(agentJobId, 'running', AT);
    board.moveJob(agentJobId, 'stopping', AT);
    UnreadableJobFileIncident.openAndRetire(board, unreadable, AT);
    expect(board.incidents()).toEqual([]);
  });
});
