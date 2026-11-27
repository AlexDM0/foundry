/**
 * One claim per kind of refusal: a refusal built from words is printed verbatim, and a refusal built from a detail is printed exactly as
 * the util that owns that kind words it. The delegates pin their own texts, so the claims compare with their answers. The texts worded here
 * are pinned byte for byte, frozen from the services that wrote them at 6fb290d; retake them with `git show 6fb290d:src/services/tracker/Workspace.ts`
 * and `git show 6fb290d:src/services/tracker/TrackerLock.ts`.
 */
import { expect, test } from 'bun:test';

import type { BoardRefusalDetail }     from '../../domain/tracker-model/BoardRefusal.ts';
import type { UnreadableTracker }      from '../../shared/@types/UnreadableTracker.ts';
import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE }      from '../../shared/constants/RootOverrideVariable.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';

test('a refusal built from words is printed with those words, unchanged', () => {
  const refusal = new OperationRefusal('refused', 'No tracker here. Run `agent-progress init` in /example/repository.');
  const unreadableIdentity = (identitySources: readonly string[]): string => OperationRefusalWordingUtil.messageOf(
    new OperationRefusal('unrepaired', { kind: 'hephaestus-identity-unreadable', processId: 4242, identitySources })
  );
  expect(unreadableIdentity(['/proc/4242/stat', '/proc/sys/kernel/random/boot_id'])).toContain('cannot be read from /proc/4242/stat and /proc/sys/kernel/random/boot_id,');
  expect(unreadableIdentity([])).toContain('cannot be read on this platform,');
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe('No tracker here. Run `agent-progress init` in /example/repository.');
});

test('a malformed Hephaestus poll interval names the variable, the value and what the user can do', () => {
  const refusal = new OperationRefusal('refused', { kind: 'malformed-hephaestus-poll-interval', variable: 'EXAMPLE_POLL_INTERVAL', value: '25ms' });
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(
    'EXAMPLE_POLL_INTERVAL must be a positive whole number of milliseconds, not "25ms". Unset it or correct it.'
  );
});

test('a Hephaestus lock that cannot be created whole names the file, the failure and what the user can do', () => {
  const refusal = new OperationRefusal('refused', { kind: 'hephaestus-lock-not-created-whole', hephaestusLockFilePath: '/example/hephaestus/lock-1.json', reason: 'Error: EPERM' });
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(
    'The Hephaestus lock /example/hephaestus/lock-1.json cannot be created whole (Error: EPERM), so Hephaestus did not start. Its claim needs a hard link: '
    + 'move the data folder to a filesystem that allows one.'
  );
});

test('a Board refusal is printed as the Board refusal wording words its detail', () => {
  const boardRefusal: BoardRefusalDetail = { reason: 'ticket-already-held', ticketId: '001' };
  const refusal = new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal });
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(OperationRefusalWordingUtil.boardRefusalMessageOf(boardRefusal));
});

/** What `status` and every mutating command print for a tracker they cannot read; a script may match them, so they are pinned as literals. */
function unreadableTrackerMessageOf(reading: UnreadableTracker): string {
  return OperationRefusalWordingUtil.messageOf(new OperationRefusal('unrepaired', { kind: 'unreadable-tracker', reading }));
}

test('an absent progress file is named by its path and said to be missing', () => {
  expect(unreadableTrackerMessageOf({ verdict: 'absent', filePath: '/example/.agent-progress/progress.json' }))
    .toBe('/example/.agent-progress/progress.json cannot be read: it is not there');
});

test('an unreadable progress file is named by its path, followed by the adapter reason verbatim', () => {
  expect(unreadableTrackerMessageOf({
    verdict:        'unreadable',
    unreadableFile: 'progress-file',
    filePath:       '/example/.agent-progress/progress.json',
    reason:         'it is not valid JSON (Unexpected end of JSON input)',
  })).toBe('/example/.agent-progress/progress.json cannot be read: it is not valid JSON (Unexpected end of JSON input)');
});

