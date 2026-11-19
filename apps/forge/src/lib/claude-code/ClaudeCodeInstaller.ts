/**
 * The agent port's installer for Claude Code: a `SessionStart` command hook in the repository's settings, and the project skill folders
 * an instruction bundle is loaded from.
 */
import type { AgentInstaller } from '../agent-launch/AgentInstaller.ts';
import {
  claudeLocalSettingsFilePathFor,
  claudeSettingsFilePathFor,
  refreshCommandHook,
  writeCommandHook,
  type CommandHook
} from './ClaudeSettings.ts';
import { CLAUDE_DIRECTORY_NAME } from './constants/ClaudeCodePaths.ts';

const SESSION_START_EVENT = 'SessionStart';

const SESSION_START_TIMEOUT_SECONDS = 10;

const SKILLS_FOLDER_NAME = 'skills';

const REFUSED_UNREADABLE_SETTINGS_LINE = 'refused (the settings file could not be read)';

/** Written to the per-user settings file unless the shared one already holds the entry, which is then kept current there. */
function refreshSessionStart(repositoryRoot: string, command: string, commandName: string, standardError: (text: string) => void): string {
  const hook: CommandHook = {
    event: SESSION_START_EVENT, matcher: '', command, timeoutSeconds: SESSION_START_TIMEOUT_SECONDS
  };

  function refusedUnreadableSettings(settingsFilePath: string): string {
    standardError(
      `${settingsFilePath} could not be read as a JSON object, so it was left exactly as it was and the hook was not written. `
      + `Fix or remove that file and run \`${commandName}\` again, or add the \`${command}\` hook to it by hand.`,
    );
    return REFUSED_UNREADABLE_SETTINGS_LINE;
  }

  const sharedSettingsFilePath = claudeSettingsFilePathFor(repositoryRoot);
  const sharedOutcome          = refreshCommandHook(sharedSettingsFilePath, hook);
  if (sharedOutcome === 'refused-unreadable') return refusedUnreadableSettings(sharedSettingsFilePath);
  if (sharedOutcome !== 'absent') return `${sharedSettingsFilePath} (${sharedOutcome})`;

  const localSettingsFilePath = claudeLocalSettingsFilePathFor(repositoryRoot);
  const localOutcome          = refreshCommandHook(localSettingsFilePath, hook);
  if (localOutcome === 'refused-unreadable') return refusedUnreadableSettings(localSettingsFilePath);
  if (localOutcome !== 'absent') return `${localSettingsFilePath} (${localOutcome})`;

  const installOutcome = writeCommandHook(localSettingsFilePath, hook);
  if (installOutcome === 'refused-unreadable') return refusedUnreadableSettings(localSettingsFilePath);
  return `${localSettingsFilePath} (installed)`;
}

/** Claude Code reads a project's skills from `.claude/skills/<name>/`, written with `/` as `.gitignore` takes it. */
function instructionBundleFolderOf(bundleName: string): string {
  return `${CLAUDE_DIRECTORY_NAME}/${SKILLS_FOLDER_NAME}/${bundleName}`;
}

export const CLAUDE_CODE_INSTALLER: AgentInstaller = Object.freeze({ refreshSessionStart, instructionBundleFolderOf });
