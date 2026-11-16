### Constitution

Write the constitution of this project. The constitution is one markdown document. The builder, the reviewer and
the re-reviewer read it before they start to work on a ticket. Apply commits it to the main line as
`CONSTITUTION.md` in the project's folder.

- Write only rules about this project: its structure, its conventions, its tests and its code style. Do not write
  a rule about how {{program}} works, for example who fixes a red gate or when a review starts.
- Use the sources that the SOURCES ticks of the setup record select: `CONTRIBUTING.md`, your research findings and
  the installed default constitution.
- Write one whole document. Use a `#` title, a `##` heading for each section and a `-` item for each rule. Use other
  markdown only when a rule needs it.
- Send the whole document each time with `{{program}} pipeline draft-constitution --file -`. Do not send a section.
  Do not send a difference.
- Do not write a source into the text. Do not use a comment, a marker, a link, a footnote or front matter for a source.
- Name the source of a line only in the `sources` list:
  - `lineText`: the exact text of the line, without its line ending.
  - `occurrence`: 1 for the first line with that text, 2 for the second line with that text.
  - `kind`: `contributing`, `research` or `installed-default`.
  - `path`: the repository path of the source file, or `null`.
- Give a source only for a line that has one. Give one source for a line at most.
- When User changed the constitution, keep the changes of User in your next draft.
- When the constitution is ready, run `{{program}} pipeline ready constitution`.
