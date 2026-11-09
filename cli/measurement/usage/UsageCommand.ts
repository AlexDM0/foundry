/**
 * What every subagent of this repository cost, read from the harness's transcripts; `cli/measurement/hook/HookCommand.ts` records one agent as it
 * stops, this compares them all. Read-only, and finding no transcripts is one sentence at exit 0, not a refusal.
 */
import { listSubagentTranscripts, transcriptFolderFor } from '../../../src/lib/claude-code/ClaudeTranscripts.ts';
import type { CohortSummary }                           from '../../../src/lib/claude-code/utils/TranscriptCohortUtil.ts';
import { TranscriptCohortUtil }                         from '../../../src/lib/claude-code/utils/TranscriptCohortUtil.ts';
import { LocalTimeUtil }                                from '../../../src/lib/local-time/LocalTimeUtil.ts';
import { requireWorkspace }                             from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                          from '../../CommandContext.ts';
import type { CommandHandler }                          from '../../CommandHandler.ts';
import type { ArgumentParser }                          from '../../arguments/ArgumentParser.ts';
import { OptionValueUtil }                              from '../../utils/OptionValueUtil.ts';
import { OutputUtil }                                   from '../../utils/OutputUtil.ts';
import { readAgents }                                   from './UsageAgents.ts';
import { agentRowLinesOf, cohortLineOf }                from './UsageText.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} usage [--since <when>] [--transcripts <folder>] [--json]`;

const KNOWN_OPTION_NAMES = ['since', 'transcripts', 'json'];

/** `before` and `after` are absent rather than empty without `--since`, so a reader of the document can tell "not asked for" from "nothing fell there". */
interface UsageCohorts {
  all:     CohortSummary;
  before?: CohortSummary;
  after?:  CohortSummary;
}

function sinceDateFrom(commandArguments: ArgumentParser, context: CommandContext): Date | undefined {
  return OptionValueUtil.timeOptionFrom(commandArguments, 'since', context.now());
}

export const usageCommand: CommandHandler = (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const workspace        = requireWorkspace(context.currentDirectory);
  const since            = sinceDateFrom(commandArguments, context);
  const transcriptFolder = commandArguments.option('transcripts') ?? transcriptFolderFor(workspace.rootDirectory, context.claudeConfigFolder);
  const agents           = readAgents(listSubagentTranscripts(transcriptFolder), context);

  const split = since === undefined ? undefined : TranscriptCohortUtil.cohortSplitAt(agents, since);
  const cohorts: UsageCohorts = split === undefined
    ? { all: TranscriptCohortUtil.cohortSummaryOf(agents) }
    : {
      all:    TranscriptCohortUtil.cohortSummaryOf(agents),
      before: TranscriptCohortUtil.cohortSummaryOf(split.before),
      after:  TranscriptCohortUtil.cohortSummaryOf(split.after),
    };
  const document = { transcriptFolder, agents, cohorts };

  if (agents.length === 0) {
    OutputUtil.printEntity(commandArguments, context, document, `No subagent transcripts were found in ${transcriptFolder}, so there is nothing to report yet.`);
    return Promise.resolve();
  }

  const lines = agentRowLinesOf(agents);
  lines.push('');
  lines.push(cohortLineOf('All', cohorts.all));
  if (since !== undefined && cohorts.before !== undefined && cohorts.after !== undefined) {
    const boundary = LocalTimeUtil.formatLocalIso(since);
    lines.push(cohortLineOf(`Before ${boundary}`, cohorts.before));
    lines.push(cohortLineOf(`Since ${boundary}`, cohorts.after));
  }

  OutputUtil.printEntity(commandArguments, context, document, lines.join('\n'));
  return Promise.resolve();
};
