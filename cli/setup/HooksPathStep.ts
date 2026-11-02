import { type SetupHost }   from './SetupHost.ts';
import { type SetupReport } from './SetupReport.ts';

/** Relative, so it resolves in whichever worktree a commit is made; the setting is shared by every worktree of the repository. */
const GIT_HOOKS_PATH = '.githooks';

export function pointHooksPathAtTheTrackedHooks(host: SetupHost, report: SetupReport, instructOnly: boolean): void {
  const checkout = host.checkoutDirectory;
  const currentHooksPath = host.run(['git', '-C', checkout, 'config', '--get', 'core.hooksPath'], checkout).output.trim();
  const currentWording = currentHooksPath === '' ? 'unset' : currentHooksPath;
  if (currentHooksPath === GIT_HOOKS_PATH) {
    report.done(`core.hooksPath already points at ${GIT_HOOKS_PATH}`);
  } else if (instructOnly) {
    report.notice(`Would set core.hooksPath to ${GIT_HOOKS_PATH} in ${checkout} (it is currently ${currentWording})`);
  } else if (host.run(['git', '-C', checkout, 'config', 'core.hooksPath', GIT_HOOKS_PATH], checkout).exitCode === 0) {
    report.done(`core.hooksPath set to ${GIT_HOOKS_PATH} (it was ${currentWording})`);
  } else {
    report.failure(`git config core.hooksPath ${GIT_HOOKS_PATH} failed in ${checkout}; commits there skip the pre-commit hook`);
  }
}
