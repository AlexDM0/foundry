/** A running build job on the board, with the fields a spec overrides, for the Overseer's specs that read jobs off a board. */
import type { Job } from '../../../lib/tracker-model/@types/Job.ts';

export function liveJobFixture(overrides: Partial<Job> & Pick<Job, 'id'>): Job {
  return {
    kind:               'build',
    role:               'builder',
    ticketIds:          [],
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
