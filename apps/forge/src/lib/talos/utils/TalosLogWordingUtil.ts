/**
 * The words Talos writes in its own log for what its ports refused, from their causes and the values they name; a port words nothing, and
 * Talos is the one program that reads them.
 */
import type { ProcessStopRefusal } from '../../process-identity/ProcessIdentity.ts';
import type { EndpointRefusal }    from '../LocalEndpoint.ts';

function processStopRefusalOf(refusal: ProcessStopRefusal): string {
  switch (refusal.cause) {
    case 'group-not-signalled':      return `the process group ${refusal.processGroupId} could not be signalled: ${refusal.systemError}`;
    case 'group-members-unreadable': return `the members of process group ${refusal.processGroupId} could not be read`;
    case 'process-not-signalled':    return `the process ${refusal.processId} could not be signalled: ${refusal.systemError}`;
    case 'no-system-root':           return 'SystemRoot is not an absolute folder, so taskkill.exe cannot be run by absolute path';
    case 'processes-not-ended':      return `the processes ${refusal.processIds.join(', ')} could not be ended`;
    case 'tree-unreadable':          return `the process tree of ${refusal.leaderProcessId} could not be read`;
    case 'tree-starts-unreadable':
      return `the start of the listed processes ${refusal.processIds.join(', ')} in the tree of ${refusal.leaderProcessId} could not be read`;
    case 'no-outside-ask':           return `the process ${refusal.processId} cannot be asked to stop from outside on Windows`;
    case 'process-not-ended':        return `the process ${refusal.processId} could not be ended`;
    case 'no-adapter':               return `no process supervision exists for the platform ${refusal.platformName}`;
  }
}

function endpointRefusalOf(refusal: EndpointRefusal): string {
  switch (refusal.cause) {
    case 'system-error':       return refusal.systemError;
    case 'folder-not-private': return `${refusal.restrictionCause}: ${refusal.path}`;
    case 'no-adapter':         return `no local endpoint exists for the platform ${refusal.platformName}`;
  }
}

export const TalosLogWordingUtil = Object.freeze({
  processStopRefusalOf,
  endpointRefusalOf,
});
