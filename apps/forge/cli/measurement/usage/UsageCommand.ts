/**
 * What every subagent of this project cost, read by the agent port from the transcripts of sessions started in the project's folder, which is the
 * repository root only for a tracker there. Read-only; no transcripts is one sentence at exit 0, not a refusal.
 */
import { LocalTimeUtil }                 from '../../../src/lib/local-time/LocalTimeUtil.ts';
import { requireWorkspace }              from '../../../src/services/tracker/Workspace.ts';
import { LIMITS }                        from '../../../src/shared/constants/Limits.ts';
import { PRODUCT_NAMES }                 from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }           from '../../CommandContext.ts';
import type { CommandHandler }           from '../../CommandHandler.ts';
import type { ArgumentParser }           from '../../arguments/ArgumentParser.ts';
import { OptionValueUtil }               from '../../utils/OptionValueUtil.ts';
import { OutputUtil }                    from '../../utils/OutputUtil.ts';
import { agentUsagesOf, oldestFirst }    from './UsageAgents.ts';
import { agentRowLinesOf, cohortLineOf } from './UsageText.ts';
import type { CohortSummary }            from './utils/UsageCohortUtil.ts';
import { UsageCohortUtil }               from './utils/UsageCohortUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} usage [--since <when>] [--transcripts <folder>] [--json]`;

const KNOWN_OPTION_NAMES = ['since', 'transcripts', 'json'];

/** Long enough to tell two briefs apart on one terminal row and short enough that the row still fits beside the figures. */
const BRIEF_EXCERPT_CHARACTERS = 80;

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
  const { transcriptFolder, usages } = context.agentAdapter.subagentUsagesOf({
    projectRoot:                     workspace.rootDirectory,
    homeDirectory:                   context.homeDirectory,
    transcriptFolder:                commandArguments.option('transcripts') ?? null,
    oversizedContextThresholdTokens: LIMITS.OVERSIZED_CONTEXT_THRESHOLD_TOKENS,
    briefExcerptCharacters:          BRIEF_EXCERPT_CHARACTERS,
    onUnreadableTranscript:          (transcriptPath) => {
      context.standardError(`The transcript at ${transcriptPath} could not be read, so that agent is not in these figures.`);
    },
  });
  const rows   = oldestFirst(usages);
  const agents = agentUsagesOf(rows);

  const split = since === undefined ? undefined : UsageCohortUtil.cohortSplitAt(rows, since);
  const cohorts: UsageCohorts = split === undefined
    ? { all: UsageCohortUtil.cohortSummaryOf(rows) }
    : {
      all:    UsageCohortUtil.cohortSummaryOf(rows),
      before: UsageCohortUtil.cohortSummaryOf(split.before),
      after:  UsageCohortUtil.cohortSummaryOf(split.after),
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
