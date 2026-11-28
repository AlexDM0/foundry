/**
 * Verification by code of what a session left (design section 5.1, V1 to V17): nothing it says is taken as true, so each check reads git,
 * the ticket body and the report itself, and answers a wordless verdict. A role runs only the checks its column of the table names.
 */
import type { CustomsSubject, VerifiedRole }                            from './@types/CustomsSubject.ts';
import type { CustomsVerdict, VerificationCheck, VerificationCheckRun } from './@types/CustomsVerdict.ts';
import { CustomsAgentConfigCheck }                                      from './CustomsAgentConfigCheck.ts';
import { CustomsDataFolderCheck }                                       from './CustomsDataFolderCheck.ts';
import { CustomsDefinitionFilesCheck }                                  from './CustomsDefinitionFilesCheck.ts';
import { CustomsHistoryChecks }                                         from './CustomsHistoryChecks.ts';
import { CustomsRefMovesCheck }                                         from './CustomsRefMovesCheck.ts';
import { CustomsReportChecks }                                          from './CustomsReportChecks.ts';
import { CustomsScopeCheck }                                            from './CustomsScopeCheck.ts';
import { CustomsTicketChecks }                                          from './CustomsTicketChecks.ts';

export const CUSTOMS_CHECKS: Readonly<Record<VerificationCheck, VerificationCheckRun>> = {
  V1:  CustomsReportChecks.reportIsValidWithItsHead,
  V2:  CustomsHistoryChecks.headDescendsFromTheStart,
  V3:  CustomsHistoryChecks.aCommitSinceTheStart,
  V4:  CustomsHistoryChecks.worktreeIsClean,
  V5:  CustomsDataFolderCheck.dataFolderUntouched,
  V6:  CustomsTicketChecks.ticketContentUnchanged,
  V7:  CustomsHistoryChecks.noAiAttributionInRange,
  V8:  CustomsReportChecks.everyAcceptanceItemAccountedFor,
  V9:  CustomsReportChecks.fixedFindingsNameCommitsInRange,
  V10: CustomsHistoryChecks.mergeIsResolved,
  V11: CustomsDefinitionFilesCheck.checksDefinitionUnchanged,
  V12: CustomsReportChecks.filedFindingsWereFiledByThisJob,
  V13: CustomsAgentConfigCheck.agentConfigUntouched,
  V14: CustomsRefMovesCheck.onlyOwnRefsMoved,
  V15: CustomsReportChecks.everyAgentGateClaimedOnHead,
  V16: CustomsHistoryChecks.headUnmoved,
  V17: CustomsScopeCheck.changesStayInHomeAndReach,
  V18: CustomsTicketChecks.ticketDocumentsUnchanged,
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
