/**
 * The API sentence of a refusal, which the Bridge and a monitor show to User as it is. What matters: User runs no command, so where the
 * command line names a command or a flag, the API sentence keeps the same facts and names the Bridge control or a neutral action instead;
 * a refusal with no such advice reads alike in both channels. Every row below names a command or a flag at the command line.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardRefusalDetail }     from '../../lib/tracker-model/BoardRefusal.ts';
import { ROOT_OVERRIDE_VARIABLE }      from '../../shared/Environment.ts';
import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import type { OperationRefusalDetail } from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { COMMAND_LINE_FORM }           from '../../testing/CommandLineForm.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';

const { PROGRAM } = PRODUCT_NAMES;
const ROOT = '/example/repository';
const MANIFEST = '/example/repository/.example/version.json';
const URL = 'http://127.0.0.1:4242';
const BATON = '/example/overseer/baton-1.json';

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
    { kind: 'overseer-already-running', url: URL, batonFilePath: BATON },
    `An Overseer already serves this board at ${URL} (${BATON}). Stop it first.`,
  ],
  [
    { kind: 'overseer-down', overseerDirectory: '/example/overseer' },
    'No Overseer serves this board (/example/overseer holds no live Baton), so there is nothing to open. Open the board again to start one.',
  ],
  [
    { kind: 'overseer-did-not-start', exitCode: 1, logFilePath: '/example/overseer.log' },
    'The detached Overseer exited with code 1 before it answered. Its log is /example/overseer.log, which may name the cause.',
  ],
  [{ kind: 'overseer-port-in-use', firstPort: 4242, lastPort: 4242 }, 'Port 4242 on 127.0.0.1 is in use, so the Overseer did not start.'],
  [{ kind: 'overseer-port-in-use', firstPort: 4242, lastPort: 4252 }, 'Every port from 4242 to 4252 on 127.0.0.1 is in use, so the Overseer did not start.'],
  [
    {
      kind: 'baton-pass-failed', successorCodeVersion: 'code-example', step: 'take-baton', error: 'Example error', url: URL
    },
    `The Baton pass to code code-example failed at take-baton: Example error. The old Overseer keeps driving at ${URL} and shows this as a warning; `
    + 'see the Overseer log.',
  ],
  [
    { kind: 'overseer-owns-the-lifecycle', url: URL, batonFilePath: BATON },
    `An Overseer drives this board at ${URL} (${BATON}), so only it delivers tickets. Record the work with Delivered by hand… on the ticket's form `
    + 'in the Bridge. Nothing was written.',
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
    boardRefusal({ reason: 'move-of-a-draft', ticketId: '004', targetStatus: 'pending' }),
    'Ticket #004 is a draft ticket, so it was not moved: ready it to build, which checks its Acceptance and Brief.',
  ],
  [boardRefusal({ reason: 'abandon-without-reason', ticketId: '004' }), 'Ticket #004 was not moved: abandon needs a reason. Say why the work was dropped.'],
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