test('an unreadable log is called the log, followed by the adapter reason verbatim', () => {
  expect(unreadableTrackerMessageOf({
    verdict:        'unreadable',
    unreadableFile: 'log-file',
    filePath:       '/example/.agent-progress/log.jsonl',
    reason:         '/example/.agent-progress/log.jsonl, line 1: fields.text is not a string',
  })).toBe('The log cannot be read: /example/.agent-progress/log.jsonl, line 1: fields.text is not a string');
});

test('no tracker at the AGENT_PROGRESS_ROOT directory is worded naming the variable and how to search upwards instead', () => {
  const refusal = new OperationRefusal('refused', { kind: 'no-tracker-at-override', overrideDirectory: '/example/empty' });
  const message = OperationRefusalWordingUtil.messageOf(refusal);
  expect(message).toBe(
    `No ${PRODUCT_NAMES.PROGRAM} tracker was found in /example/empty, which ${ROOT_OVERRIDE_VARIABLE} names. `
    + `Run \`${PRODUCT_NAMES.PROGRAM} init\` there, or unset ${ROOT_OVERRIDE_VARIABLE} to search upwards from the current directory instead.`,
  );
  expect(message).toContain(ROOT_OVERRIDE_VARIABLE);
});

test('no tracker found above the start directory is worded naming that directory and `agent-progress init`', () => {
  const refusal = new OperationRefusal('refused', { kind: 'no-tracker-found', searchedFrom: '/example/untracked' });
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(
    `No ${PRODUCT_NAMES.PROGRAM} tracker was found in /example/untracked or any directory above it. `
    + `Run \`${PRODUCT_NAMES.PROGRAM} init\` in the repository you want tracked.`,
  );
});

test('a held lock is worded naming the lock directory as a path to remove, never as a file', () => {
  const refusal = new OperationRefusal('unrepaired', { kind: 'tracker-lock-held', lockDirectoryPath: '/example/.agent-progress/.lock' });
  const message = OperationRefusalWordingUtil.messageOf(refusal);
  expect(message).toBe(
    `Another ${PRODUCT_NAMES.PROGRAM} command is holding /example/.agent-progress/.lock and did not release it. `
    + 'If nothing else is running, remove that path and try again.',
  );
  expect(message).not.toContain('that file');
});

test('a journal that stayed is worded naming it, what kept it and that the next command finishes it', () => {
  const refusal = new OperationRefusal('unrepaired', {
    kind:            'hold-journal-unremovable',
    journalFilePath: '/example/.agent-progress/hold-journal.json',
    reason:          'Error: EBUSY',
  });
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(
    'The write finished, but /example/.agent-progress/hold-journal.json could not be removed (Error: EBUSY), so a later command would replay it. '
    + 'Close whatever holds that file and try again; the next command finishes it.',
  );
});

test('a board no Hephaestus serves after start started one is worded naming the Hephaestus lock folder and the command that starts one', () => {
  const refusal = new OperationRefusal('refused', { kind: 'hephaestus-down', hephaestusDirectory: '/example/repository/.agent-progress/hephaestus' });
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(
    'No Hephaestus serves this board (/example/repository/.agent-progress/hephaestus holds no live Hephaestus lock). '
    + `Run \`${PRODUCT_NAMES.PROGRAM} start\` again to start one.`,
  );
});

test('an install version mismatch is printed as the install version wording words its detail', () => {
  const detail = {
    kind:             'install-version-mismatch',
    rootDirectory:    '/example/repository',
    manifestFilePath: '/example/repository/.agent-progress/version.json',
    installVersion:   1,
    mismatch:         { reason: 'unversioned' },
  } as const;
  const refusal = new OperationRefusal('refused', detail);
  expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(OperationRefusalWordingUtil.installVersionMismatchMessageOf(detail));
});

