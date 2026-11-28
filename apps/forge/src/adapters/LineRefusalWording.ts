/** The words of a refused line or launch, from its code and the values it names, as the sandbox refusal, a step's output and the log keep them. */
import type { ShellRunRefusal }      from '../lib/shell-line/ShellLine.ts';
import type { LineRefusal }          from '../shared/@types/LineRefusal.ts';
import { ConfinementRefusalWording } from './ConfinementRefusalWording.ts';

function shellRunRefusalSentenceOf(refusal: ShellRunRefusal, directory: string): string {
  switch (refusal) {
    case 'network-share-folder':    return `cmd.exe runs no line in the network share folder ${directory}; move the repository to a drive letter`;
    case 'no-absolute-interpreter': return 'no absolute cmd.exe path is known: ComSpec and SystemRoot are both unset or relative';
    case 'no-shell-grammar':        return 'this platform has no shell to run a line in';
  }
}

function sentenceOf(refusal: LineRefusal): string {
  switch (refusal.code) {
    case 'shell-run-refused':   return shellRunRefusalSentenceOf(refusal.refusal, refusal.directory);
    case 'denied-root-unmade':  return `the denied folder ${refusal.deniedRoot} could not be made, so it would get no read-only mount`;
    case 'confinement-refused': return ConfinementRefusalWording.sentenceOf(refusal.confinementRefusal);
  }
}

export const LineRefusalWording = Object.freeze({ shellRunRefusalSentenceOf, sentenceOf });
