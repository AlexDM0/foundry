/**
 * Seeded interleavings of the lifecycle with a fake agent and user, holding what no order may break: one live job per ticket, the
 * concurrency limit, resumes only of interrupted jobs within their bound, each question answered once, one git operation per worktree and
 * one merge or refresh per target. A failing seed names itself, so it replays exactly.
 */
import { describe, expect, test } from 'bun:test';

import { mutatedModuleOf } from '../../testing/SourceMutant.ts';
import { LifecycleWorld }  from './testing/LifecycleWorld.ts';

const WORLD_MODULE = 'src/domain/tracker-model/testing/LifecycleWorld.ts';

const SEEDS = 200;

const TURNS_PER_SEED = 60;

/** The same seeds as the clean case; `some` over them stops a mutant case at its first violating seed. */
function seedNumbers(): number[] {
  return Array.from({ length: SEEDS }, (_unused, seed) => seed + 1);
}

describe('the lifecycle under seeded interleavings', () => {
  test(`keeps every invariant across ${SEEDS} seeds`, () => {
    const violationsBySeed = Array.from({ length: SEEDS }, (_unused, seed) => ({ seed, violations: new LifecycleWorld(seed + 1).run(TURNS_PER_SEED) }))
      .filter((outcome) => outcome.violations.length > 0);
    expect(violationsBySeed).toEqual([]);
  });

  test.each([
    ['a launch past the concurrency limit', '    .slice(0, freeSlots - documentSteps.length);\n', ';\n'],
    ['two live jobs for one ticket', '!ticketIdsSettledThisPass.has(ticket.id) && !ticketHasAJob(ticket.id, facts) && ', ''],
    ['a resume of a session', '    if (REPLACED_SESSION_JOB_KINDS.includes(job.kind)) {\n', '    if (false) {\n'],
  ])('the world sees %s once the policy allows it', async (_broken, find, replace) => {
    const mutated = await mutatedModuleOf(WORLD_MODULE, { modulePath: 'src/domain/tracker-model/Playbook.ts', find, replace });
    const World   = mutated['LifecycleWorld'] as typeof LifecycleWorld;
    const someSeedViolates = seedNumbers().some((seed) => new World(seed).run(TURNS_PER_SEED).length > 0);
    expect(someSeedViolates).toBe(true);
  });

  test.each([
    [
      'two child instances live for one job',
      'src/domain/tracker-model/Jobs.ts',
      'targetState === \'running\' && isProcessless(job.state)',
      'targetState === \'running\' && job.state !== \'launching\'',
      'live at once',
    ],
    ['a resume of a finished session', 'src/domain/tracker-model/Jobs.ts', '    liveJobs.splice(liveJobs.indexOf(job), 1);\n', '', 'a finished session'],
    [
      'a job waiting on a question nobody was asked',
      'src/domain/tracker-model/Decisions.ts',
      '    this.records.progress.decisions.push(decision);\n',
      '',
      'waits for an answer nobody was asked',
    ],
    [
      'two merges on one target',
      'src/domain/tracker-model/AirlockClaims.ts',
      '    if (holder !== undefined) throw new BoardRefusal({ reason: \'airlock-held\', target, jobId: holder.id });\n',
      '',
      'merge jobs hold',
    ],
    [
      'a refresh beside its group\'s release',
      'src/domain/tracker-model/AirlockClaims.ts',
      '    if (releaseTicketId !== null) throw new BoardRefusal({ reason: \'refresh-beside-a-queued-release\', group: claim.group, releaseTicketId });\n',
      '',
      'a refresh runs beside its group\'s release',
    ],
    [
      'a crash resume past the bound',
      'src/domain/tracker-model/Playbook.ts',
      '  if (crashResumesAreSpent(job, limits)) return \'waits-for-instruction\';\n',
      '',
      'crash-resumed',
    ],
    [
      'two git operations on one worktree',
      'src/domain/tracker-model/Playbook.ts',
      '!ticketIdsSettledThisPass.has(ticket.id) && !ticketHasAJob(ticket.id, facts) && ',
      '',
      'git operations at once',
    ],
  ])('the world names %s once the model allows it', async (_broken, modulePath, find, replace, violationPhrase) => {
    const mutated = await mutatedModuleOf(WORLD_MODULE, { modulePath, find, replace });
    const World   = mutated['LifecycleWorld'] as typeof LifecycleWorld;
    const someSeedNamesIt = seedNumbers().some((seed) => new World(seed).run(TURNS_PER_SEED).some((violation) => violation.includes(violationPhrase)));
    expect(someSeedNamesIt).toBe(true);
  });

  test('the world does work: its passes launch, resume and finish jobs', () => {
    const world = new LifecycleWorld(1);
    // Long enough for a ticket to land through its review resumes.
    world.run(TURNS_PER_SEED * 2);
    const workKinds = ['job-launched', 'job-ended', 'job-interrupted', 'job-resumed', 'decision-answered', 'merge-started', 'merge-landed'];
    expect(world.loggedKinds()).toEqual(expect.arrayContaining(workKinds));
  });
});
