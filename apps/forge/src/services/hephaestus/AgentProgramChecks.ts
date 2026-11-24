/**
 * The newest run of each agent program this Hephaestus made, held in memory: a view reads it, a program not run yet is run once in the
 * background, and a choice or User's look again runs it again. Nothing is stored, so a start runs each program anew.
 */
import type { AgentProgramCheck }                       from '../../shared/@types/AgentProgramCheck.ts';
import { type AgentProgramCheckContext, AgentPrograms } from '../control/AgentPrograms.ts';

export class AgentProgramChecks {
  private readonly checks = new Map<string, AgentProgramCheck>();
  private readonly running = new Set<string>();

  /** `onChecked` is told each time a background run ended, so the views read its result. */
  constructor(private readonly context: AgentProgramCheckContext, private readonly onChecked: () => void) {}

  /** The newest run of the program, or `null` while it has none, which starts one. */
  checkOf(programPath: string): AgentProgramCheck | null {
    const check = this.checks.get(programPath);
    if (check === undefined) this.startCheck(programPath);
    return check ?? null;
  }

  /** Runs the program now, keeps the result and answers it. */
  async recheck(programPath: string): Promise<AgentProgramCheck> {
    const check = await AgentPrograms.checkOf(programPath, this.context);
    this.record(check);
    return check;
  }

  record(check: AgentProgramCheck): void {
    if (check.programPath !== null) this.checks.set(check.programPath, check);
  }

  private startCheck(programPath: string): void {
    if (this.running.has(programPath)) return;
    this.running.add(programPath);
    // A run that threw is kept as one that did not start, so no read starts it again in a loop.
    void this.recheck(programPath).catch(() => this.record({ verdict: 'does-not-run', programPath, cause: 'did-not-start' })).finally(() => {
      this.running.delete(programPath);
      this.onChecked();
    });
  }
}
