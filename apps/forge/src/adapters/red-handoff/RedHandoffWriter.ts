import { writeFileAtomically }                              from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                     from '../../shared/utils/JsonTextUtil.ts';
import { RED_HANDOFF_FORMAT_VERSION, type RedHandoffFacts } from './RedHandoffIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the resume that reads the facts never meets half of them. */
export function createRedHandoffWriter(factsFilePath: string): { write(facts: Readonly<RedHandoffFacts>): void } {
  function write(facts: Readonly<RedHandoffFacts>): void {
    writeFileAtomically(factsFilePath, JsonTextUtil.storedFileTextOf({ version: RED_HANDOFF_FORMAT_VERSION, ...facts }));
  }

  return { write };
}
