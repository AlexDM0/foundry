import {
  existsSync,
  realpathSync,
  renameSync,
  rmSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { PRODUCT_NAMES }      from '../../src/shared/constants/ProductNames.ts';
import { type SetupHost }     from './SetupHost.ts';
import { type SetupPlatform } from './SetupPlatform.ts';
import { type SetupReport }   from './SetupReport.ts';

interface InstallRun {
  readonly host:         SetupHost;
  readonly platform:     SetupPlatform;
  readonly report:       SetupReport;
  readonly instructOnly: boolean;
}

/** The folder resolved physically and the file name kept, as a shell's `cd -P` would: a link to Bun's own binary stays the link. */
export function physicalPathOf(programPath: string): string {
  return join(realpathSync(dirname(programPath)), basename(programPath));
}

export function bunBinFolderOf(host: SetupHost): string {
  return join(host.bunInstallFolder, 'bin');
}

/**
 * The installed command is a launcher compiled with Bun's autoload of the working directory's bunfig and .env off, and it starts
 * agent-progress.ts with that autoload off too. It replaces what `bun link` made through a rename: compiling onto a link would overwrite
 * agent-progress.ts.
 */
function installLauncher({ host, platform, report }: InstallRun): void {
  const programName = PRODUCT_NAMES.PROGRAM;
  const binFolder = bunBinFolderOf(host);
  const launcherPath = join(binFolder, platform.executableFileNameOf(programName));
  const partialPath = join(binFolder, platform.executableFileNameOf(`${programName}.partial`));
  const compiled = existsSync(binFolder) && host.run([
    host.bunProgram,
    'build',
    '--compile',
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig',
    '--define',
    `LAUNCHER_BUN_PATH=${JSON.stringify(physicalPathOf(host.bunProgram))}`,
    '--define',
    `LAUNCHER_TOOL_DIRECTORY=${JSON.stringify(host.checkoutDirectory)}`,
    join(host.checkoutDirectory, 'launcher.ts'),
    '--outfile',
    partialPath,
  ], host.checkoutDirectory).exitCode === 0;
  if (compiled) {
    renameSync(partialPath, launcherPath);
    report.done(`${programName} is the launcher compiled at ${launcherPath}; it ignores a repository's bunfig.toml and .env`);
    return;
  }
  rmSync(partialPath, { force: true });
  report.failure(`the launcher did not compile; ${programName} still loads the working directory's bunfig.toml and .env`);
}

function reportSearchPath(run: InstallRun): void {
  const {
    host, report, platform, instructOnly
  } = run;
  const programName = PRODUCT_NAMES.PROGRAM;
  const programPath = host.programOnSearchPath(programName);
  if (programPath !== null) {
    report.done(`${programName} is on your PATH (${programPath})`);
    return;
  }
  const binFolder = bunBinFolderOf(host);
  if (host.searchPath.includes(binFolder)) {
    const reason = instructOnly ? 'setup without --instruct-only puts it there' : 'the link above did not put it there';
    report.notice(`${programName} is not in ${binFolder}, which is on your PATH: ${reason}`);
    return;
  }
  report.notice(`${programName} linked, but ${binFolder} is not on your PATH in this shell`);
  platform.offerSearchPathEntry({
    host, report, binFolder, instructOnly
  });
}

/**
 * Runs on every setup, not only the first: a checkout brought up to date may need a dependency the previous one did not. Skipped under
 * --instruct-only: `bun link` repoints the machine-wide command at this checkout, and a dry run from a worktree would leave it pointing at
 * a folder a release later removes.
 */
export function installAndLink(run: InstallRun): void {
  const { host, report, instructOnly } = run;
  const checkout = host.checkoutDirectory;
  if (instructOnly) {
    report.notice(`Would run bun install in ${checkout}`);
    report.notice(`Would run bun link in ${checkout}`);
    report.notice(`Would compile ${join(checkout, 'launcher.ts')} as the installed command`);
  } else {
    if (host.run([host.bunProgram, 'install'], checkout).exitCode === 0) {
      report.done(`dependencies installed (bun install in ${checkout})`);
    } else {
      report.failure(`bun install failed — run it yourself in ${checkout}; ${PRODUCT_NAMES.PROGRAM} cannot render its page without marked`);
    }
    if (host.run([host.bunProgram, 'link'], checkout).exitCode !== 0) {
      report.notice(`bun link failed — you can still run: bun "${join(checkout, 'agent-progress.ts')}" <command>`);
    }
    installLauncher(run);
  }
  reportSearchPath(run);
}
