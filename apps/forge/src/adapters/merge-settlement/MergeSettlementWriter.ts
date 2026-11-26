import { writeFileAtomically }                                         from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                                from '../../shared/utils/JsonTextUtil.ts';
import { MERGE_SETTLEMENT_FORMAT_VERSION, type TargetMergeSettlement } from './MergeSettlementIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the merge reads as settled only once its whole settlement is on disk. */
export function createMergeSettlementWriter(settlementFilePath: string): { write(settlement: Readonly<TargetMergeSettlement>): void } {
  function write(settlement: Readonly<TargetMergeSettlement>): void {
    writeFileAtomically(settlementFilePath, JsonTextUtil.storedFileTextOf({ version: MERGE_SETTLEMENT_FORMAT_VERSION, ...settlement }));
  }

  return { write };
}
