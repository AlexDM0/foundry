/** One forge as the machine's registry `projects.json` names it, mapped in. */
import type { ForgeRegistryPresence } from '../../../shared/@types/ForgePresence.ts';

/** The live Hephaestus the registry names; the forge removes the key at its stop. */
export interface RegisteredHephaestus {
  readonly url:       string;
  readonly processId: number;
  readonly startedAt: string;
  /** Hephaestus's token file; `null` from a forge that does not write it yet. */
  readonly tokenPath: string | null;
}

export interface RegisteredForge {
  readonly trackerId:     string;
  readonly project:       string;
  readonly root:          string;
  /** The forge program that last wrote the entry; `null` from a forge that does not write it yet. */
  readonly program:       string | null;
  readonly hephaestus:    RegisteredHephaestus | null;
  /** The forge verb that last wrote the entry, as the forge words it: its command word and subcommand, such as `stop`. */
  readonly lastCommand:   string | null;
  /** When the forge last wrote the entry, as the forge stamped it: shown, never compared. */
  readonly lastChangedAt: string | null;
  /** Whether the forge last wrote itself serving, stopped, handed over or crashed; `null` when the entry holds no presence Gaia reads. */
  readonly presence:      ForgeRegistryPresence | null;
}
