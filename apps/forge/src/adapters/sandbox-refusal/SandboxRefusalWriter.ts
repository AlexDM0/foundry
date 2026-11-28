import { writeFileAtomically }            from '../../lib/atomic-file/AtomicFile.ts';
import type { RefusedStep }               from '../../shared/@types/LineRefusal.ts';
import { JsonTextUtil }                   from '../../shared/utils/JsonTextUtil.ts';
import { LineRefusalWording }             from '../LineRefusalWording.ts';
import { SANDBOX_REFUSAL_FORMAT_VERSION } from './SandboxRefusalIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the hold that opens the refusal's incident never reads half of it; it keeps the refusal worded. */
export function createSandboxRefusalWriter(refusalFilePath: string): { write(refused: Readonly<RefusedStep>): void } {
  function write(refused: Readonly<RefusedStep>): void {
    const reason = LineRefusalWording.sentenceOf(refused.refusal);
    writeFileAtomically(refusalFilePath, JsonTextUtil.storedFileTextOf({ version: SANDBOX_REFUSAL_FORMAT_VERSION, step: refused.step, reason }));
  }

  return { write };
}
