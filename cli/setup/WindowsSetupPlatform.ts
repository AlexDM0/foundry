import { join } from 'node:path';

import { type SearchPathOffer, type SetupPlatform } from './SetupPlatform.ts';

function powerShellTextOf(text: string): string {
  return `'${text.replaceAll('\'', '\'\'')}'`;
}

/** The PowerShell that appends a folder to the User `Path` once, the documented no-admin way; cmd and PowerShell read it in new windows. */
export function userPathAdditionCommandOf(binFolder: string): readonly string[] {
  const script = [
    `$binFolder = ${powerShellTextOf(binFolder)}`,
    '$userPath = [Environment]::GetEnvironmentVariable(\'Path\', \'User\')',
    'if ((\'\' + $userPath) -split \';\' -notcontains $binFolder) {',
    '  [Environment]::SetEnvironmentVariable(\'Path\', ((@($userPath, $binFolder) | Where-Object { $_ }) -join \';\'), \'User\')',
    '}',
  ].join('\n');
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
}

function offerSearchPathEntry({
  host, report, binFolder, instructOnly
}: SearchPathOffer): void {
  const question = `Add ${binFolder} to your User PATH?`;
  if (!instructOnly && host.answersYes(question)) {
    const finished = host.run(userPathAdditionCommandOf(binFolder), host.homeDirectory);
    if (finished.exitCode === 0) {
      report.done(`Added ${binFolder} to your User PATH — takes effect in new terminals`);
      return;
    }
    report.failure(`Adding ${binFolder} to your User PATH failed: ${finished.output.trim()}`);
  }
  report.notice(`Then use: bun "${join(host.checkoutDirectory, 'agent-progress.ts')}" <command>, or add ${binFolder} to your User PATH yourself`);
}

/** Windows: the program file is an `.exe`, and the User `Path` in the registry puts Bun's bin folder on the search path. */
export const WINDOWS_SETUP_PLATFORM: SetupPlatform = {
  executableFileNameOf: (programName) => `${programName}.exe`,
  offerSearchPathEntry,
};
