/**
 * The build prompt's gates section. What matters: each gate the builder runs is listed by name with its exact command and its fix, in the
 * pipeline's order, under the rule to pass every gate on the final commit; a gate with a fix says to run it before fixing by hand; an
 * `forgeOnly` gate is named as Hephaestus's and never listed as one to run or claim; and after `gate none`, or with no pipeline stored,
 * the message says the repository has no gates. The prompt names the ticket's branch as the board names it, namespaced or bare. A builder
 * or reviewer at the root of a folder tracker's worktree is told the project's folder first, since its ticket names paths from there. A
 * build that runs its stage again after its needs are settled is told each need with its ticket and status and to merge the main line in,
 * where the needs landed, even on a group target: a resumed session gets that alone, a fresh one gets it before the build prompt.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import type { Job }            from '../../src/domain/tracker-model/@types/Job.ts';
import type { PipelineGate }   from '../../src/domain/tracker-model/@types/Pipeline.ts';
import type { JobLaunchFacts } from '../../src/services/hephaestus/DrivePass.ts';
import { resourceFilePathOf }  from '../../src/shared/ResourceFilePath.ts';
import { fakeAgentAdapter }    from '../../src/testing/FakeAgentAdapter.ts';
import { HephaestusWording }   from './HephaestusWording.ts';

const PROMPT_FILLS = fakeAgentAdapter().promptFills;

const BUILD_INSTRUCTIONS = readFileSync(resourceFilePathOf('prompts', 'BuildPrompt.md'), 'utf8');

const BUILD_JOB = {
  id: 'J4', kind: 'build', role: 'builder', ticketIds: ['012'], attempt: 1
} as unknown as Readonly<Job>;

const GATES: readonly PipelineGate[] = [
  { name: 'format', run: 'bun run format:check', fix: 'bun run format' },
  { name: 'tests', run: 'bun test', in: 'packages/example' },
  { name: 'audit', run: 'bun audit', forgeOnly: true },
  { name: 'lint', run: 'bun run lint', fix: 'bun run lint --fix' },
];

function buildMessageOf(gates: readonly PipelineGate[] | null, confinement: JobLaunchFacts['confinement'] = 'confined', branch = 'ticket-012'): string {
  const facts: JobLaunchFacts = {
    confinement,
    tickets: [{
      id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n', branch
    }],
    checksLine:             'bun test',
    gates,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    instructions:           BUILD_INSTRUCTIONS,
  };
  return HephaestusWording.launchTextOf(BUILD_JOB, facts, PROMPT_FILLS).firstMessage;
}

describe('the build prompt\'s gates', () => {
  const message = buildMessageOf(GATES);

  test('lists each gate the builder runs by name, command and fix, in the pipeline\'s order, under the final-commit rule', () => {
    expect(message).toContain('Pass every gate on your final commit before you report, in this order');
    const entries = [
      '1. `format`: `bun run format:check`\n   Fix: `bun run format`. Run it before you fix anything by hand.',
      '2. `tests`: `bun test` (in `packages/example`)',
      '3. `lint`: `bun run lint`\n   Fix: `bun run lint --fix`. Run it before you fix anything by hand.',
    ];
    const positions = entries.map((entry) => message.indexOf(entry));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(message).not.toMatch(/\{\{\w+\}\}/);
  });

  test('names an forgeOnly gate as Hephaestus\'s and never lists it as one to run or claim', () => {
    expect(message).toContain('Hephaestus alone runs `audit`: never run or claim it.');
    expect(message).not.toContain('`audit`: `bun audit`');
    expect(message).not.toContain('bun audit');
  });

  test('says the repository has no gates after gate none, and with no pipeline stored', () => {
    for (const gates of [[], null]) {
      const noGates = buildMessageOf(gates);

      expect(noGates).toContain('This repository has no gates: nothing to pass before you report, and your report\'s `gates` is empty.');
      expect(noGates).not.toContain('Pass every gate');
    }
  });

  test('with only forgeOnly gates, says no gate is the builder\'s and names Hephaestus\'s', () => {
    const forgeOnly = buildMessageOf([{ name: 'audit', run: 'bun audit', forgeOnly: true }]);

    expect(forgeOnly).toContain('No gate is yours to run');
    expect(forgeOnly).toContain('Hephaestus alone runs `audit`');
  });
});

// A claim that a sandbox refuses a branch move holds only where the session runs confined.
describe('the build prompt\'s branch rule', () => {
  test('says the sandbox refuses a branch move in a confined session', () => {
    expect(buildMessageOf(GATES, 'confined')).toContain('move another branch: the sandbox refuses it, and verification\n  fails a rewritten history.');
  });

  test('claims no sandbox refusal in a session unconfined by design', () => {
    const message = buildMessageOf(GATES, 'unconfined-by-design');
    expect(message).toContain('move another branch: verification\n  fails a rewritten history.');
    expect(message).not.toContain('sandbox');
  });

  test('the review prompt claims no sandbox refusal in a session unconfined by design, and claims it in a confined one', () => {
    const reviewJob = { ...BUILD_JOB, kind: 'review', role: 'reviewer' } as unknown as Readonly<Job>;
    const reviewMessageOf = (confinement: JobLaunchFacts['confinement']): string => HephaestusWording.launchTextOf(reviewJob, {
      confinement,
      tickets: [{
        id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n', branch: 'ticket-012'
      }],
      checksLine:             'bun test',
      gates:                  GATES,
      earlierSessionReplaced: false,
      intake:                 null,
      airlock:                null,
      assistant:              null,
      instructions:           readFileSync(resourceFilePathOf('prompts', 'ReviewPrompt.md'), 'utf8'),
    }, PROMPT_FILLS).firstMessage;
    expect(reviewMessageOf('confined')).toContain('move another branch: the sandbox refuses it, and verification fails');
    expect(reviewMessageOf('unconfined-by-design')).toContain('move another branch: verification fails a rewritten history or a moved ref.');
    expect(reviewMessageOf('unconfined-by-design')).not.toContain('sandbox');
  });

  test('with merge approval on, the review prompt names the merge of the target as the review\'s last step; off, it says nothing of it', () => {
    const reviewJob = {
      ...BUILD_JOB, kind: 'review', role: 'reviewer', target: 'group-checkout'
    } as unknown as Readonly<Job>;
    const reviewMessageOf = (mergeApprovalIsOn: boolean): string => HephaestusWording.launchTextOf(reviewJob, {
      confinement: 'confined',
      tickets:     [{
        id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n', branch: 'ticket-012'
      }],
      checksLine:             'bun test',
      gates:                  GATES,
      mergeApprovalIsOn,
      earlierSessionReplaced: false,
      intake:                 null,
      airlock:                null,
      assistant:              null,
      instructions:           readFileSync(resourceFilePathOf('prompts', 'ReviewPrompt.md'), 'utf8'),
    }, PROMPT_FILLS).firstMessage;
    expect(reviewMessageOf(true)).toContain('As the last step of your review, merge the target into the branch: `git merge --no-edit group-checkout` on `ticket-012`');
    expect(reviewMessageOf(false)).not.toContain('Merge approval');
    expect(reviewMessageOf(false)).not.toContain('{{mergeApprovalStep}}');
  });
});

// A review that did not hold resumes the builder's session: it is handed the findings, never the whole build prompt again.
describe('the first line of a builder resumed after its review', () => {
  const facts: JobLaunchFacts = {
    tickets: [{
      id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n', branch: 'ticket-012'
    }],
    checksLine:             'bun test',
    gates:                  GATES,
    earlierSessionReplaced: false,
    reviewFindings:         { reviewSection: '## Review 1\n\n- A1 does-not-hold — the example total is off by one', resume: 1, resumesAllowed: 2 },
    confinement:            'confined',
    intake:                 null,
    airlock:                null,
    assistant:              null,
    instructions:           BUILD_INSTRUCTIONS,
  };
  const message = HephaestusWording.launchTextOf(BUILD_JOB, facts, PROMPT_FILLS).firstMessage;

  test('carries the review\'s findings and the resume count, and not the build prompt', () => {
    expect(message).toContain('The review of #012 found a claim that does not hold');
    expect(message).toContain('(resume 1 of 2)');
    expect(message).toContain('- A1 does-not-hold — the example total is off by one');
    expect(message).not.toContain('Pass every gate on your final commit');
  });

  test('after a conflicted target merge, names the target tip and each conflicted file, and not the review findings', () => {
    const conflictMessage = HephaestusWording.launchTextOf(BUILD_JOB, {
      ...facts,
      reviewFindings: {
        ...facts.reviewFindings ?? { reviewSection: '', resume: 1, resumesAllowed: 2 },
        targetCatchUp: { kind: 'conflict', targetTip: 'example-target-tip', conflictedFiles: ['src/Basket.ts', 'docs/basket.md'] },
      },
    }, PROMPT_FILLS).firstMessage;
    expect(conflictMessage).toContain('Merge `example-target-tip` into your branch');
    expect(conflictMessage).toContain('- src/Basket.ts\n- docs/basket.md');
    expect(conflictMessage).toContain('resume 1 of 2');
    expect(conflictMessage).not.toContain('found a claim that does not hold');
  });
});

describe('the first line of a build that runs its stage again after its needs are settled', () => {
  const facts: JobLaunchFacts = {
    tickets: [{
      id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n', branch: 'ticket-012'
    }],
    checksLine:             'bun test',
    gates:                  GATES,
    earlierSessionReplaced: false,
    needsSettled:           {
      needs: [
        {
          entity: 'design-system', title: 'Export the basket total', ticketId: '013', status: 'delivered'
        },
        {
          entity: 'root', title: 'Add the example lockfile entry', ticketId: null, status: null
        },
      ],
      mainLine:       'main',
      resumesSession: true,
    },
    confinement:  'confined',
    intake:       null,
    airlock:      null,
    assistant:    null,
    instructions: BUILD_INSTRUCTIONS,
  };

  test('in the resumed session names each need and its ticket and the merge of the main line, and not the build prompt', () => {
    const message = HephaestusWording.launchTextOf({ ...BUILD_JOB, target: 'group-checkout' }, facts, PROMPT_FILLS).firstMessage;
    expect(message).toContain('The needs that you declared for #012 are settled.');
    expect(message).toContain('- design-system: Export the basket total (#013, delivered)');
    expect(message).toContain('- root: Add the example lockfile entry (no ticket: User decided it)');
    expect(message).toContain('`git merge --no-edit main`');
    expect(message).not.toContain('group-checkout');
    expect(message).not.toContain('Pass every gate on your final commit');
  });

  test('in a fresh session comes before the build prompt', () => {
    const needsSettled = facts.needsSettled === undefined || facts.needsSettled === null ? null : { ...facts.needsSettled, resumesSession: false };
    const message = HephaestusWording.launchTextOf(BUILD_JOB, { ...facts, needsSettled }, PROMPT_FILLS).firstMessage;
    expect(message.startsWith('An earlier session of #012 declared needs in other entities.')).toBe(true);
    expect(message).toContain('Pass every gate on your final commit');
  });
});

describe('the build prompt\'s branch', () => {
  test('is the ticket\'s branch as the board names it, bare or under its namespace', () => {
    expect(buildMessageOf(GATES)).toContain('worktree on branch `ticket-012`');
    const namespaced = buildMessageOf(GATES, 'confined', 'forge/web/ticket-012');
    expect(namespaced).toContain('worktree on branch `forge/web/ticket-012`');
    expect(namespaced).toContain('Commit on `forge/web/ticket-012`');
    expect(namespaced).not.toContain('`ticket-012`');
  });
});

describe('the project\'s folder', () => {
  const reviewJob = { ...BUILD_JOB, kind: 'review', role: 'reviewer' } as unknown as Readonly<Job>;
  const factsFor = (instructionsFile: string, projectFolder: string | undefined): JobLaunchFacts => ({
    confinement: 'confined',
    tickets:     [{
      id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n', branch: 'ticket-012'
    }],
    checksLine:             'bun test',
    gates:                  GATES,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    instructions:           readFileSync(resourceFilePathOf('prompts', instructionsFile), 'utf8'),
    ...projectFolder === undefined ? {} : { projectFolder },
  });

  test('is named first to a builder and a reviewer at the root of a folder tracker\'s worktree, with where the ticket\'s paths start', () => {
    for (const [job, instructionsFile] of [[BUILD_JOB, 'BuildPrompt.md'], [reviewJob, 'ReviewPrompt.md']] as const) {
      const message = HephaestusWording.launchTextOf(job, factsFor(instructionsFile, 'apps/example'), PROMPT_FILLS).firstMessage;
      expect(message.startsWith('Your working directory is the root of this worktree. The project of this board is in the folder `apps/example`')).toBe(true);
      expect(message).toContain('A path in the ticket starts from that folder. A path that starts with `/` starts from the root of the worktree.');
    }
  });

  test('is not named to a session that starts in it', () => {
    expect(HephaestusWording.launchTextOf(BUILD_JOB, factsFor('BuildPrompt.md', undefined), PROMPT_FILLS).firstMessage).not.toContain('Your working directory');
    expect(HephaestusWording.launchTextOf(reviewJob, factsFor('ReviewPrompt.md', undefined), PROMPT_FILLS).firstMessage).not.toContain('Your working directory');
  });
});
