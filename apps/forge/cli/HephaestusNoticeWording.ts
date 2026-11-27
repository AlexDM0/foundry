/** The notice and restart warning lines `status` prints from the live Hephaestus's state document. */
import { OperationRefusalWordingUtil } from '../src/adapters/utils/OperationRefusalWordingUtil.ts';
import type { HephaestusNotice }       from '../src/services/hephaestus/DrivePass.ts';
import type { RestartFailure }         from '../src/services/hephaestus/Restart.ts';
import { PRODUCT_NAMES }               from '../src/shared/constants/ProductNames.ts';

const ABANDONED_PASS_REASON_TEXT: Readonly<Record<Extract<HephaestusNotice, { kind: 'passes-abandoned' }>['reason'], string>> = {
  'tracker-lock-held': 'another process held the board\'s lock past its wait',
  'lock-taken-over':   'another process took the board\'s lock over',
};

function noticeTextOf(notice: HephaestusNotice): string {
  switch (notice.kind) {
    case 'install-version-changed':
      return `the install version changed, so launches are held: run \`${PRODUCT_NAMES.PROGRAM} update\``;
    case 'new-code':
      return `new code: run \`${PRODUCT_NAMES.PROGRAM} update\``;
    case 'attribution-found':
      return `ticket #${notice.ticketId} carries an AI attribution`;
    case 'rounds-not-converging':
      return `ticket #${notice.ticketId}'s review rounds are not converging`;
    case 'dirty-main-checkout':
      return notice.blockingFiles.length === 0
        ? `landings on ${notice.target} wait: the main checkout is on ${notice.branch ?? 'no branch'}, not ${notice.target}`
        : `landings on ${notice.target} wait: the main checkout's changes to ${notice.blockingFiles.join(', ')} block the fast-forward`;
    case 'target-file-held':
      return `landings on ${notice.target} wait: another process holds ${notice.heldFiles.join(', ')} open, so git cannot replace what is held; close that program`;
    case 'incident-defaulted':
      return `incident ${notice.incidentId} took its default, ${notice.move}, as no Assistant handled it (${notice.cause})`;
    case 'cleanup-declined':
      return `git declined the ${notice.cleanup} cleanup of ${notice.groupBranch}, so it is left in place: ${notice.reason}`;
    case 'instructions-missing':
      return `job ${notice.jobId} is not launched: the instruction file ${notice.path} its pipeline names is missing`;
    case 'agent-program-refused':
      return OperationRefusalWordingUtil.agentProgramRefusalTextOf(notice.jobId, notice.reason, notice.repair);
    case 'passes-abandoned':
      return `${notice.inARow} drive passes in a row were abandoned (${notice.reason}), the last as ${ABANDONED_PASS_REASON_TEXT[notice.reason]}; `
        + 'Hephaestus keeps running and tries again at each wake-up';
  }
}

function restartWarningTextOf(failure: RestartFailure): string {
  return `the restart to code ${failure.successorCodeVersion} failed at ${failure.step}: ${failure.error}; this Hephaestus keeps driving`;
}

export const HephaestusNoticeWording = Object.freeze({
  noticeTextOf,
  restartWarningTextOf,
});
