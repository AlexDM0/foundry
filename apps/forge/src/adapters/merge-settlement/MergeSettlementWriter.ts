import { writeFileAtomically }                                      from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                             from '../../shared/utils/JsonTextUtil.ts';
import { MergeFailureWording }                                      from './MergeFailureWording.ts';
import { MERGE_SETTLEMENT_FORMAT_VERSION, type SettledTargetMerge } from './MergeSettlementIngestion.ts';

function storedSettlementOf(settlement: Readonly<SettledTargetMerge>): Record<string, unknown> {
  if (settlement.verdict !== 'failed') return { ...settlement };
  return { verdict: settlement.verdict, reason: MergeFailureWording.sentenceOf(settlement.failure) };
}

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the merge reads as settled only once its whole settlement is on disk. */
export function createMergeSettlementWriter(settlementFilePath: string): { write(settlement: Readonly<SettledTargetMerge>): void } {
  function write(settlement: Readonly<SettledTargetMerge>): void {
    writeFileAtomically(settlementFilePath, JsonTextUtil.storedFileTextOf({ version: MERGE_SETTLEMENT_FORMAT_VERSION, ...storedSettlementOf(settlement) }));
  }

  return { write };
}
