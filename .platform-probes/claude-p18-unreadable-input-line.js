// P18: what a session does with a stdin line that is not JSON, written before its first user line: what it prints, and
// how it ends.
import { recordWire, startSession } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const UNREADABLE_LINE = 'this line is not JSON';

await probe({
  unknown: 'claude-p18-unreadable-input-line',
  needsClaudeProgram: true,
  observe: async () => {
    const session = startSession({ cwd: scratchFolder() });
    session.writeLine(UNREADABLE_LINE);
    await session.waitUntil(() => false, 30_000);
    session.closeInput();
    const ending = await session.finish();
    recordWire('unreadable-input-line', session.wire, ending);
    return { ...ending, stdoutLines: session.wire.filter((entry) => entry.from === 'stdout').map((entry) => entry.line) };
  },
});
