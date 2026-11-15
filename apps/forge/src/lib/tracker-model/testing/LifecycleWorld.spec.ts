/**
 * The lifecycle world's class of each job state. What matters: the world's check that no worktree has two git operations at once sees every
 * state in which a job acts on its worktree with git, `merging-main` among them, so each job state is classed git-operating or git-idle
 * exactly once, and a new state fails here until it is classed.
 */
import { describe, expect, test } from 'bun:test';

import { JOB_STATES }                            from '../constants/JobStates.ts';
import { GIT_IDLE_STATES, GIT_OPERATING_STATES } from './LifecycleWorld.ts';

describe('the job states the lifecycle world checks for git operations', () => {
  test('class each job state exactly once, git-operating or git-idle', () => {
    expect([...GIT_OPERATING_STATES, ...GIT_IDLE_STATES].sort()).toEqual([...JOB_STATES].sort());
  });

  test('count merging-main as git-operating: the Overseer merges the target into the ticket\'s worktree', () => {
    expect(GIT_OPERATING_STATES).toContain('merging-main');
  });
});
