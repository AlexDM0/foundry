/**
 * What a builder and a reviewer of an entity are told, by the stage of a ticket that crosses into a whitelisted package. What matters: a
 * job without an entity gets the build and review prompts with no entity part, since a forge without entities must not change; a builder of
 * an entity is told its homes and `reach`, and how and when to declare a need with `need declare` and end `needs-declared`, but a builder
 * of the root entity declares no need (E13); in stage 1 the whitelisted packages are named as a proposal; the package builder of stage 2
 * reads its stage's rules first, states `exposedSurfaceChanged` (E40) and declares no need into its home entity (E24); the package reviewer
 * of stage 3 is told that statement and confirms or corrects it with `exposedSurfaceConfirmed` (E40), and is not told to merge the target
 * in when merge approval is on, which only the home review is (E36); a fresh package builder sent back by its package review reads that
 * review first (E34); the adapt stage resumes the stage 1 session with its message alone, after a home review that did not hold with
 * the findings and then the stage's rules (E51), a fresh session (E43) gets the message before its build prompt, and a need cannot name a sealed
 * package, which only `package-return` changes, with what the package must give (E41, E42); the package build the ticket returned to is
 * told that reason before its stage's rules (E42), and one the ticket did not return to is told nothing of a return; a fresh session after
 * settled needs still gets its stage's message; the home review of stage 5 is told the packages are sealed, and that a cause in a package
 * goes back through the adapt stage (E52). No placeholder is left unfilled.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import type { Job }                                 from '../../src/domain/tracker-model/@types/Job.ts';
import type { JobLaunchFacts, ReviewFindingsFacts } from '../../src/services/hephaestus/@types/JobLaunchFacts.ts';
import type { CrossingStageFacts }                  from '../../src/services/hephaestus/CrossingStages.ts';
import type { NeedsSettledFacts }                   from '../../src/services/hephaestus/NeedTickets.ts';
import { resourceFilePathOf }                       from '../../src/shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                            from '../../src/shared/constants/ProductNames.ts';
import { fakeAgentAdapter }                         from '../../src/testing/FakeAgentAdapter.ts';
import { HephaestusWording }                        from './HephaestusWording.ts';

const PROMPT_FILLS = fakeAgentAdapter().promptFills;

const BUILD_PROMPT  = readFileSync(resourceFilePathOf('prompts', 'BuildPrompt.md'), 'utf8');
const REVIEW_PROMPT = readFileSync(resourceFilePathOf('prompts', 'ReviewPrompt.md'), 'utf8');

const PLACEHOLDER = /\{\{\w+\}\}/;

function jobOf(kind: 'build' | 'review', entity: string | undefined): Readonly<Job> {
  return {
    id:        'J7',
    kind,
    role:      kind === 'build' ? 'builder' : 'reviewer',
    ticketIds: ['014'],
    attempt:   1,
    target:    'main',
    ...(entity === undefined ? {} : { entity, stage: 1 }),
  } as unknown as Readonly<Job>;
}

interface ExtraLaunchFacts {
  needsSettled?:      NeedsSettledFacts;
  rootEntityKey?:     string;
  mergeApprovalIsOn?: boolean;
  reviewFindings?:    ReviewFindingsFacts;
}

function messageOf(
  kind: 'build' | 'review', entity: string | undefined, crossingStage: CrossingStageFacts | null = null, extraFacts: ExtraLaunchFacts = {}
): string {
  const facts: JobLaunchFacts = {
    confinement: 'confined',
    tickets:     [{
      id: '014', title: 'Example basket export', body: '## Acceptance\nA1. Example basket exports.\n', branch: 'ticket-014'
    }],
    checksLine:             'bun test',
    gates:                  [{ name: 'tests', run: 'bun test' }],
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    instructions:           kind === 'build' ? BUILD_PROMPT : REVIEW_PROMPT,
    crossingStage,
    ...extraFacts,
  };
  return HephaestusWording.launchTextOf(jobOf(kind, entity), facts, PROMPT_FILLS).firstMessage;
}

describe('a forge without entities', () => {
  test('the builder\'s "How you work" opens with its first rule after one blank line, and names no entity or need', () => {
    const message = messageOf('build', undefined);

    expect(message).toContain('## How you work\n\n- Edit files only inside this worktree.');
    expect(message).not.toContain('need declare');
    expect(message).not.toContain('entity');
    expect(message).not.toMatch(PLACEHOLDER);
  });

  test('the reviewer\'s "What you are reviewing" opens with the diff rule after one blank line, and names no entity', () => {
    const message = messageOf('review', undefined);

    expect(message).toContain('## What you are reviewing\n\n- The diff under review');
    expect(message).not.toContain('entity');
    expect(message).not.toMatch(PLACEHOLDER);
  });
});

describe('a builder of an entity', () => {
  test('is told its homes and reach, and how and when to declare a need, ending needs-declared', () => {
    const message = messageOf('build', 'web');

    expect(message).toContain('## How you work\n\n- This job builds in the entity `web`. Change only the files in the homes of `web`');
    expect(message).toContain('When the work needs a change in a different entity, do not make that change. Declare a need before you write there');
    expect(message).toContain(`\`${PRODUCT_NAMES.PROGRAM} need declare "<title>" --entity <key> --body-file <path>\``);
    expect(message).toContain('end with the outcome `needs-declared`');
    expect(message).toContain('Hephaestus starts this stage again.\n- Edit files only inside this worktree.');
    expect(message).not.toMatch(PLACEHOLDER);
  });

  test('of the root entity, is told its homes and reach and is not told to declare a need, under the default key or the pipeline\'s key', () => {
    expect(messageOf('build', 'root')).toContain('- This job builds in the entity `root`.');
    expect(messageOf('build', 'root')).not.toContain('need declare');
    expect(messageOf('build', 'base', null, { rootEntityKey: 'base' })).not.toContain('need declare');
    expect(messageOf('build', 'root', null, { rootEntityKey: 'base' })).toContain('need declare');
  });

  test('in stage 1 of a crossing, names the whitelisted packages as a proposal and keeps the need for any other entity', () => {
    const message = messageOf('build', 'web', { stage: 'build', whitelistedPackages: ['shared', 'ui'] });

    expect(message).toContain('a package that the whitelist of `web` names: `shared`, `ui`. This change is a proposal.');
    expect(message).toContain('a different entity that the whitelist does not name');
  });

  test('in stage 2, reads the package build rules first, with the statement of exposedSurfaceChanged, then the package\'s build prompt', () => {
    const message = messageOf('build', 'shared', { stage: 'package-build', homeEntity: 'web' });

    expect(message.startsWith('This job is stage 2 of ticket #014: the package build of `shared`. The ticket belongs to the entity\n`web`.')).toBe(true);
    expect(message).toContain('`git diff main...HEAD`');
    expect(message).toContain('What the package exposes is all that a different entity can use');
    expect(message).toContain('set `exposedSurfaceChanged`');
    expect(message).toContain('`refused`, and write the reason in `refusedReason`');
    expect(message.indexOf('The build prompt of `shared` follows.')).toBeLessThan(message.indexOf('You build ticket #014'));
    expect(message).toContain('- This job builds in the entity `shared`.');
    expect(message).toContain('When the work needs a change in an entity that is not this package and not `web`, do not make that change.');
    expect(message).not.toMatch(PLACEHOLDER);
  });

  const settledNeeds: NeedsSettledFacts = {
    needs: [{
      entity: 'api', title: 'Example price field', ticketId: '015', status: 'delivered'
    }],
    mainLine:       'main',
    resumesSession: false,
  };

  test('in stage 2, a fresh session after settled needs gets the settled needs, then the package build rules, then the build prompt', () => {
    const message = messageOf('build', 'shared', { stage: 'package-build', homeEntity: 'web' }, { needsSettled: settledNeeds });

    expect(message.startsWith('An earlier session of #014 declared needs in other entities.')).toBe(true);
    expect(message.indexOf('git merge --no-edit main')).toBeLessThan(message.indexOf('This job is stage 2 of ticket #014'));
    expect(message).toContain('set `exposedSurfaceChanged`');
    expect(message.indexOf('The build prompt of `shared` follows.')).toBeLessThan(message.indexOf('You build ticket #014'));
    expect(message).not.toMatch(PLACEHOLDER);
  });

  const adapt = {
    stage:           'adapt',
    crossedPackages: [{ entity: 'shared', exposedSurfaceChanged: true, reviewText: 'The export now returns cents. {{notAPlaceholder}}' }],
  } as const;

  test('in stage 4, the resumed session of stage 1 gets the adapt message alone, with the sealed packages and their reviews', () => {
    const message = messageOf('build', 'web', { ...adapt, resumesSession: true });

    expect(message.startsWith('The package stages of #014 are complete. Your session of stage 1 continues.')).toBe(true);
    expect(message).toContain('The change of the ticket in `shared` is sealed.');
    expect(message).toContain('### The package `shared`\n\nWhat the package exposes changed from the proposal.\n\nThe export now returns cents.');
    expect(message).toContain('End with the outcome `package-return`. In `packageReturnReason`, write what the\n  package must give.');
    expect(message).toContain('If more than one package is sealed, write the key of the package in `packageReturnEntity`.');
    expect(message.endsWith('Run the gates of `web` again, and end with your report.')).toBe(true);
    expect(message).not.toContain('You build ticket #014');
  });

  test('in stage 2 after a return from adapt, the package builder gets the reason before its stage\'s rules (E42)', () => {
    const reason = 'The package must export the basket total in cents.\n{{notAPlaceholder}}';
    const message = messageOf('build', 'shared', { stage: 'package-build', homeEntity: 'web', packageReturnReason: reason });

    expect(message.startsWith('## Why the ticket is back in `shared`\n\nIn stage 4, the builder of `web` sent the ticket back to `shared`.')).toBe(true);
    expect(message).toContain('The builder of `web` wrote what the package must give:\n\n  The package must export the basket total in cents.\n');
    expect(message.indexOf('The package must export the basket total in cents.')).toBeLessThan(message.indexOf('This job is stage 2 of ticket #014'));
    expect(message).toContain('does not allow the change');
  });

  test('E34: in stage 2 after its package review did not hold, a fresh package builder gets the review before its stage\'s rules', () => {
    const packageReviewFindings = '## Review 1\n\nThe export breaks. {{notAPlaceholder}}\n\n- A1 does-not-hold — The example part breaks.';
    const message = messageOf('build', 'shared', { stage: 'package-build', homeEntity: 'web', packageReviewFindings });

    expect(message.startsWith('## Why the package build of `shared` runs again\n\nThe package review of `shared` found a claim that does not hold.')).toBe(true);
    expect(message).toContain('Its review follows:\n\n## Review 1\n\nThe export breaks. {{notAPlaceholder}}\n\n- A1 does-not-hold');
    expect(message.indexOf('- A1 does-not-hold')).toBeLessThan(message.indexOf('This job is stage 2 of ticket #014'));
  });

  test('in stage 2 without a return, the package builder is told nothing of one (E42)', () => {
    const message = messageOf('build', 'shared', { stage: 'package-build', homeEntity: 'web' });

    expect(message.startsWith('This job is stage 2 of ticket #014')).toBe(true);
    expect(message).not.toContain('Why the ticket is back');
  });

  test('E51: in stage 4 after a home review that did not hold, the resumed session gets the findings, then the rules of the adapt stage', () => {
    const reviewFindings: ReviewFindingsFacts = { reviewSection: '## Review 1\n\nThe basket shows euros.', resume: 1, resumesAllowed: 2 };
    const message = messageOf('build', 'web', { ...adapt, resumesSession: true }, { reviewFindings });

    expect(message.startsWith('The review of #014 found a claim that does not hold, so your session is resumed with its findings (resume 1 of 2).')).toBe(true);
    expect(message).toContain('## Review 1\n\nThe basket shows euros.\n\nYour session continues as stage 4 of ticket #014: adapt.');
    expect(message).toContain('## The rules of this stage\n\n- The change of the ticket in `shared` is sealed. Do not change the files of these packages.');
    expect(message).toContain('End with the outcome `package-return`.');
    expect(message).toContain('give the evidence for each numbered\n  item again');
    expect(message).not.toContain('You build ticket #014');
    expect(message).not.toMatch(PLACEHOLDER);
  });

  test('in stage 4, a fresh session gets the adapt message before its build prompt, which holds the ticket', () => {
    const message = messageOf('build', 'web', { ...adapt, resumesSession: false });

    expect(message.startsWith('The session of stage 1 of #014 cannot continue.')).toBe(true);
    expect(message.indexOf('The build prompt of `web` follows.')).toBeLessThan(message.indexOf('You build ticket #014'));
    expect(message).toContain('A1. Example basket exports.');
    expect(message).toContain('When the work needs a change in a different entity that is not a sealed package (`shared`), do not make that change.');
  });

  test('in stage 4, a fresh session after settled needs gets the adapt message and its build prompt, also where stage 1\'s session existed', () => {
    const message = messageOf('build', 'web', { ...adapt, resumesSession: true }, { needsSettled: settledNeeds });

    expect(message.startsWith('An earlier session of #014 declared needs in other entities.')).toBe(true);
    expect(message).toContain('The session of stage 1 of #014 cannot continue.');
    expect(message).toContain('End with the outcome `package-return`');
    expect(message.indexOf('The build prompt of `web` follows.')).toBeLessThan(message.indexOf('You build ticket #014'));
  });
});

describe('a reviewer of an entity', () => {
  test('outside a crossing, is told its entity and where it may fix', () => {
    const message = messageOf('review', 'web');

    expect(message).toContain('## What you are reviewing\n\n- This review is of the entity `web`. Fix only in the files in the homes of `web`'
      + ' and in its `reach`.\n- The diff under review');
    expect(message).not.toMatch(PLACEHOLDER);
  });

  test('in stage 3, is told the package builder\'s statement and confirms or corrects it with exposedSurfaceConfirmed', () => {
    for (const exposedSurfaceChanged of [false, true]) {
      const message = messageOf('review', 'shared', { stage: 'package-review', homeEntity: 'web', exposedSurfaceChanged });

      expect(message).toContain('This review is stage 3 of the ticket: the package review of `shared`. The ticket belongs to the entity `web`.');
      expect(message).toContain(`stated that what the package exposes ${exposedSurfaceChanged ? 'changed' : 'did not change'} from the proposal`);
      expect(message).toContain('set `exposedSurfaceConfirmed` to true when the statement is correct');
      expect(message).toContain('When you see a problem in the files of `web`, write it in your `reviewText`. Do not fix it');
    }
  });

  test('E36: in stage 3 with merge approval on, is not told to merge the target in, which the home review of stage 5 is', () => {
    const packageReview = messageOf('review', 'shared', { stage: 'package-review', homeEntity: 'web', exposedSurfaceChanged: false }, { mergeApprovalIsOn: true });
    const homeReview = messageOf('review', 'web', { stage: 'review', crossedPackages: [{ entity: 'shared', reviewText: '' }] }, { mergeApprovalIsOn: true });

    expect(packageReview).not.toContain('Merge approval is on');
    expect(packageReview).not.toContain('git merge --no-edit main');
    expect(packageReview).not.toMatch(PLACEHOLDER);
    expect(homeReview).toContain('- Merge approval is on. As the last step of your review, merge the target into the branch: `git merge --no-edit main`');
  });

  test('in stage 5, is told the crossed packages are sealed', () => {
    const message = messageOf('review', 'web', { stage: 'review', crossedPackages: [{ entity: 'shared', reviewText: '' }] });

    expect(message).toContain('This review is stage 5 of the ticket: the review of `web`.');
    expect(message).toContain('The change of the ticket in `shared` is sealed.');
    expect(message).toContain('The ticket then goes back to the builder of the adapt stage, which can send it back to the package.');
    expect(message).toContain('The reviewer of `shared` wrote no review text.');
  });

  test('in stage 5, gets the package review\'s text, which names problems in the home\'s files (E32)', () => {
    const reviewText = 'The basket page reads the old example name.\nUse the new example name.';
    const message = messageOf('review', 'web', { stage: 'review', crossedPackages: [{ entity: 'shared', reviewText }] });

    expect(message).toContain('The reviewer of `shared` wrote this review. Examine each problem that it gives in the files of `web`:\n\n'
      + '  The basket page reads the old example name.\n  Use the new example name.');
    expect(message).not.toMatch(PLACEHOLDER);
  });
});
