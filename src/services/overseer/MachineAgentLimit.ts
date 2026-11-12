/**
 * The machine-wide agent limit: one number for every board of this user on this machine, never above the CPUs the runtime reports. An absent,
 * malformed or newer file reads as the ceiling, and a stored value above it reads as the ceiling.
 */
import { availableParallelism } from 'node:os';

import { MachineLimitsFile } from '../../adapters/machine-limits/MachineLimitsFile.ts';
import { OperationRefusal }  from '../../shared/OperationRefusal.ts';

export interface MachineAgentLimitReading {
  /** The limit every Overseer keeps: the stored one, capped at the ceiling. */
  limit:       number;
  ceiling:     number;
  /** The stored value as written, or null when no readable file holds one. */
  storedLimit: number | null;
}

export type MachineAgentLimitSet = 'done' | 'nothing-to-do';

function cpuCeiling(): number {
  return availableParallelism();
}

function readingIn(monitorFolder: string, ceiling: number): MachineAgentLimitReading {
  const stored = MachineLimitsFile.read(monitorFolder);
  const storedLimit = stored.verdict === 'read' ? stored.limits.agentLimit : null;
  return { limit: Math.min(storedLimit ?? ceiling, ceiling), ceiling, storedLimit };
}

/** Refused above the ceiling, below 1 or over a newer file, with nothing written. Lowering stops nothing: jobs in flight finish. */
function setIn(monitorFolder: string, limit: number, ceiling: number): MachineAgentLimitSet {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new OperationRefusal('refused', { kind: 'machine-agent-limit-not-whole', limit });
  if (limit > ceiling) throw new OperationRefusal('refused', { kind: 'machine-agent-limit-above-cpus', limit, ceiling });
  const stored = MachineLimitsFile.read(monitorFolder);
  if (stored.verdict === 'newer-version') {
    throw new OperationRefusal('refused', { kind: 'machine-limits-newer-version', filePath: MachineLimitsFile.pathIn(monitorFolder), version: stored.version });
  }
  if (stored.verdict === 'read' && stored.limits.agentLimit === limit) return 'nothing-to-do';
  MachineLimitsFile.write(monitorFolder, { agentLimit: limit });
  return 'done';
}

export const MachineAgentLimit = Object.freeze({ cpuCeiling, readingIn, setIn });
