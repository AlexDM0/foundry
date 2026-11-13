/** The bounds of an agent limit the Forges view lets User choose; past them a stepper's side is off. */
export const AGENT_LIMITS = {
  /** A forge and the machine each run at least one agent at a time. */
  lowestAgents:       1,
  /**
   * A forge's own limit stops at the forge's `CONCURRENCY_LIMIT_CEILING_AGENTS`, which its monitor snapshot does not report; a forge that
   * refuses a value anyway shows its refusal.
   */
  forgeCeilingAgents: 10,
} as const;
