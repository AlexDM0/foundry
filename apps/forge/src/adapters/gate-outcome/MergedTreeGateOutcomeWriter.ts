import { writeFileAtomically }                                                           from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                                                  from '../../shared/utils/JsonTextUtil.ts';
import type { MergedTreeGate }                                                           from './@types/MergedTreeGate.ts';
import { MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, MERGED_TREE_GATE_OUTCOME_VERSION_KEY } from './MergedTreeGateOutcomeIngestion.ts';

export function createMergedTreeGateOutcomeWriter(outcomeFilePath: string): { write(gate: MergedTreeGate): void } {
  function write(gate: MergedTreeGate): void {
    writeFileAtomically(outcomeFilePath, JsonTextUtil.storedFileTextOf({ [MERGED_TREE_GATE_OUTCOME_VERSION_KEY]: MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, gate }));
  }

  return { write };
}
