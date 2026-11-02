import { lstatSync, realpathSync, rmSync } from 'node:fs';
import { join, sep }                       from 'node:path';

import { type SetupHost }   from './SetupHost.ts';
import { type SetupReport } from './SetupReport.ts';

const RETIRED_SKILL_NAMES = ['agent-progress', 'agent-progress-orchestrate'] as const;

/** Physical on both sides: a textual link comparison is wrong the moment either path crosses a linked folder (/tmp against /private/tmp). */
function resolvedPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return '';
  }
}

function existsAsAnything(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * `init` and `update` copy both skills into each tracked repository's .claude/skills/, so nothing is linked into ~/.claude/skills/ any
 * more. This removes the two links earlier versions made, and only when each resolves into this checkout: people keep their own work in
 * that folder, so anything else at those paths is reported and left where it is.
 */
export function removeRetiredSkillLinks(host: SetupHost, report: SetupReport, instructOnly: boolean): void {
  const checkoutAt = resolvedPathOf(host.checkoutDirectory);
  for (const skillName of RETIRED_SKILL_NAMES) {
    const skillPath = join(host.homeDirectory, '.claude', 'skills', skillName);
    if (!existsAsAnything(skillPath)) {
      report.done(`No global skill at ${skillPath}`);
    } else if (!lstatSync(skillPath).isSymbolicLink()) {
      report.notice(`${skillPath} is not a symlink setup made — left untouched. The init command installs the skill per repository now; `
        + 'remove it yourself if it is a stale copy.');
    } else {
      const linkedAt = resolvedPathOf(skillPath);
      if (linkedAt === '' || checkoutAt === '' || !linkedAt.startsWith(`${checkoutAt}${sep}`)) {
        report.notice(`${skillPath} is a symlink to ${linkedAt === '' ? 'nothing' : linkedAt}, not into this checkout — left untouched.`);
      } else if (instructOnly) {
        report.notice(`Would remove the retired skill link ${skillPath} → ${linkedAt}`);
      } else {
        rmSync(skillPath, { force: true });
        report.done(`Removed the retired skill link ${skillPath} → ${linkedAt}`);
      }
    }
  }
}
