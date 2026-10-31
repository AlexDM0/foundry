// P8: a user line written during a turn's Bash call folds into that turn: how many results came, what the transcript's
// queue operations say, and whether a second turn followed in the settle time.
import { resultCountOf, startSession, summaryOf, toolCallsOf, transcriptLinesOf, waitingCommandOf } from './support/claude-session.js';
import { probe, settleMilliseconds } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const NO_SECOND_TURN_SECONDS = 90;
const TOOL_SECONDS = 20;

await probe({
  unknown: 'claude-p08-mid-turn-line',
  needsClaudeProgram: true,
  observe: async () => {
    const cwd = scratchFolder();
    const session = startSession({ cwd, extraArguments: ['--permission-mode', 'auto'] });
    session.writeUserLine(`Run this exact command in the foreground with the Bash tool, once: ${waitingCommandOf(TOOL_SECONDS)}. Then reply with the word FIRST.`);
    await session.waitUntil((lines) => toolCallsOf(lines).some((call) => call.name === 'Bash') || resultCountOf(lines) > 0);
    session.writeUserLine('Also reply with the word SECOND.');
    await session.waitUntil((lines) => resultCountOf(lines) > 0);
    const resultsAtFirstResult = resultCountOf(session.lines);
    await Bun.sleep(settleMilliseconds(NO_SECOND_TURN_SECONDS));
    session.closeInput();
    const ending = await session.finish();
    const summary = summaryOf(session.lines);
    const queueOperations = transcriptLinesOf(cwd, summary.init?.session_id).filter((line) => line.includes('queue-operation'));
    return { resultsAtFirstResult, resultsAtEnd: resultCountOf(session.lines), queueOperations, ...ending, ...summary };
  },
});
