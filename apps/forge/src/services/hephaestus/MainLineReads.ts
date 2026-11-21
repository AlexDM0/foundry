/**
 * What a state read asks git about the main line for the pipeline facts: the project's tracked instruction texts and `CONSTITUTION.md`, kept
 * by (main tip, path), and `mainMovedByCommits`, kept by (snapshot commit, main tip). A read with the same main tip runs no `git show`.
 * A data-folder file is read from disk on each read.
 */
import type { MainConstitutionReading } from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { InstructionFiles }             from './InstructionFiles.ts';
import { MainMovedCounts }              from './MainMovedCounts.ts';

export class MainLineReads {
  private readonly movedCounts: MainMovedCounts;
  private readTip:              string | null = null;
  private readonly textByPath = new Map<string, string | null>();
  private readonly constitutionByPath = new Map<string, MainConstitutionReading>();

  constructor(private readonly projectDirectory: string) {
    this.movedCounts = new MainMovedCounts(projectDirectory);
  }

  /** The file's text at the main tip; null when the tip holds no such file, or git could not be started, which is not kept. */
  textAt(mainTip: string, path: string): string | null {
    if (InstructionFiles.isDataFolderPath(path)) return InstructionFiles.fileTextOf(this.projectDirectory, mainTip, path);
    this.keepOnlyTip(mainTip);
    if (this.textByPath.has(path)) return this.textByPath.get(path) ?? null;
    const reading = InstructionFiles.fileTextReadingOf(this.projectDirectory, mainTip, path);
    if (reading.verdict === 'unreadable') return null;
    const text = reading.verdict === 'read' ? reading.text : null;
    this.textByPath.set(path, text);
    return text;
  }

  /** The constitution at the project path, `CONSTITUTION.md` when none is named; an unreadable answer is not kept, so the next read asks git again. */
  mainConstitutionAt(mainTip: string, constitutionPath?: string): MainConstitutionReading {
    this.keepOnlyTip(mainTip);
    const pathKey = constitutionPath ?? '';
    const kept = this.constitutionByPath.get(pathKey);
    if (kept !== undefined) return kept;
    const reading = InstructionFiles.mainConstitutionAt(this.projectDirectory, mainTip, constitutionPath);
    if (reading.verdict !== 'unreadable') this.constitutionByPath.set(pathKey, reading);
    return reading;
  }

  mainMovedByCommitsOf(snapshotCommit: string | null, mainTip: string | null): number {
    return this.movedCounts.mainMovedByCommitsOf(snapshotCommit, mainTip);
  }

  private keepOnlyTip(mainTip: string): void {
    if (mainTip === this.readTip) return;
    this.readTip = mainTip;
    this.textByPath.clear();
    this.constitutionByPath.clear();
  }
}
