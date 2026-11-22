/**
 * Every name the product goes by on a machine: its program, its folders, its skills, its storage and environment prefixes
 * and its first Hephaestus port. A build linked beside the released one takes the side-by-side names, so neither reads or removes the other's
 * files.
 */
export interface ProductNames {
  PROGRAM:               string;
  DATA_FOLDER:           string;
  WORKTREES_FOLDER:      string;
  MONITOR_FOLDER:        string;
  PRODUCT_OWNER_SKILL:   string;
  PIPELINE_SETUP_SKILL:  string;
  STORAGE_PREFIX:        string;
  ENVIRONMENT_PREFIX:    string;
  HEPHAESTUS_PORT_FIRST: number;
}

/** The names the released program has always gone by. */
export const ORIGINAL_PRODUCT_NAMES: Readonly<ProductNames> = {
  PROGRAM:               'agent-progress',
  DATA_FOLDER:           '.agent-progress',
  WORKTREES_FOLDER:      '.agent-progress-worktrees',
  MONITOR_FOLDER:        '.agent-progress-monitor',
  PRODUCT_OWNER_SKILL:   'agent-po',
  PIPELINE_SETUP_SKILL:  'agent-pipeline',
  STORAGE_PREFIX:        'agent-progress',
  ENVIRONMENT_PREFIX:    'AGENT_PROGRESS_',
  HEPHAESTUS_PORT_FIRST: 4730,
};

/** The names of a build `bun link`ed beside the released program while the code-owned lifecycle is under way. */
export const SIDE_BY_SIDE_PRODUCT_NAMES: Readonly<ProductNames> = {
  PROGRAM:               'forge',
  DATA_FOLDER:           '.forge',
  WORKTREES_FOLDER:      '.forge-worktrees',
  MONITOR_FOLDER:        '.forge-monitor',
  PRODUCT_OWNER_SKILL:   'forge-po',
  PIPELINE_SETUP_SKILL:  'forge-pipeline',
  STORAGE_PREFIX:        'forge',
  ENVIRONMENT_PREFIX:    'FORGE_',
  HEPHAESTUS_PORT_FIRST: 4930,
};

export const PRODUCT_NAMES: Readonly<ProductNames> = SIDE_BY_SIDE_PRODUCT_NAMES;
