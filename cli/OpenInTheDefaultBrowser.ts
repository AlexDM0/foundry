import type { CommandContext } from './CommandContext.ts';
import { openerFor }           from './OpenerFor.ts';

export function openInTheDefaultBrowser(context: CommandContext, url: string): void {
  const opener = openerFor(context.platform, () => context.platformPorts.dataFolders.systemFolder());
  try {
    // Detached with its streams dropped: a browser launched cold would otherwise inherit the pipes and keep this process alive.
    const spawned = Bun.spawn([...opener.argv, url], {
      stdin:       'ignore',
      stdout:      'ignore',
      stderr:      'ignore',
      windowsHide: true,
      detached:    opener.detach,
    });
    if (opener.detach) spawned.unref();
  } catch (problem) {
    // Reported, not thrown: the caller still prints the URL, so a machine with no desktop is not a failed command.
    context.standardError(`\`${opener.argv.join(' ')}\` could not be run (${problem instanceof Error ? problem.message : String(problem)}); open the URL below yourself.`);
  }
}
