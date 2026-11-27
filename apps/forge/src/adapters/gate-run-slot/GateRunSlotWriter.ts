import { createWholeFileAtomically, writeFileAtomically }                                    from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }                                               from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                                          from '../../lib/atomic-file/FileReplaceFor.ts';
import { JsonTextUtil }                                                                      from '../../shared/utils/JsonTextUtil.ts';
import { GATE_RUN_SLOT_FORMAT_VERSION, GATE_RUN_SLOT_HOLDER_SEPARATOR, type GateRunHolding } from './GateRunSlotIngestion.ts';

function slotTextOf(holding: GateRunHolding): string {
  return `${holding.holder}${GATE_RUN_SLOT_HOLDER_SEPARATOR}${JsonTextUtil.storedFileTextOf({ version: GATE_RUN_SLOT_FORMAT_VERSION, process: holding.process })}`;
}

/**
 * A slot is claimed by creating it exclusively and whole, so of two claimers only one holds it, and no taker reads a partial slot as stale;
 * where hard links fail the create throws. Its holder alone rewrites it.
 */
export function createGateRunSlotWriter(slotFilePath: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): {
  create(holding: GateRunHolding): ExclusiveCreation;
  write(holding: GateRunHolding): void;
} {
  return {
    create: (holding) => createWholeFileAtomically(slotFilePath, slotTextOf(holding), fileReplace),
    write:  (holding) => writeFileAtomically(slotFilePath, slotTextOf(holding), fileReplace),
  };
}
