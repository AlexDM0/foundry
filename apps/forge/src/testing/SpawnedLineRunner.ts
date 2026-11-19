/**
 * A `LineRunner` for a real-system spec of the gate runs, which needs a real line but no Talos: it spawns the line as Talos does, with its
 * whole environment and working directory and the spawn options of a supervised child, hands on each line of its output, stops its tree at
 * its owner's stop, and answers the end as Talos's record would read. It keeps no time bound: that is Talos's own, held by its specs.
 */
import type { LineRunEnd, LineRunner } from '../services/lifecycle/GateRun.ts';
import { nativePlatformPorts }         from './NativePlatformPorts.ts';

const LINE_FEED = '\n';

async function linesOf(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split(LINE_FEED);
    pending = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  }
  pending += decoder.decode();
  if (pending !== '') onLine(pending);
}

/** Stops the line's whole tree through the process port, as Talos stops a line. */
function stopTreeOf(processId: number): void {
  const { processSupervision } = nativePlatformPorts();
  const leader = processSupervision.identityOf(processId);
  if (leader !== null) processSupervision.stopTree(leader, 'force', processSupervision.treeMembersOf(leader) ?? undefined);
}

export const spawnedLineRunner: LineRunner = async (request) => {
  if (request.stopSignal?.aborted === true) return {
    exitCode: null, signalCode: null, endReason: 'signalled', output: '', runMilliseconds: 0
  };
  const startedAt = performance.now();
  const lineProcess = Bun.spawn({
    cmd:                      [...request.argv],
    cwd:                      request.directory,
    env:                      { ...request.environment },
    stdin:                    'ignore',
    stdout:                   'pipe',
    stderr:                   'pipe',
    windowsVerbatimArguments: request.verbatimArguments,
    // As Talos spawns a child: in a process group of its own.
    ...nativePlatformPorts().processSupervision.spawnOptionsFor('supervised-child'),
  });
  const stop = (): void => {
    stopTreeOf(lineProcess.pid);
  };
  request.stopSignal?.addEventListener('abort', stop, { once: true });
  const output: string[] = [];
  const takeLine = (line: string): void => {
    output.push(line);
    request.onOutputLine?.(line);
  };
  const [exitCode] = await Promise.all([lineProcess.exited, linesOf(lineProcess.stdout, takeLine), linesOf(lineProcess.stderr, takeLine)]);
  request.stopSignal?.removeEventListener('abort', stop);
  const signalCode = lineProcess.signalCode ?? null;
  const end: LineRunEnd = {
    exitCode:        signalCode === null ? exitCode : null,
    signalCode,
    endReason:       signalCode === null ? 'exited' : 'signalled',
    output:          output.map((line) => `${line}${LINE_FEED}`).join(''),
    runMilliseconds: Math.round(performance.now() - startedAt),
  };
  return end;
};
