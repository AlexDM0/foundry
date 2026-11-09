/**
 * Every name the product goes by on a machine: its program, its folders, its skills, its storage and environment prefixes, its login item
 * and its first Overseer port. A build linked beside the released one takes the side-by-side names, so neither reads or removes the other's
 * files. It imports nothing, so the Bridge's project compiles it.
 */
export interface ProductNames {
  PROGRAM:             string;
  DATA_FOLDER:         string;
  WORKTREES_FOLDER:    string;
  MONITOR_FOLDER:      string;
  PRODUCT_OWNER_SKILL: string;
  ORCHESTRATE_SKILL:   string;
  STORAGE_PREFIX:      string;
  ENVIRONMENT_PREFIX:  string;
  /** The login item's default name: the LaunchAgent label, the systemd unit `<label>.service` and the Windows Run value. */
  LOGIN_ITEM_LABEL:    string;
  OVERSEER_PORT_FIRST: number;
}

/** The names the released program has always gone by. */
export const ORIGINAL_PRODUCT_NAMES: Readonly<ProductNames> = {
  PROGRAM:             'agent-progress',
  DATA_FOLDER:         '.agent-progress',
  WORKTREES_FOLDER:    '.agent-progress-worktrees',
  MONITOR_FOLDER:      '.agent-progress-monitor',
  PRODUCT_OWNER_SKILL: 'agent-po',
  ORCHESTRATE_SKILL:   'agent-progress-orchestrate',
  STORAGE_PREFIX:      'agent-progress',
  ENVIRONMENT_PREFIX:  'AGENT_PROGRESS_',
  LOGIN_ITEM_LABEL:    'com.agent-progress.overseer',
  OVERSEER_PORT_FIRST: 4730,
};

/** The names of a build `bun link`ed beside the released program while the code-owned lifecycle is under way. */
export const SIDE_BY_SIDE_PRODUCT_NAMES: Readonly<ProductNames> = {
  PROGRAM:             'forge',
  DATA_FOLDER:         '.forge',
  WORKTREES_FOLDER:    '.forge-worktrees',
  MONITOR_FOLDER:      '.forge-monitor',
  PRODUCT_OWNER_SKILL: 'forge-po',
  ORCHESTRATE_SKILL:   'forge-orchestrate',
  STORAGE_PREFIX:      'forge',
  ENVIRONMENT_PREFIX:  'FORGE_',
  LOGIN_ITEM_LABEL:    'com.forge.overseer',
  OVERSEER_PORT_FIRST: 4930,
};

export const PRODUCT_NAMES: Readonly<ProductNames> = SIDE_BY_SIDE_PRODUCT_NAMES;
