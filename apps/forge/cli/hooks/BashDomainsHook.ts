/**
 * `hook bash-domains --allow <domains>`, the network guard design section 4.4 renders for a role with a `network` line: the agent's
 * own permission check may grant a shell command's domains, or a web fetch, outside the ticket's domains, and this denies it. It exits 0 whatever
 * happens and answers deny on any failure, since a guard that errors would let the call through.
 */
import type { AgentToolCall }        from '../../src/lib/agent-launch/AgentToolCall.ts';
import { refusalIsOperationRefusal } from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }             from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }       from '../CommandContext.ts';
import type { ArgumentParser }       from '../arguments/ArgumentParser.ts';

const ALLOW_OPTION_NAME = 'allow';

const USAGE = `${PRODUCT_NAMES.PROGRAM} hook bash-domains --allow <domain>,<domain>…  (the hook input arrives on standard input)`;
const WILDCARD_PREFIX = '*.';

type Verdict = { kind: 'pass' } | { kind: 'deny'; reason: string };

function normalisedDomainOf(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

function domainsOfList(listText: string): string[] {
  return listText.split(/[\s,]+/).map(normalisedDomainOf).filter((domain) => domain.length > 0);
}

/** An entry `*.example.com` admits every subdomain of example.com, never example.com itself; any other entry admits exactly itself. */
function domainIsAllowed(domain: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some((allowed) => allowed === domain
    || (allowed.startsWith(WILDCARD_PREFIX) && !domain.startsWith(WILDCARD_PREFIX) && domain.endsWith(allowed.slice(1))));
}

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const host = normalisedDomainOf(new URL(url).hostname);
    return host.length === 0 ? null : host;
  } catch {
    return null;
  }
}

/** A shell command is checked by the domains it asks for and a web fetch by its host; a call that reaches no network passes. */
function verdictOf(toolCall: AgentToolCall | null, allowedDomains: readonly string[]): Verdict {
  if (toolCall === null) return { kind: 'deny', reason: 'the guard cannot read the call' };
  const allowedText = allowedDomains.length === 0 ? 'no domain' : allowedDomains.join(', ');
  switch (toolCall.kind) {
    case 'shell': {
      if (toolCall.requestedDomains === null) return { kind: 'deny', reason: 'the domains it asks for are not a list of domains' };
      const outside = toolCall.requestedDomains.map(normalisedDomainOf).filter((domain) => !domainIsAllowed(domain, allowedDomains));
      return outside.length === 0 ? { kind: 'pass' } : { kind: 'deny', reason: `it asks for ${outside.join(', ')}, and this ticket's network allows ${allowedText}` };
    }
    case 'web-fetch': {
      const host = hostOf(toolCall.url);
      if (host === null) return { kind: 'deny', reason: 'its url names no host' };
      return domainIsAllowed(host, allowedDomains) ? { kind: 'pass' } : { kind: 'deny', reason: `it fetches ${host}, and this ticket's network allows ${allowedText}` };
    }
    case 'no-reach':
    case 'file-change':
      return { kind: 'pass' };
    case 'unknown':
      return { kind: 'deny', reason: `the guard does not know the tool ${toolCall.toolName}, which may be a shell` };
  }
}

function denialLineOf(context: CommandContext, reason: string): string {
  return context.agentAdapter.toolCallDenialLineOf(`Denied by the ticket's network line: ${reason}.`);
}

/** A pass prints nothing, so the call goes on to the session's own permission rules; it never grants anything. */
export async function guardTheNetworkDomains(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  try {
    commandArguments.rejectUnknownOptions([ALLOW_OPTION_NAME], USAGE);
  } catch (refusal) {
    if (!refusalIsOperationRefusal(refusal)) throw refusal;
    context.standardOutput(denialLineOf(context, 'the guard was given an option it does not know'));
    return;
  }
  let verdict: Verdict;
  try {
    const allowList = commandArguments.option(ALLOW_OPTION_NAME);
    const toolCall = context.agentAdapter.toolCallOf(await context.readStandardInput());
    verdict = verdictOf(toolCall, typeof allowList === 'string' ? domainsOfList(allowList) : []);
  } catch (failure) {
    verdict = { kind: 'deny', reason: `the guard could not read its call (${failure instanceof Error ? failure.message : String(failure)})` };
  }
  if (verdict.kind === 'deny') context.standardOutput(denialLineOf(context, verdict.reason));
}
