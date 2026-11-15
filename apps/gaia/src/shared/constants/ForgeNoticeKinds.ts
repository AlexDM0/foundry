/** The forge's notice and warning kinds Gaia treats by name, each part of the forge's monitor contract; every other kind passes through. */
export const FORGE_NOTICE_KINDS = {
  /** The forge's warning that no Assistant can come up: Gaia shows it as a notice, in its own words, and not as a look. */
  assistantDown: 'assistant-down',
} as const;
