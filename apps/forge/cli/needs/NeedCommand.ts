/**
 * `need declare <J> "<title>" --entity <key> --body-file <path>` records a build job's need for another entity: the ticket that entity
 * builds first, with a numbered Acceptance that holds the intended use and a Brief. Hephaestus files it. Under the declaring job it names
 * no job: Hephaestus stamps it.
 */
import { requireWorkspace }       from '../../src/services/tracker/Workspace.ts';
import type { ControlCommandOf }  from '../../src/shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }          from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }     from '../ApplyCommandOfVerb.ts';
import type { CommandContext }    from '../CommandContext.ts';
import type { CommandHandler }    from '../CommandHandler.ts';
import { hatchWhenUnderJob }      from '../HatchUnderJob.ts';
import { jobIdOf, refuseUsage }   from '../RecordedIncidentMove.ts';
import { suppliedMarkdownBodyOf } from '../SuppliedMarkdownBody.ts';
import type { ArgumentParser }    from '../arguments/ArgumentParser.ts';
import { OutputUtil }             from '../utils/OutputUtil.ts';

const DECLARE_USAGE = `${PRODUCT_NAMES.PROGRAM} need declare [<J>] "<title>" --entity <key> --body <text> | --body-file <path> [--json]`;

const DECLARE_OPTION_NAMES = ['entity', 'body', 'body-file', 'json'];

interface WrittenNeed {
  entity:   string;
  title:    string;
  bodyText: string;
}

/** The title is the last positional, after the job User names; the body is read before the lock, as `ticket add` reads it. */
async function writtenNeedOf(commandArguments: ArgumentParser, context: CommandContext, titleIndex: number): Promise<WrittenNeed> {
  commandArguments.rejectExtraPositionals(titleIndex + 1, DECLARE_USAGE);
  const title = commandArguments.positionals()[titleIndex];
  if (title === undefined || title.trim() === '') refuseUsage('Write the title of the need.', DECLARE_USAGE);
  const entity = commandArguments.option('entity');
  if (entity === undefined || entity.trim() === '') refuseUsage('Name the entity that the need is for, with --entity.', DECLARE_USAGE);
  if (commandArguments.option('body') !== undefined && commandArguments.option('body-file') !== undefined) {
    refuseUsage('Give --body or --body-file, not both.', DECLARE_USAGE);
  }
  requireWorkspace(context.currentDirectory);
  const bodyText = await suppliedMarkdownBodyOf(commandArguments, context);
  if (bodyText === undefined) refuseUsage('Give the body of the need, with --body or --body-file.', DECLARE_USAGE);
  return { entity, title, bodyText };
}

async function declareNeed(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  if (context.job !== undefined) {
    await hatchWhenUnderJob(context, { kind: 'need-declare', ...await writtenNeedOf(commandArguments, context, 1) });
    return;
  }
  const jobId = jobIdOf(commandArguments.positionals()[1], DECLARE_USAGE);
  const command: ControlCommandOf<'need-declare'> = { kind: 'need-declare', jobId, ...await writtenNeedOf(commandArguments, context, 2) };
  const { need, changed } = (await applyCommandOfVerb(commandArguments, context, command)).result;
  const sentence = changed
    ? `Job ${jobId} declared the need "${need.title}" for ${need.entity}; Hephaestus files it as a ticket of ${need.entity}.`
    : `Job ${jobId} already declared the need "${need.title}" for ${need.entity} with this body. Nothing to do.`;
  OutputUtil.printEntity(commandArguments, context, { need, changed }, sentence);
}

export const needCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(DECLARE_OPTION_NAMES, DECLARE_USAGE);
  const subcommand = commandArguments.positionals()[0];
  if (subcommand !== 'declare') refuseUsage('Name the subcommand: need declare.', DECLARE_USAGE);
  await declareNeed(commandArguments, context);
};

export const NEED_SUBCOMMAND_NAMES: readonly string[] = Object.freeze(['declare']);
