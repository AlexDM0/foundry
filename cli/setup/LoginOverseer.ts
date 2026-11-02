import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { delimiter, join } from 'node:path';

import { ToolRuntimeUtil }                from '../../src/shared/ToolRuntimeUtil.ts';
import { bunBinFolderOf, physicalPathOf } from './InstallStep.ts';
import { type SetupHost }                 from './SetupHost.ts';
import { type SetupReport }               from './SetupReport.ts';

export interface LoginOverseerRequest {
  readonly repository:   string;
  readonly label:        string;
  readonly instructOnly: boolean;
}

function xmlEscaped(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function propertyListOf(label: string, programArguments: readonly string[], repository: string, searchPath: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${xmlEscaped(label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...programArguments.map((argument) => `    <string>${xmlEscaped(argument)}</string>`),
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${xmlEscaped(repository)}</string>`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>PATH</key>',
    `    <string>${xmlEscaped(searchPath)}</string>`,
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** The Overseer restarts after a reboot only through the user, the dashboard or this optional item; runtime code never installs it. */
export function writeLoginOverseer(host: SetupHost, report: SetupReport, request: LoginOverseerRequest): number {
  if (!existsSync(request.repository) || !statSync(request.repository).isDirectory()) {
    report.failure(`${request.repository} is not a folder`);
    return 1;
  }
  const repository = realpathSync(request.repository);
  const bunPath = physicalPathOf(host.bunProgram);
  const propertyListFolder = join(host.homeDirectory, 'Library', 'LaunchAgents');
  const propertyListPath = join(propertyListFolder, `${request.label}.plist`);
  if (existsSync(propertyListPath) && !readFileSync(propertyListPath, 'utf8').includes(`<string>${xmlEscaped(repository)}</string>`)) {
    report.failure(`${propertyListPath} already starts the Overseer of another repository; pass --label <label> for ${repository}`);
    return 1;
  }
  const checkout = host.checkoutDirectory;
  const programArguments = [bunPath, ...ToolRuntimeUtil.isolatingArgumentsFor(checkout), join(checkout, 'agent-progress.ts'), 'oversee', '--detach'];
  if (request.instructOnly) {
    report.notice(`Would write ${propertyListPath}, running ${programArguments.join(' ')} in ${repository} at login`);
    return 0;
  }
  mkdirSync(propertyListFolder, { recursive: true });
  const searchPath = [bunBinFolderOf(host), ...host.searchPath].join(delimiter);
  writeFileSync(propertyListPath, propertyListOf(request.label, programArguments, repository, searchPath));
  report.done(`Wrote ${propertyListPath}: the Overseer of ${repository} starts at login`);
  report.notice(`To start it now as well: launchctl bootstrap gui/$(id -u) "${propertyListPath}"`);
  return 0;
}
