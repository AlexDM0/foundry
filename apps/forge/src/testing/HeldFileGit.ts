/**
 * A fake git as Windows runs it over a file another process holds open: the first runs fail part way with `unable to unlink old`, after a
 * write the spec gives, and every later run is real git. It counts the pauses between tries.
 */
import { GitProcess }                   from '../lib/git/GitProcess.ts';
import type { CheckoutWritePrimitives } from '../lib/git/HeldCheckout.ts';

const HELD_FILE_EXIT_CODE = 128;

export type CountingCheckoutWritePrimitives = CheckoutWritePrimitives & { pauses: number };

export function heldFileGit(heldPath: string, heldRuns: number, writeBeforeFailing: () => void = () => undefined): CountingCheckoutWritePrimitives {
  let heldRunsLeft = heldRuns;
  const primitives: CountingCheckoutWritePrimitives = {
    pauses: 0,
    pause:  () => { primitives.pauses += 1; },
    runGit: (...gitRun: Parameters<typeof GitProcess.run>) => {
      if (heldRunsLeft === 0) return GitProcess.run(...gitRun);
      heldRunsLeft -= 1;
      writeBeforeFailing();
      return { exitCode: HELD_FILE_EXIT_CODE, standardOutput: '', standardError: `error: unable to unlink old '${heldPath}': Invalid argument` };
    },
  };
  return primitives;
}
