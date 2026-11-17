/**
 * What a builder and a reviewer of an entity are told, by the stage of a ticket that crosses into a whitelisted package. What matters: a
 * job without an entity gets the build and review prompts exactly as before, since a forge without entities must not change; a builder of
 * an entity is told its homes and `reach`, and how and when to declare a need with `need declare` and end `needs-declared`, but a builder
 * of the root entity declares no need (A10); in stage 1 the whitelisted packages are named as a proposal; the package builder of stage 2
 * reads its stage's rules first, states `exposedSurfaceChanged` (A1) and declares no need into its home entity (E24); the package reviewer
 * of stage 3 is told that statement and confirms or corrects it with `exposedSurfaceConfirmed` (C15); the adapt stage resumes the stage 1
 * session with its message alone (A2), a fresh session (E43) gets the message before its build prompt, and a need cannot name a sealed
 * package, which only `package-return` changes (E42); a fresh session after settled needs still gets its stage's message; the home review
 * of stage 5 is told the packages are sealed. No placeholder is left unfilled.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import type { Job }                from '../../src/lib/tracker-model/@types/Job.ts';
import type { CrossingStageFacts } from '../../src/services/overseer/CrossingStages.ts';
import type { JobLaunchFacts }     from '../../src/services/overseer/DrivePass.ts';
import type { NeedsSettledFacts }  from '../../src/services/overseer/NeedTickets.ts';
import { resourceFilePathOf }      from '../../src/shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }           from '../../src/shared/constants/ProductNames.ts';
import { OverseerWording }         from './OverseerWording.ts';

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
  needsSettled?:  NeedsSettledFacts;
  rootEntityKey?: string;
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
  return OverseerWording.launchTextOf(jobOf(kind, entity), facts).firstMessage;
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
    expect(message).toContain('the Overseer starts this stage again.\n- Edit files only inside this worktree.');
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
    expect(message).toContain('End with the outcome `package-return`');
    expect(message.endsWith('Run the gates of `web` again, and end with your report.')).toBe(true);
    expect(message).not.toContain('You build ticket #014');
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

  test('in stage 5, is told the crossed packages are sealed', () => {
    const message = messageOf('review', 'web', { stage: 'review', crossedPackages: [{ entity: 'shared', reviewText: '' }] });

    expect(message).toContain('This review is stage 5 of the ticket: the review of `web`.');
    expect(message).toContain('The change of the ticket in `shared` is sealed.');
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
