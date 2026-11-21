/** Where each file the tool installs into a tracked repository lives. */
import { join } from 'node:path';

import { CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf } from '../src/services/hephaestus/InstructionFiles.ts';
import { PRODUCT_NAMES }                                       from '../src/shared/constants/ProductNames.ts';

const INSTALL_MANIFEST_FILE_NAME = 'version.json';

const REFERENCE_FILE_NAME = 'reference.md';

const SESSION_INSTRUCTIONS_FILE_NAME = 'session-instructions.md';

export interface InstalledFilePaths {
  /** The file formats, the moves and the exit codes, which the skills cite for a session to read on demand. */
  reference:                 string;
  /** The default instruction files a pipeline's `constitution` and `agents` arrays name, generated and refreshed each version. */
  constitutionDefault:       string;
  builderDefault:            string;
  reviewerDefault:           string;
  reReviewerDefault:         string;
  conflictReReviewerDefault: string;
  productOwnerDefault:       string;
  pipelineAgentDefault:      string;
  assistantDefault:          string;
  /** What the agent's session-start entry prints to each session User opens; its presence marks the files installed. */
  sessionInstructions:       string;
  installManifest:           string;
}

export function installedFilePathsIn(rootDirectory: string): InstalledFilePaths {
  return {
    reference:                 join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER, REFERENCE_FILE_NAME),
    constitutionDefault:       join(rootDirectory, CONSTITUTION_DEFAULT_PATH),
    builderDefault:            join(rootDirectory, defaultInstructionPathOf('builder')),
    reviewerDefault:           join(rootDirectory, defaultInstructionPathOf('reviewer')),
    reReviewerDefault:         join(rootDirectory, defaultInstructionPathOf('reReviewer')),
    conflictReReviewerDefault: join(rootDirectory, defaultInstructionPathOf('conflictReReviewer')),
    productOwnerDefault:       join(rootDirectory, defaultInstructionPathOf('productOwner')),
    pipelineAgentDefault:      join(rootDirectory, defaultInstructionPathOf('pipelineAgent')),
    assistantDefault:          join(rootDirectory, defaultInstructionPathOf('assistant')),
    sessionInstructions:       join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER, SESSION_INSTRUCTIONS_FILE_NAME),
    installManifest:           join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER, INSTALL_MANIFEST_FILE_NAME),
  };
}
