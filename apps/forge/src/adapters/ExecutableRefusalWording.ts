/** The words of a program the executable resolver refused, from its cause and the name or path it names. */
import type { ExecutableRefusal } from '../lib/executable-resolver/ExecutableResolver.ts';

function sentenceOf(refusal: ExecutableRefusal): string {
  switch (refusal.cause) {
    case 'not-a-program-name':     return `${refusal.name} is a path, not a program name`;
    case 'not-on-search-path':     return `${refusal.name} is not on the search path`;
    case 'relative-search-folder': return `${refusal.name} was found relative to the working directory`;
    case 'relative-path':          return `${refusal.path} is not an absolute path`;
    case 'inside-forbidden-root':  return `${refusal.path} sits inside ${refusal.forbiddenRoot}`;
    case 'batch-target':           return `${refusal.path} is a batch file, which takes no quoted or multi-line argument`;
    case 'not-there':              return `${refusal.path} is not there`;
    case 'not-executable':         return `${refusal.path} is not a program this user may run`;
    case 'no-adapter':             return `no executable resolver exists for the platform ${refusal.platformName}`;
  }
}

export const ExecutableRefusalWording = Object.freeze({ sentenceOf });
