### Research

Find out how this repository is built, checked and changed. Read the files only. Do not run a script. Do not run a
script to test it.

Read these files when they exist: the README, `CONTRIBUTING.md`, `CLAUDE.md`, `CONSTITUTION.md`, the package and build
files (such as `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` or a `Makefile`), the lint and format
configuration, and the CI configuration.

Record each fact as one finding with `{{program}} pipeline finding`. Put the paths that show the fact in
`sourcePaths`. Use these topics:

- `stack`: a language, a runtime, a package manager or a framework. Put its version in `value`.
- `scripts`: one script that installs, builds, checks, tests or starts the code. Give its `script`: the name, the
  command line that it runs, what it does, and `gateCandidate`. A script that starts a server or watches files is
  `not-a-gate`. When you are not sure, write `unsure`. Put in `needs` what the script needs in addition to the tree,
  such as the network, a database or a secret.
- `conventions`: a rule that the repository writes down, or a rule that its code obeys.
- `continuous-integration`: what the CI runs, and when it runs.
- `note`: an area that has no tests, an existing `CONSTITUTION.md`, or a different fact that a gate or the
  constitution needs.

Record each fact one time. When a finding needs a recheck, read its paths again. Then record the correct fact as a new
finding.

When you recorded the findings, run `{{program}} pipeline ready research`. User reads the findings and corrects them
in the chat. Then User continues to the constitution.
