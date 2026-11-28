/** Why a job's line or a session's launch never started, as a code and the values it names; `src/adapters/LineRefusalWording.ts` words it. */
import type { ShellRunRefusal }    from '../../lib/shell-line/ShellLine.ts';
import type { ConfinementRefusal } from './ConfinementRefusal.ts';

export type LineRefusal =
  | { readonly code: 'shell-run-refused'; readonly refusal: ShellRunRefusal; readonly directory: string }
  | { readonly code: 'denied-root-unmade'; readonly deniedRoot: string }
  | { readonly code: 'confinement-refused'; readonly confinementRefusal: ConfinementRefusal };

/** The step whose line or launch never started, and why. */
export interface RefusedStep {
  readonly step:    string;
  readonly refusal: LineRefusal;
}
