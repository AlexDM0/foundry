import type { CommandContext } from './CommandContext.ts';
import { openerFor }           from './OpenerFor.ts';

export function openInTheDefaultBrowser(context: CommandContext, pageFilePath: string): void {
  const opener = openerFor(context.platform);
  try {
    // Detached with its streams dropped: a browser launched cold would otherwise inherit the pipes and keep this process alive.
    const spawned = Bun.spawn([...opener.argv, pageFilePath], {
      stdin:  'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    if (opener.detach) spawned.unref();
  } catch (problem) {
    // Reported, not thrown: the caller still prints the path, so a machine with no desktop is not a failed command.
    context.standardError(`\`${opener.argv.join(' ')}\` could not be run (${problem instanceof Error ? problem.message : String(problem)}); open the path below yourself.`);
  }
}
