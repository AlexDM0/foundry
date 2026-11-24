/**
 * What `init` and `update` install through the agent port's installer: the parts, in report order, each with the files it writes, the
 * flag that opts out of it and its report label.
 */
import { PRODUCT_NAMES, type ProductNames } from '../../../src/shared/constants/ProductNames.ts';
import type { InstalledFilePaths }          from '../../InstalledFiles.ts';

export const INSTALL_OPT_OUT_FLAGS = ['no-hooks'] as const;

export type InstallOptOutFlag = typeof INSTALL_OPT_OUT_FLAGS[number];

export type InstalledFileName = Exclude<keyof InstalledFilePaths, 'installManifest'>;

export interface InstalledFile {
  name:             InstalledFileName;
  templateFileName: string;
  /** The `resources/` folder the template is read from; absent is `templates`. */
  resourceFolder?:  'prompts';
}

/** A folder of this checkout's `skills/`, copied into the folder the agent loads the bundle from, under the name the product gives it. */
export type SkillSourceFolderName = 'agent-po' | 'agent-pipeline';

type SkillProductNames = Pick<ProductNames, 'PRODUCT_OWNER_SKILL' | 'PIPELINE_SETUP_SKILL'>;

/** Each bundle source folder's installed name, which its files are filled with too, so the agent knows the bundle by its folder. */
export function installedSkillNamesFor(productNames: SkillProductNames): Readonly<Record<SkillSourceFolderName, string>> {
  return {
    'agent-po':       productNames.PRODUCT_OWNER_SKILL,
    'agent-pipeline': productNames.PIPELINE_SETUP_SKILL,
  };
}

export const INSTALLED_SKILL_NAMES = installedSkillNamesFor(PRODUCT_NAMES);

/**
 * `briefs` replaces each file whole and asks the reader to re-read the last one, whose presence marks the files installed;
 * `session-start` has the agent's installer run `command` when a session starts; `instruction-bundles` rewrites every file of each bundle
 * folder, leaves any other file in it alone and git-ignores the folder; `ignored-folders` git-ignores folders the product makes later.
 */
export type InstalledPart =
  | { writing: 'briefs'; reportLabel: string; optOutFlag: null; files: readonly InstalledFile[] }
  | { writing: 'session-start'; reportLabel: string; optOutFlag: InstallOptOutFlag | null; command: string }
  | { writing: 'instruction-bundles'; reportLabel: string; optOutFlag: null; installedSkillNames: Readonly<Record<SkillSourceFolderName, string>> }
  | { writing: 'ignored-folders'; reportLabel: string; optOutFlag: null; folderNames: readonly string[] };

/** Prints `session-instructions.md` to every session User opens, which is how a session learns how this repository tracks its work. */
const SESSION_START_COMMAND = `${PRODUCT_NAMES.PROGRAM} hook session-start`;

export const AGENT_INSTALL: { parts: readonly InstalledPart[] } = {
  parts: [
    {
      writing:     'briefs',
      reportLabel: 'brief',
      optOutFlag:  null,
      files:       [
        { name: 'reference', templateFileName: 'Reference.md' },
        { name: 'constitutionDefault', templateFileName: 'Constitution.md' },
        { name: 'builderDefault', templateFileName: 'BuildPrompt.md', resourceFolder: 'prompts' },
        { name: 'reviewerDefault', templateFileName: 'ReviewPrompt.md', resourceFolder: 'prompts' },
        { name: 'reReviewerDefault', templateFileName: 'ReReviewerBrief.md' },
        { name: 'conflictReReviewerDefault', templateFileName: 'ConflictReReviewerBrief.md' },
        { name: 'productOwnerDefault', templateFileName: 'ProductOwnerPrompt.md', resourceFolder: 'prompts' },
        { name: 'specAgentDefault', templateFileName: 'SpecAgentBrief.md' },
        { name: 'planAgentDefault', templateFileName: 'PlanAgentBrief.md' },
        { name: 'pipelineAgentDefault', templateFileName: 'PipelineAgentBrief.md' },
        { name: 'assistantDefault', templateFileName: 'AssistantBrief.md' },
        { name: 'sessionInstructions', templateFileName: 'SessionInstructions.md' },
      ],
    },
    {
      writing:     'session-start',
      reportLabel: 'hooks',
      optOutFlag:  'no-hooks',
      command:     SESSION_START_COMMAND,
    },
    {
      writing:             'instruction-bundles',
      reportLabel:         'skills',
      optOutFlag:          null,
      installedSkillNames: INSTALLED_SKILL_NAMES,
    },
    {
      writing: 'ignored-folders', reportLabel: 'worktrees', optOutFlag: null, folderNames: [PRODUCT_NAMES.WORKTREES_FOLDER]
    },
  ],
};
