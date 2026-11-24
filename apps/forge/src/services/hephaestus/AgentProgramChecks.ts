/**
 * The newest run of each agent program this Hephaestus made, held in memory: a view reads it, a program not run yet is run once in the
 * background, and a choice or User's look again runs it again. A run is kept only while the program file stays the file it ran, so a
 * program removed or replaced is run anew. Nothing is stored, so a start runs each program anew.
 */
import { statSync } from 'node:fs';

import type { AgentProgramCheck }                       from '../../shared/@types/AgentProgramCheck.ts';
import { type AgentProgramCheckContext, AgentPrograms } from '../control/AgentPrograms.ts';

/** The file a path names now, as the system tells it apart: `null` when nothing is there. */
export type ProgramFileIdentityOf = (programPath: string) => string | null;

/** Through a link, as a launch runs it, so an update behind the link reads as another file. */
const PROGRAM_FILE_IDENTITY_OF: ProgramFileIdentityOf = (programPath) => {
  try {
    // The modification time is the file system's own mark of a rewrite in place, read as part of the file's identity, never as a clock.
    const stats = statSync(programPath);
    return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}`;
  } catch {
    return null;
  }
};

interface KeptCheck {
  readonly check:    AgentProgramCheck;
  readonly identity: string | null;
}

export class AgentProgramChecks {
  private readonly checks = new Map<string, KeptCheck>();
  private readonly running = new Set<string>();

  /** `onChecked` is told each time a background run ended, so the views read its result. */
  constructor(
    private readonly context: AgentProgramCheckContext,
    private readonly onChecked: () => void,
    private readonly programFileIdentityOf: ProgramFileIdentityOf = PROGRAM_FILE_IDENTITY_OF,
  ) {}

  /** The newest run of the program while its file is the one that ran, else `null`, which starts a run. */
  checkOf(programPath: string): AgentProgramCheck | null {
    const kept = this.checks.get(programPath);
    if (kept !== undefined && kept.identity === this.programFileIdentityOf(programPath)) return kept.check;
    this.startCheck(programPath);
    return null;
  }

  /** Runs the program now, keeps the result and answers it. */
  async recheck(programPath: string): Promise<AgentProgramCheck> {
    const identity = this.programFileIdentityOf(programPath);
    const check = await AgentPrograms.checkOf(programPath, this.context);
    this.keep(check, identity);
    return check;
  }

  record(check: AgentProgramCheck): void {
    if (check.programPath !== null) this.keep(check, this.programFileIdentityOf(check.programPath));
  }

  private keep(check: AgentProgramCheck, identity: string | null): void {
    if (check.programPath !== null) this.checks.set(check.programPath, { check, identity });
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
