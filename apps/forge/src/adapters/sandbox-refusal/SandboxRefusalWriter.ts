import { writeFileAtomically }                                 from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                        from '../../shared/utils/JsonTextUtil.ts';
import { SANDBOX_REFUSAL_FORMAT_VERSION, type SandboxRefusal } from './SandboxRefusalIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the hold that opens the refusal's incident never reads half of it. */
export function createSandboxRefusalWriter(refusalFilePath: string): { write(refusal: Readonly<SandboxRefusal>): void } {
  function write(refusal: Readonly<SandboxRefusal>): void {
    writeFileAtomically(refusalFilePath, JsonTextUtil.storedFileTextOf({ version: SANDBOX_REFUSAL_FORMAT_VERSION, step: refusal.step, reason: refusal.reason }));
  }

  return { write };
}