test('a refused agent program names its job and the reason, then the repair it is given, and names no program of its own', () => {
  expect(OperationRefusalWordingUtil.agentProgramRefusalTextOf('J7', 'C:\\example\\agent.cmd is a batch file', 'run the example repair'))
    .toBe('job J7 is not launched: C:\\example\\agent.cmd is a batch file; run the example repair');
  expect(OperationRefusalWordingUtil.agentProgramRefusalTextOf('J7', 'no agent program is on PATH', null)).toBe('job J7 is not launched: no agent program is on PATH');
});

test('the by-hand task and namespace refusals are worded as their verbs printed them, the same sentence in both channels', () => {
  const { PROGRAM } = PRODUCT_NAMES;
  const listAdvice = `Run \`${PROGRAM} ticket list\` to see the tickets this tracker holds.`;
  const sentenceOfDetail: readonly (readonly [OperationRefusal, string])[] = [
    [new OperationRefusal('refused', { kind: 'task-ticket-missing', option: 'ticket', reference: '9' }), `There is no ticket 9. ${listAdvice}`],
    [
      new OperationRefusal('refused', { kind: 'task-ticket-missing', option: 'review-of', reference: '#9' }),
      `--review-of names ticket #9, and there is none. ${listAdvice}`,
    ],
    [
      new OperationRefusal('refused', { kind: 'namespace-board-has-jobs', jobCount: 2 }),
      'The board has 2 job(s) on it, which run under its current branch names; let them end first. Nothing was written.',
    ],
    [
      new OperationRefusal('refused', { kind: 'namespace-branch-list-failed', reason: 'git exited 128' }),
      'git did not list the branches (git exited 128). Nothing was written.',
    ],
    [
      new OperationRefusal('refused', { kind: 'namespace-not-free', refusal: { reason: 'branch-blocks-namespace', branch: PROGRAM }, wantedNamespace: 'web' }),
      `The branch ${PROGRAM} leaves git no room for branches named ${PROGRAM}/web/ticket-<id>; rename it, or choose another name. Nothing was written.`,
    ],
    [
      new OperationRefusal('refused', { kind: 'namespace-not-free', refusal: { reason: 'namespace-has-branches', branches: ['a', 'b'] }, wantedNamespace: 'web' }),
      'The namespace web already holds the branches a, b, so it is another board\'s; choose another name. Nothing was written.',
    ],
    [
      new OperationRefusal('refused', { kind: 'namespace-not-free', refusal: { reason: 'board-has-branches', branches: ['ticket-003'] }, wantedNamespace: 'web' }),
      'The board\'s branches ticket-003 are under its current names; land or remove them first. Nothing was written.',
    ],
  ];
  for (const [refusal, sentence] of sentenceOfDetail) {
    expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(sentence);
    expect(OperationRefusalWordingUtil.apiMessageOf(refusal)).toBe(sentence);
  }
});

test('an unreadable record in the way names what it cannot be read as, a ticket\'s spec and plan among them', () => {
  const inTheWay = (record: 'epic' | 'draft' | 'ticket-documents'): string => OperationRefusalWordingUtil.messageOf(
    new OperationRefusal('refused', { kind: 'unreadable-file-in-the-way', filePath: '/example/record', record })
  );
  expect(inTheWay('epic')).toContain('cannot be read as an epic,');
  expect(inTheWay('draft')).toContain('cannot be read as a draft,');
  expect(inTheWay('ticket-documents')).toBe('/example/record already exists but cannot be read as a ticket\'s spec and plan, so it is not overwritten. '
    + 'Nothing was written; repair or delete it first.');
});

test('a document refusal names its ticket, document and versions', () => {
  expect(OperationRefusalWordingUtil.boardRefusalMessageOf({
    reason: 'document-version-moved', ticketId: '004', document: 'spec', version: 3, headNumber: 4
  })).toContain('The spec of #004 is at version 4, not version 3');
  expect(OperationRefusalWordingUtil.boardRefusalMessageOf({
    reason: 'document-version-moved', ticketId: '004', document: 'plan', version: null, headNumber: 1
  })).toContain('The plan of #004 is at version 1, not empty: read it again first.');
});
