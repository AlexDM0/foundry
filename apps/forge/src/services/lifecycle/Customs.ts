/**
 * Verification by code of what a session left (design section 5.1, V1 to V17): nothing it says is taken as true, so each check reads git,
 * the ticket body and the report itself, and answers a wordless verdict. A role runs only the checks its column of the table names.
 */
import type { CustomsSubject, VerifiedRole }                            from './@types/CustomsSubject.ts';
import type { CustomsVerdict, VerificationCheck, VerificationCheckRun } from './@types/CustomsVerdict.ts';
import { agentConfigUntouched }                                         from './CustomsAgentConfigCheck.ts';
import { dataFolderUntouched }                                          from './CustomsDataFolderCheck.ts';
import { checksDefinitionUnchanged }                                    from './CustomsDefinitionFilesCheck.ts';
import {
  aCommitSinceTheStart,
  headDescendsFromTheStart,
  headUnmoved,
  mergeIsResolved,
  noAiAttributionInRange,
  worktreeIsClean
} from './CustomsHistoryChecks.ts';
import { onlyOwnRefsMoved }  from './CustomsRefMovesCheck.ts';
import {
  everyAcceptanceItemAccountedFor,
  everyAgentGateClaimedOnHead,
  filedFindingsWereFiledByThisJob,
  fixedFindingsNameCommitsInRange,
  reportIsValidWithItsHead
} from './CustomsReportChecks.ts';
import { changesStayInHomeAndReach }                        from './CustomsScopeCheck.ts';
import { ticketContentUnchanged, ticketDocumentsUnchanged } from './CustomsTicketChecks.ts';

export const CUSTOMS_CHECKS: Readonly<Record<VerificationCheck, VerificationCheckRun>> = {
  V1:  reportIsValidWithItsHead,
  V2:  headDescendsFromTheStart,
  V3:  aCommitSinceTheStart,
  V4:  worktreeIsClean,
  V5:  dataFolderUntouched,
  V6:  ticketContentUnchanged,
  V7:  noAiAttributionInRange,
  V8:  everyAcceptanceItemAccountedFor,
  V9:  fixedFindingsNameCommitsInRange,
  V10: mergeIsResolved,
  V11: checksDefinitionUnchanged,
  V12: filedFindingsWereFiledByThisJob,
  V13: agentConfigUntouched,
  V14: onlyOwnRefsMoved,
  V15: everyAgentGateClaimedOnHead,
  V16: headUnmoved,
  V17: changesStayInHomeAndReach,
  V18: ticketDocumentsUnchanged,
};

/** The design's table, column by column, in check order. */
export const CHECKS_OF_ROLE: Readonly<Record<VerifiedRole, readonly VerificationCheck[]>> = {
  'builder':        ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V18', 'V7', 'V8', 'V11', 'V17', 'V13', 'V14', 'V15'],
  'reviewer':       ['V1', 'V2', 'V4', 'V5', 'V6', 'V18', 'V7', 'V8', 'V9', 'V11', 'V17', 'V12', 'V13', 'V14'],
  'airlock-agent':  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V18', 'V7', 'V10', 'V11', 'V17', 'V13', 'V14'],
  'pipeline-agent': ['V16', 'V4', 'V5', 'V13', 'V14'],
  'document-agent': ['V16', 'V4', 'V5', 'V13', 'V14'],
};

/** The first check of the role's column that refuses, so Hephaestus acts on one reason. */
export function clearCustoms(subject: CustomsSubject): CustomsVerdict {
  for (const check of CHECKS_OF_ROLE[subject.role]) {
    const verdict = CUSTOMS_CHECKS[check](subject);
    if (verdict.verdict === 'refused') return { ...verdict, check };
  }
  return { verdict: 'verified' };
}
