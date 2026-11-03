/**
 * The boundary, the placeholders and the situations of each recorded command, shared by the real-system spec that records an answer and
 * the default spec that plays it through `src/testing/RecordedCommand.ts`.
 */
const MISSING_PROGRAM_SITUATION = 'the program missing';

export const GPGCONF_RECORDING = {
  BOUNDARY:            'src/services/overseer/GpgDirectories.ts',
  HOME_PLACEHOLDER:    '<home>',
  PROGRAM_PLACEHOLDER: '<gpgconf>',
  MISSING_SITUATION:   MISSING_PROGRAM_SITUATION,
} as const;

export const VERSION_CHECK_RECORDING = {
  BOUNDARY:             'src/services/overseer/InstallChangeWatch.ts',
  BUN_PLACEHOLDER:      '<bun>',
  CHECKOUT_PLACEHOLDER: '<checkout>',
  MISSING_SITUATION:    MISSING_PROGRAM_SITUATION,
} as const;

export const OPENER_RECORDING = {
  BOUNDARY:            'cli/OpenInTheDefaultBrowser.ts',
  URL_PLACEHOLDER:     '<url>',
  SCRATCH_PLACEHOLDER: '<scratch>',
  MISSING_SITUATION:   MISSING_PROGRAM_SITUATION,
} as const;

export const SETUP_RECORDING = {
  BOUNDARY:             'cli/setup/',
  BUN_PLACEHOLDER:      '<bun>',
  CHECKOUT_PLACEHOLDER: '<checkout>',
  KEY_UNSET_SITUATION:  'the key unset',
  KEY_SET_SITUATION:    'the key set',
  MISSING_SITUATION:    MISSING_PROGRAM_SITUATION,
} as const;

export const ESLINT_RECORDING = {
  BOUNDARY:           'eslint.config.js',
  BUN_PLACEHOLDER:    '<bun>',
  SCRIPT_PLACEHOLDER: '<the line ending script>',
} as const;
