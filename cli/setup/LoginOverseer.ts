import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { ToolRuntimeUtil }                          from '../../src/shared/ToolRuntimeUtil.ts';
import { type AutostartPrimitives, type LoginItem } from './Autostart.ts';
import { autostartFor }                             from './AutostartFor.ts';
import { bunBinFolderOf, physicalPathOf }           from './InstallStep.ts';
import { type SetupHost }                           from './SetupHost.ts';
import { type SetupReport }                         from './SetupReport.ts';

export interface LoginOverseerRequest {
  readonly repository:   string;
  readonly label:        string;
  readonly instructOnly: boolean;
}

function autostartPrimitivesOf(host: SetupHost): AutostartPrimitives {
  return {
    homeDirectory: host.homeDirectory,
    readText:      (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
    writeText:     (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
    run:                 host.run,
    programOnSearchPath: host.programOnSearchPath,
    systemFolder:        host.systemFolder,
  };
}

/**
 * The Overseer restarts after a reboot only through the user, the dashboard or this optional item; runtime code never installs it. A
 * platform with no adapter, or a host where the item would never run, is refused before anything is written.
 */
export function writeLoginOverseer(host: SetupHost, report: SetupReport, request: LoginOverseerRequest): number {
  const autostart = autostartFor(host.platform, autostartPrimitivesOf(host));
  if (autostart === null) {
    report.failure('No login item is known for this operating system: start the Overseer yourself after a reboot');
    return 1;
  }
  const unavailableReason = autostart.unavailableReason();
  if (unavailableReason !== null) {
    report.failure(`No ${autostart.mechanism} written: ${unavailableReason}`);
    return 1;
  }
  if (!existsSync(request.repository) || !statSync(request.repository).isDirectory()) {
    report.failure(`${request.repository} is not a folder`);
    return 1;
  }
  const repository = realpathSync(request.repository);
  const location = autostart.locationOf(request.label);
  const registeredRepository = autostart.registeredRepositoryOf(request.label);
  if (registeredRepository !== null && registeredRepository !== repository) {
    report.failure(`${location} already starts the Overseer of another repository; pass --label <label> for ${repository}`);
    return 1;
  }
  const checkout = host.checkoutDirectory;
  const item: LoginItem = {
    label:              request.label,
    repository,
    bunProgram:         physicalPathOf(host.bunProgram),
    isolatingArguments: ToolRuntimeUtil.isolatingArgumentsFor(checkout),
    entryPoint:         join(checkout, 'agent-progress.ts'),
    searchPath:         [bunBinFolderOf(host), ...host.searchPath].join(delimiter),
  };
  if (request.instructOnly) {
    report.notice(`Would write the ${autostart.mechanism} ${location}, running ${autostart.commandOf(item).join(' ')} for ${repository} at login`);
    return 0;
  }
  const written = autostart.write(item);
  if (written.verdict === 'refused') {
    report.failure(`The ${autostart.mechanism} ${location} will not start the Overseer: ${written.reason}`);
    return 1;
  }
  report.done(`Wrote the ${autostart.mechanism} ${location}: the Overseer of ${repository} starts at login`);
  for (const advice of autostart.adviceAfterWriting(item)) report.notice(advice);
  return 0;
}
