/** What the `document` verbs share: each is relayed under its document agent's job and refused anywhere else. */
import type { DocumentAgentHatchCommand } from '../../src/shared/@types/ControlCommand.ts';
import type { CommandContext }            from '../CommandContext.ts';
import { hatchWhenUnderJob }              from '../HatchUnderJob.ts';
import { refuseUsage }                    from '../RecordedIncidentMove.ts';

/** Never returns: the relay ends the verb, and outside a job the verb is refused. */
export async function relayDocumentCommand(context: CommandContext, command: DocumentAgentHatchCommand, usage: string): Promise<never> {
  if (context.job === undefined) refuseUsage('Only a spec or plan agent runs this verb, in the session of its own job.', usage);
  await hatchWhenUnderJob(context, command);
  throw new Error('A relayed document verb returned from its relay.');
}
