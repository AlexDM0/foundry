// What git prints for its directories, beside the path Bun knows: separators and drive form are the question.
import { probe } from './support/probe.js';
import { createLinkedRepository, git } from './support/scratch.js';

const gitPathsIn = async (cwd) => ({
  cwd,
  absoluteGitDir: (await git(cwd, 'rev-parse', '--absolute-git-dir')).stdout,
  gitCommonDir: (await git(cwd, 'rev-parse', '--git-common-dir')).stdout,
  showToplevel: (await git(cwd, 'rev-parse', '--show-toplevel')).stdout,
});

await probe({
  unknown: 'absolute-git-dir',
  observe: async () => {
    const { repository, worktree } = await createLinkedRepository();
    return { mainCheckout: await gitPathsIn(repository), linkedWorktree: await gitPathsIn(worktree) };
  },
});
