/**
 * The API sentence of a refusal, which a client shows to User as it is. What matters: User runs no command, so where the
 * command line names a command or a flag, the API sentence keeps the same facts and names a neutral action instead;
 * a refusal with no such advice reads alike in both channels. Every row below names a command or a flag at the command line.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardRefusalDetail }     from '../../lib/tracker-model/BoardRefusal.ts';
import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import type { OperationRefusalDetail } from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE }      from '../../shared/constants/RootOverrideVariable.ts';
import { COMMAND_LINE_FORM }           from '../../testing/CommandLineForm.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';

const { PROGRAM } = PRODUCT_NAMES;
const ROOT = '/example/repository';
const MANIFEST = '/example/repository/.example/version.json';
const URL = 'http://127.0.0.1:4242';
const HEPHAESTUS_LOCK = '/example/hephaestus/lock-1.json';

function boardRefusal(boardRefusalDetail: BoardRefusalDetail): OperationRefusalDetail {
  return { kind: 'board-refusal', boardRefusal: boardRefusalDetail };
}

const API_SENTENCE_FOR_DETAIL: readonly (readonly [OperationRefusalDetail, string])[] = [
  [
    {
      kind: 'install-version-mismatch', rootDirectory: ROOT, manifestFilePath: MANIFEST, installVersion: 30, mismatch: { reason: 'older', installedVersion: 29 }
    },
    `The files ${PROGRAM} installed in ${ROOT} are install version 29, from an older ${PROGRAM}, and this one needs install version 30, `
    + 'so nothing was done. Update the board.',
  ],
  [
    {
      kind: 'install-version-mismatch', rootDirectory: ROOT, manifestFilePath: MANIFEST, installVersion: 30, mismatch: { reason: 'newer', installedVersion: 31 }
    },
    `The files ${PROGRAM} installed in ${ROOT} are install version 31, from a newer ${PROGRAM} than this one (install version 30), `
    + `so nothing was done. Update ${PROGRAM} itself, then update the board.`,
  ],
  [
    {
      kind: 'install-version-mismatch', rootDirectory: ROOT, manifestFilePath: MANIFEST, installVersion: 30, mismatch: { reason: 'manifest-is-a-directory' }
    },
    `${MANIFEST} is a directory where ${PROGRAM} keeps its install version file, so nothing was done. Remove that directory, then update the board.`,
  ],
  [{ kind: 'no-tracker-found', searchedFrom: ROOT }, `No ${PROGRAM} tracker was found in ${ROOT} or any directory above it.`],
  [{ kind: 'no-tracker-at-override', overrideDirectory: ROOT }, `No ${PROGRAM} tracker was found in ${ROOT}, which ${ROOT_OVERRIDE_VARIABLE} names.`],
  [{ kind: 'no-readable-ticket', reference: '7' }, 'There is no readable ticket 7.'],
  [
    { kind: 'hephaestus-already-running', url: URL, hephaestusLockFilePath: HEPHAESTUS_LOCK },
    `A Hephaestus already serves this board at ${URL} (${HEPHAESTUS_LOCK}). Stop it first.`,
  ],
  [
    { kind: 'hephaestus-down', hephaestusDirectory: '/example/hephaestus' },
    'No Hephaestus serves this board (/example/hephaestus holds no live Hephaestus lock). Start the board again to start one.',
  ],
  [
    { kind: 'hephaestus-did-not-start', exitCode: 1, logFilePath: '/example/hephaestus.log' },
    'The detached Hephaestus exited with code 1 before it answered. Its log is /example/hephaestus.log, which may name the cause.',
  ],
  [
    { kind: 'git-below-floor', foundVersion: '2.30.0', floorVersion: '2.38.0' },
    `${PROGRAM} needs git 2.38.0 or newer, for its merge of trees; the git on the PATH is 2.30.0. Upgrade git and try again.`,
  ],
  [{ kind: 'hephaestus-port-in-use', firstPort: 4242, lastPort: 4242 }, 'Port 4242 on 127.0.0.1 is in use, so Hephaestus did not start.'],
  [{ kind: 'hephaestus-port-in-use', firstPort: 4242, lastPort: 4252 }, 'Every port from 4242 to 4252 on 127.0.0.1 is in use, so Hephaestus did not start.'],
  [
    {
      kind: 'restart-failed', successorCodeVersion: 'code-example', step: 'read-jobs', error: 'Example error', url: URL
    },
    `The restart to code code-example failed at read-jobs: Example error. The old Hephaestus keeps driving at ${URL} and shows this as a warning; `
    + 'see the Hephaestus log.',
  ],
  [
    { kind: 'hephaestus-owns-the-lifecycle', url: URL, hephaestusLockFilePath: HEPHAESTUS_LOCK },
    `A Hephaestus drives this board at ${URL} (${HEPHAESTUS_LOCK}), so only it delivers tickets. Ask Hephaestus to record the ticket as delivered by hand. `
    + 'Nothing was written.',
  ],
  [
    { kind: 'chart-range-bound-unreadable', bound: 'to', written: 'soon' },
    'The end "soon" could not be read as a time, so it is not a range bound. '
    + 'Write an ISO 8601 timestamp, `start`, `now`, or a signed offset from now such as `-2h` or `+30m`.',
  ],
  [
    { kind: 'chart-range-backwards', from: 'now', to: '-2h' },
    'The start "now" is not before the end "-2h", so the axis would have no width. Swap them, or widen the window.',
  ],
  [
    boardRefusal({ reason: 'move-of-a-draft', ticketId: '004', targetStatus: 'committed' }),
    'Ticket #004 is a draft ticket, so it was not moved: ready it to build, which checks its Acceptance and Brief.',
  ],
  [boardRefusal({ reason: 'abandon-without-reason', ticketId: '004' }), 'Ticket #004 was not moved: abandon needs a reason. Say why the work was dropped.'],
  [
    boardRefusal({
      reason: 'claim-after-a-ticket-not-in-review', ticketId: '004', afterTicketId: '003', status: 'committed'
    }),
    'Ticket #004 was not claimed after #003: #003 is committed, and a claim after another ticket takes a predecessor that is in-review. '
    + 'Nothing was written.',
  ],
  [boardRefusal({ reason: 'claim-of-a-held-ticket', ticketId: '004' }), 'Ticket #004 is held, so it is not claimed. Nothing was written; unholding it lets it be claimed.'],
  [boardRefusal({ reason: 'epic-already-exists', epicKey: 'checkout-redesign' }), 'There is already an epic checkout-redesign. Nothing was written; edit that epic to change it.'],
  [
    boardRefusal({ reason: 'draft-claimed-by-another-owner', draftId: 'D2', owner: 'Alex Example' }),
    'Draft D2 was not claimed: Alex Example holds it. Nothing was written. Take it over, or wait until it is released.',
  ],
  [
    boardRefusal({
      reason: 'merge-accept-would-conflict', ticketId: '004', target: 'main', conflictedFiles: ['README.md']
    }),
    'Ticket #004 was not accepted: its branch conflicts with main in README.md. Bring it up to date first. Nothing was written.',
  ],
  [
    boardRefusal({
      reason: 'several-open-incidents', subject: 'Job J3', move: 'job-fresh', incidentIds: ['I1', 'I2']
    }),
    'Job J3 has several open incidents that allow job-fresh (I1, I2); name one. Nothing was written.',
  ],
  [
    boardRefusal({ reason: 'ticket-without-entity', ticketIds: ['004', '005'] }),
    'Nothing was readied: ticket #004, ticket #005 have no entity, and each ticket builds in the pipeline of its entity. '
      + 'The product owner gives each ticket its entity; then ready them again.',
  ],
  [
    boardRefusal({ reason: 'entity-without-reason', ticketId: '004' }),
    'Ticket #004\'s entity was not changed: it needs a reason. Say why the ticket belongs to that entity. Nothing was written.',
  ],
];

describe('OperationRefusalWordingUtil.apiMessageOf', () => {
  test.each(API_SENTENCE_FOR_DETAIL)('%o words its facts and a neutral action', (detail, sentence) => {
    expect(OperationRefusalWordingUtil.apiMessageOf(new OperationRefusal('refused', detail))).toBe(sentence);
  });

  test('every row names a command or a flag at the command line, and none through the API', () => {
    for (const [detail] of API_SENTENCE_FOR_DETAIL) {
      const refusal = new OperationRefusal('refused', detail);
      expect(OperationRefusalWordingUtil.messageOf(refusal), JSON.stringify(detail)).toMatch(COMMAND_LINE_FORM);
      expect(OperationRefusalWordingUtil.apiMessageOf(refusal), JSON.stringify(detail)).not.toMatch(COMMAND_LINE_FORM);
    }
  });

  test('the command-line form catches a backticked command, a run of one and a flag, and passes a neutral action', () => {
    const plantedForms = [`\`${PROGRAM} status\``, 'Run `epic list` first.', 'Pass --force to move it.', '--from "x" is late.'];
    expect(plantedForms.filter((planted) => COMMAND_LINE_FORM.test(planted))).toEqual(plantedForms);
    expect('Update the board, then open the board again; write `A1.` or `-2h`.').not.toMatch(COMMAND_LINE_FORM);
  });

  test('a refusal with no command advice reads alike in both channels', () => {
    const refusal = new OperationRefusal('refused', { kind: 'tracker-has-live-jobs', jobIds: ['J1'] });
    expect(OperationRefusalWordingUtil.apiMessageOf(refusal)).toBe(OperationRefusalWordingUtil.messageOf(refusal));
  });
});
