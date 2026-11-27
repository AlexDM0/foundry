import { createWholeFileAtomically, writeFileAtomically }   from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }              from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                         from '../../lib/atomic-file/FileReplaceFor.ts';
import { JsonTextUtil }                                     from '../../shared/utils/JsonTextUtil.ts';
import { AGENT_SLOT_FORMAT_VERSION, type AgentSlotHolding } from './AgentSlotIngestion.ts';

function slotTextOf(holding: AgentSlotHolding): string {
  return JsonTextUtil.storedFileTextOf({
    version: AGENT_SLOT_FORMAT_VERSION, trackerId: holding.trackerId, jobId: holding.jobId, hephaestus: holding.hephaestus
  });
}

/**
 * A slot is claimed by creating it exclusively and whole, so of two claimers only one holds it, and no taker reads a partial slot as stale;
 * where hard links fail the create throws. Its holder alone rewrites it.
 */
export function createAgentSlotWriter(slotFilePath: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): {
  create(holding: AgentSlotHolding): ExclusiveCreation;
  write(holding: AgentSlotHolding): void;
} {
  return {
    create: (holding) => createWholeFileAtomically(slotFilePath, slotTextOf(holding), fileReplace),
    write:  (holding) => writeFileAtomically(slotFilePath, slotTextOf(holding), fileReplace),
  };
}
