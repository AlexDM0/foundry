/** One forge as the machine's registry `projects.json` names it, mapped in. */

/** The live Overseer the registry names; the forge removes the key at its stop. */
export interface RegisteredOverseer {
  readonly url:       string;
  readonly processId: number;
  readonly startedAt: string;
  /** The Overseer's token file (F4); `null` from a forge that does not write it yet. */
  readonly tokenPath: string | null;
}

export interface RegisteredForge {
  readonly trackerId:     string;
  readonly project:       string;
  readonly root:          string;
  /** The forge program that last wrote the entry (F9); `null` from a forge that does not write it yet. */
  readonly program:       string | null;
  readonly overseer:      RegisteredOverseer | null;
  /** The forge verb that last wrote the entry, as the forge words it: its command word and subcommand, such as `oversee stop`. */
  readonly lastCommand:   string | null;
  /** When the forge last wrote the entry, as the forge stamped it: shown, never compared. */
  readonly lastChangedAt: string | null;
}
