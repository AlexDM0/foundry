import { writeFileAtomically }                                 from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                        from '../../shared/utils/JsonTextUtil.ts';
import { AIRLOCK_FACTS_FORMAT_VERSION, type KeptAirlockFacts } from './AirlockFactsIngestion.ts';

export function createAirlockFactsWriter(factsFilePath: string): { write(facts: KeptAirlockFacts): void } {
  function write(facts: KeptAirlockFacts): void {
    writeFileAtomically(factsFilePath, JsonTextUtil.storedFileTextOf({
      version:             AIRLOCK_FACTS_FORMAT_VERSION,
      conflictedFiles:     facts.conflictedFiles,
      leavesTheMergeOpen:  facts.leavesTheMergeOpen,
      filesResolvedBefore: facts.filesResolvedBefore,
    }));
  }

  return { write };
}
