/** `waiver-proposals.json`, the Acceptance items a review job proposed to waive, kept for User's answer: read, validate, map. */
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

/** An Acceptance item, `A<n>`, and the reviewer's reason to waive it. */
export interface WaiverProposal {
  readonly item:   string;
  readonly reason: string;
}

export type WaiverProposalsReading =
  | { verdict: 'readable'; proposals: readonly WaiverProposal[] }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export const WAIVER_PROPOSALS_FORMAT_VERSION = 1;

function isAWaiverProposal(value: unknown): value is WaiverProposal {
  return JsonRecordUtil.valueIsAPlainObject(value) && typeof value['item'] === 'string' && typeof value['reason'] === 'string';
}

export class WaiverProposalsIngestion {
  constructor(private readonly proposalsFilePath: string) {}

  /** Never throws. A settled waiver always stores at least one proposal, so an empty list is unreadable. */
  read(): WaiverProposalsReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.proposalsFilePath, WAIVER_PROPOSALS_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { proposals } = stored.document;
    if (!Array.isArray(proposals) || proposals.length === 0) return { verdict: 'unreadable', reason: 'its "proposals" is not a list of at least one proposal' };
    const malformedIndex = proposals.findIndex((proposal) => !isAWaiverProposal(proposal));
    if (malformedIndex !== -1) return { verdict: 'unreadable', reason: `proposals[${malformedIndex}] holds no text "item" and "reason"` };
    return { verdict: 'readable', proposals: (proposals as WaiverProposal[]).map(({ item, reason }) => ({ item, reason })) };
  }
}
