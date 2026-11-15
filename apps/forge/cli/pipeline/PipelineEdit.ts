/**
 * `pipeline edit <S> --revision <n> --set <field>=<JSON value>...`: User's edit of the draft pipeline, every field in one move, as a gate
 * and the phase order that runs it. The value is JSON, as `pipeline.json` holds it; `null` removes a gate, prepare step, review or merge
 * train, or writes the default back.
 */
import { PipelineDraftEditUtil }                      from '../../src/lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import type { PipelineFieldEdit }                     from '../../src/shared/@types/ControlCommand.ts';
import type { CommandContext }                        from '../CommandContext.ts';
import { refuseUsage }                                from '../RecordedIncidentMove.ts';
import type { ArgumentParser }                        from '../arguments/ArgumentParser.ts';
import { applySetupCommand, revisionFrom, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                             from './constants/PipelineUsage.ts';

const FIELD_SEPARATOR = '=';

function fieldEditOf(written: string, usage: string): PipelineFieldEdit {
  const separatorIndex = written.indexOf(FIELD_SEPARATOR);
  const field          = separatorIndex === -1 ? written : written.slice(0, separatorIndex);
  if (!PipelineDraftEditUtil.fieldIsWellFormed(field)) {
    refuseUsage(`"${field}" is not a draft field: gate:<name>, phase-order:<phase>, prepare:<name>, prepare-order, role:<role>, review, `
      + 'airlock, approval:<approval> or constitution.', usage);
  }
  if (separatorIndex === -1) refuseUsage(`Give ${field} a value after =, as JSON: null removes it.`, usage);
  const valueText = written.slice(separatorIndex + 1);
  try {
    return { field, value: JSON.parse(valueText) as unknown };
  } catch {
    return refuseUsage(`The value of ${field} is not JSON: ${valueText}`, usage);
  }
}

export async function editPipelineDraft(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.edit;
  commandArguments.rejectUnknownOptions(['revision', 'set', 'json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const setupId = setupIdOf(commandArguments.positionals()[1], usage);
  const edits   = commandArguments.optionValues('set').map((written) => fieldEditOf(written, usage));
  if (edits.length === 0) refuseUsage('Set at least one field, as --set \'review=null\'.', usage);
  await applySetupCommand(commandArguments, context, {
    kind: 'pipeline-draft-edit', setupId, draftRevision: revisionFrom(commandArguments, usage), edits
  });
}
