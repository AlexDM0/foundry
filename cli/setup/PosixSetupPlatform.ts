import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join }                                     from 'node:path';

import { type SearchPathOffer, type SetupPlatform } from './SetupPlatform.ts';

const BUN_BIN_FOLDER_MARK = '.bun/bin';

function shellStartupFileOf({ homeDirectory, userShell }: SearchPathOffer['host']): string {
  return join(homeDirectory, userShell?.endsWith('/bash') === true ? '.bashrc' : '.zshrc');
}

function offerSearchPathEntry({
  host, report, binFolder, instructOnly
}: SearchPathOffer): void {
  const startupFile = shellStartupFileOf(host);
  const startupText = existsSync(startupFile) ? readFileSync(startupFile, 'utf8') : '';
  if (startupText.includes(BUN_BIN_FOLDER_MARK) || startupText.includes(binFolder)) {
    report.done(`${startupFile} already exports ${binFolder} — open a new terminal to pick it up`);
    return;
  }
  const exportLine = `export PATH="${binFolder}:$PATH"`;
  if (!instructOnly && host.answersYes(`Add '${exportLine}' to ${startupFile}?`)) {
    appendFileSync(startupFile, `\n${exportLine}\n`);
    report.done(`Added to ${startupFile} — takes effect in new terminals`);
    return;
  }
  report.notice(`Then use: bun "${join(host.checkoutDirectory, 'agent-progress.ts')}" <command>, or add ${binFolder} to PATH yourself`);
}

/** macOS and Linux: the program file carries no extension, and a shell startup file puts Bun's bin folder on the search path. */
export const POSIX_SETUP_PLATFORM: SetupPlatform = {
  executableFileNameOf: (programName) => programName,
  offerSearchPathEntry,
};
