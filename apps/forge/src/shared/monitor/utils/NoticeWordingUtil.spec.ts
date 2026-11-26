/**
 * The notice and warning sentences. What matters: a default's cause is worded, an unknown cause, also one named like an object property,
 * reading as itself; an incident default reads as its warning words it and every other kind as the notice line does, a kind this program
 * does not know reading as itself and a missing instruction file naming its job and path; and the warnings name a failed restart and an
 * Assistant that cannot come up, each by its own kind, and nothing else; passes abandoned in a row name their count and their reason. A notice
 * that asks for an action names a neutral action, never a command line, since User runs no command.
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
      'new code is on disk: restart Hephaestus to run it',
      'landings on main wait: the main checkout\'s changes to README.md, docs/cli.md block the fast-forward',
      'example-kind',
    ]);
  });

  test('the notices that ask for an action name it without a command line', () => {
    const notices = [{ kind: 'install-version-changed' }, { kind: 'new-code' }];
    expect(notices.map(NoticeWordingUtil.noticeSentenceOf)).toEqual([
      'the install version changed, so launches are held until the board is updated',
      'new code is on disk: restart Hephaestus to run it',
    ]);
    for (const sentence of notices.map(NoticeWordingUtil.noticeSentenceOf)) expect(sentence).not.toMatch(new RegExp(`\`|${PRODUCT_NAMES.PROGRAM} `, 'u'));
  });

  test('a missing instruction file names its job and its path, never the bare kind', () => {
    expect(NoticeWordingUtil.noticeSentenceOf({ kind: 'instructions-missing', jobId: 'J7', path: 'briefs/defaults/builder.md' }))
      .toBe('job J7 is not launched: the instruction file briefs/defaults/builder.md its pipeline names is missing');
  });

  test('a refused agent program appends the adapter\'s repair when the notice carries one, and only the reason when it is null', () => {
    const repaired = {
      kind: 'agent-program-refused', jobId: 'J7', cause: 'batch-target', reason: 'C:\\example\\agent.cmd is a batch file', repair: 'run the example repair'
    };
    const unrepaired = {
      kind: 'agent-program-refused', jobId: 'J8', cause: 'not-found', reason: 'no agent program is on PATH', repair: null
    };
    expect([repaired, unrepaired].map(NoticeWordingUtil.noticeSentenceOf)).toEqual([
      'job J7 is not launched: C:\\example\\agent.cmd is a batch file; run the example repair',
      'job J8 is not launched: no agent program is on PATH',
    ]);
  });

  test('passes abandoned in a row name their count and the reason in words, and a reason this program does not know reads as itself', () => {
    const notices = [
      { kind: 'passes-abandoned', inARow: 3, reason: 'tracker-lock-held' },
      { kind: 'passes-abandoned', inARow: 5, reason: 'lock-taken-over' },
      { kind: 'passes-abandoned', inARow: 3, reason: 'example-reason' },
    ];
    expect(notices.map(NoticeWordingUtil.noticeSentenceOf)).toEqual([
      '3 drive passes in a row were abandoned, the last as another process held the board\'s lock past its wait; Hephaestus keeps running and tries again at each wake-up',
      '5 drive passes in a row were abandoned, the last as another process took the board\'s lock over; Hephaestus keeps running and tries again at each wake-up',
      '3 drive passes in a row were abandoned, the last as example-reason; Hephaestus keeps running and tries again at each wake-up',
    ]);
  });
});

describe('NoticeWordingUtil.warningsOf', () => {
  test('names a failed restart, an Assistant that cannot come up and each unreadable file, each by its own kind', () => {
    const notices = [{
      kind: 'incident-defaulted', incidentId: 'I3', move: 'job-fresh', cause: 'no-assistant'
    }];
    const header = {
      restartWarning:  { successorCodeVersion: 'code-example', step: 'read-jobs', error: 'Example error' },
      unreadableFiles: [{ file: 'talos/launches-3.ndjson', reason: 'line 2: its version is not 1' }],
    };
    expect(NoticeWordingUtil.warningsOf(notices, header)).toEqual([
      { kind: 'restart-failed', text: 'the restart to code code-example failed at read-jobs: Example error' },
      { kind: 'assistant-down', text: 'no Assistant can come up: open incidents take their defaults' },
      { kind: 'system-file-unreadable', text: 'Hephaestus cannot read the board file talos/launches-3.ndjson: restart Hephaestus, and report a bug if this warning stays' },
    ]);
  });

  test('the header facts read what Hephaestus keeps, and an entry that names no file and reason is none', () => {
    expect(NoticeWordingUtil.headerWarningFactsOf({
      restartWarning:  null,
      unreadableFiles: [{ file: 'crash-logs/crash-1.json', reason: 'it is not a JSON object' }, { file: 3 }, null],
    })).toEqual({ restartWarning: null, unreadableFiles: [{ file: 'crash-logs/crash-1.json', reason: 'it is not a JSON object' }] });
    expect(NoticeWordingUtil.headerWarningFactsOf({ restartWarning: null, unreadableFiles: 'none' })).toEqual({ restartWarning: null, unreadableFiles: [] });
  });

  test('a default for another cause and no failed pass warn of nothing', () => {
    const notices = [{
      kind: 'incident-defaulted', incidentId: 'I3', move: 'job-fresh', cause: 'turn-closed'
    }];
    expect(NoticeWordingUtil.warningsOf(notices, { restartWarning: null, unreadableFiles: [] })).toEqual([]);
  });
});
