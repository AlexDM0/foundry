/**
 * The notice and warning sentences. What matters: a default's cause is worded, an unknown cause, also one named like an object property,
 * reading as itself; an incident default reads as its warning words it and every other kind as the notice line does, a kind this program
 * does not know reading as itself and a missing instruction file naming its job and path; and the warnings name a failed Baton pass and an
 * Assistant that cannot come up, each by its own kind, and nothing else. A notice that asks for an action names the Bridge control or a
 * neutral action, never a command line, since User runs no command.
 */
import { describe, expect, test } from 'bun:test';

import { PRODUCT_NAMES }     from '../../constants/ProductNames.ts';
import { NoticeWordingUtil } from './NoticeWordingUtil.ts';

describe('NoticeWordingUtil.defaultCauseTextOf', () => {
  test('each known cause is worded', () => {
    expect(['turn-closed', 'turn-budget', 'no-assistant'].map(NoticeWordingUtil.defaultCauseTextOf)).toEqual([
      'its delivery turn closed', 'the turn budget ran out', 'no Assistant was up',
    ]);
  });

  test('an unknown cause, also one named like an object property, reads as itself', () => {
    expect(['someday', 'constructor', 'toString'].map(NoticeWordingUtil.defaultCauseTextOf)).toEqual(['someday', 'constructor', 'toString']);
  });
});

describe('NoticeWordingUtil.noticeSentenceOf', () => {
  test('an incident default reads as its warning, new code and a dirty checkout as the notice line, an unknown kind as itself', () => {
    const notices = [
      {
        kind: 'incident-defaulted', incidentId: 'I3', move: 'job-fresh', cause: 'turn-closed'
      },
      { kind: 'new-code' },
      {
        kind: 'dirty-main-checkout', target: 'main', branch: 'main', blockingFiles: ['README.md', 'docs/cli.md']
      },
      { kind: 'example-kind' },
    ];
    expect(notices.map(NoticeWordingUtil.noticeSentenceOf)).toEqual([
      'incident I3 took its default, job-fresh: its delivery turn closed',
      'new code is on disk: restart the Overseer to run it',
      'landings on main wait: the main checkout\'s changes to README.md, docs/cli.md block the fast-forward',
      'example-kind',
    ]);
  });

  test('the notices that ask for an action name it without a command line', () => {
    const notices = [{ kind: 'install-version-changed' }, { kind: 'new-code' }, { kind: 'claude-md-block-committed', target: 'main' }];
    expect(notices.map(NoticeWordingUtil.noticeSentenceOf)).toEqual([
      'the install version changed, so launches are held until the board is updated',
      'new code is on disk: restart the Overseer to run it',
      'launches onto main wait: commit the CLAUDE.md change the board\'s update made',
    ]);
    for (const sentence of notices.map(NoticeWordingUtil.noticeSentenceOf)) expect(sentence).not.toMatch(new RegExp(`\`|${PRODUCT_NAMES.PROGRAM} `, 'u'));
  });

  test('a missing instruction file names its job and its path, never the bare kind', () => {
    expect(NoticeWordingUtil.noticeSentenceOf({ kind: 'instructions-missing', jobId: 'J7', path: 'briefs/defaults/builder.md' }))
      .toBe('job J7 is not launched: the instruction file briefs/defaults/builder.md its pipeline names is missing');
  });
});

describe('NoticeWordingUtil.warningsOf', () => {
  test('names a failed Baton pass and an Assistant that cannot come up, each by its own kind', () => {
    const notices = [{
      kind: 'incident-defaulted', incidentId: 'I3', move: 'job-fresh', cause: 'no-assistant'
    }];
    expect(NoticeWordingUtil.warningsOf(notices, { successorCodeVersion: 'code-example', step: 'take-baton', error: 'Example error' })).toEqual([
      { kind: 'baton-pass-failed', text: 'the Baton pass to code code-example failed at take-baton: Example error' },
      { kind: 'assistant-down', text: 'no Assistant can come up: open incidents take their defaults' },
    ]);
  });

  test('a default for another cause and no failed pass warn of nothing', () => {
    const notices = [{
      kind: 'incident-defaulted', incidentId: 'I3', move: 'job-fresh', cause: 'turn-closed'
    }];
    expect(NoticeWordingUtil.warningsOf(notices, null)).toEqual([]);
  });
});
