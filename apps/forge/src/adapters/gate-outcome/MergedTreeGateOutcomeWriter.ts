import { writeFileAtomically }                                                           from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                                                  from '../../shared/utils/JsonTextUtil.ts';
import { LineRefusalWording }                                                            from '../LineRefusalWording.ts';
import type { MergedTreeGate, MergedTreeGateRunEnd }                                     from './@types/MergedTreeGate.ts';
import { MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, MERGED_TREE_GATE_OUTCOME_VERSION_KEY } from './MergedTreeGateOutcomeIngestion.ts';

/** A refused line's stored output is its refusal's sentence, as the step's output always kept it. */
function storedGateOf(gate: MergedTreeGateRunEnd): MergedTreeGate {
  if (gate.outcome !== 'sandbox-unavailable') return gate;
  const { refusal, ...kept } = gate;
  return { ...kept, output: LineRefusalWording.sentenceOf(refusal) };
}

export function createMergedTreeGateOutcomeWriter(outcomeFilePath: string): { write(gate: MergedTreeGateRunEnd): void } {
  function write(gate: MergedTreeGateRunEnd): void {
    const stored = { [MERGED_TREE_GATE_OUTCOME_VERSION_KEY]: MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, gate: storedGateOf(gate) };
    writeFileAtomically(outcomeFilePath, JsonTextUtil.storedFileTextOf(stored));
  }

  return { write };
}
