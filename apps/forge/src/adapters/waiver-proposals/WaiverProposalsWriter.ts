import { writeFileAtomically }                                  from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                         from '../../shared/utils/JsonTextUtil.ts';
import { WAIVER_PROPOSALS_FORMAT_VERSION, type WaiverProposal } from './WaiverProposalsIngestion.ts';

export function createWaiverProposalsWriter(proposalsFilePath: string): { write(proposals: readonly WaiverProposal[]): void } {
  function write(proposals: readonly WaiverProposal[]): void {
    const storedProposals = proposals.map(({ item, reason }) => ({ item, reason }));
    writeFileAtomically(proposalsFilePath, JsonTextUtil.storedFileTextOf({ version: WAIVER_PROPOSALS_FORMAT_VERSION, proposals: storedProposals }));
  }

  return { write };
}
