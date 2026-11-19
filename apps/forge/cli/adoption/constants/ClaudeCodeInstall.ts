/**
 * What `init` and `update` install for Claude Code: the parts, in report order, each with the files it writes, the flag that opts out of it
 * and its report label.
 */
import type { CommandHook }                 from '../../../src/lib/claude-code/ClaudeSettings.ts';
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

/** A folder of this checkout's `skills/`, copied into the repository's `.claude/skills/` under the name the product gives that skill. */
export type SkillSourceFolderName = 'agent-po' | 'agent-progress-orchestrate';

/** Each skill source folder's installed name, which its `SKILL.md` frontmatter is filled with too, so Claude Code knows it by its folder. */
export function installedSkillNamesFor(productNames: Pick<ProductNames, 'PRODUCT_OWNER_SKILL' | 'ORCHESTRATE_SKILL'>): Readonly<Record<SkillSourceFolderName, string>> {
  return {
    'agent-po':                   productNames.PRODUCT_OWNER_SKILL,
    'agent-progress-orchestrate': productNames.ORCHESTRATE_SKILL,
  };
}

export const INSTALLED_SKILL_NAMES = installedSkillNamesFor(PRODUCT_NAMES);

/**
 * `briefs` replaces each file whole and asks the reader to re-read the last one, whose presence marks the files installed;
 * `claude-settings-hooks` writes no file text, only Claude Code settings entries; `skill-folders` rewrites every file of each skill folder,
 * leaves any other file in it alone and git-ignores the folder; `ignored-folders` git-ignores folders the product makes later.
 */
export type InstalledPart =
  | { writing: 'briefs'; reportLabel: string; optOutFlag: null; files: readonly InstalledFile[] }
  | { writing: 'claude-settings-hooks'; reportLabel: string; optOutFlag: InstallOptOutFlag | null; hooks: readonly CommandHook[] }
  | { writing: 'skill-folders'; reportLabel: string; optOutFlag: null; installedSkillNames: Readonly<Record<SkillSourceFolderName, string>> }
  | { writing: 'ignored-folders'; reportLabel: string; optOutFlag: null; folderNames: readonly string[] };

/** Prints `session-instructions.md` to every session User opens, which is how a session learns how this repository tracks its work. */
const SESSION_START_HOOK: CommandHook = {
  event:          'SessionStart',
  matcher:        '',
  command:        `${PRODUCT_NAMES.PROGRAM} hook session-start`,
  timeoutSeconds: 10,
};

export const CLAUDE_CODE_INSTALL: { parts: readonly InstalledPart[] } = {
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
        { name: 'pipelineAgentDefault', templateFileName: 'PipelineAgentBrief.md' },
        { name: 'assistantDefault', templateFileName: 'AssistantBrief.md' },
        { name: 'sessionInstructions', templateFileName: 'SessionInstructions.md' },
      ],
    },
    {
      writing:     'claude-settings-hooks',
      reportLabel: 'hooks',
      optOutFlag:  'no-hooks',
      hooks:       [SESSION_START_HOOK],
    },
    {
      writing:             'skill-folders',
      reportLabel:         'skills',
      optOutFlag:          null,
      installedSkillNames: INSTALLED_SKILL_NAMES,
    },
    {
      writing: 'ignored-folders', reportLabel: 'worktrees', optOutFlag: null, folderNames: [PRODUCT_NAMES.WORKTREES_FOLDER]
    },
  ],
};
