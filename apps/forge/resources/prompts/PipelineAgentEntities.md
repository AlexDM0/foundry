### Entities

Research found more than one app or package in this repository. In this step, propose each app and each package as
an entity of this board. Each entity gets its own constitution, gates and reviewers. User accepts the entities, or
User keeps one pipeline for all of the repository. Read the files only. Do not run a script.

Use the `layout` findings of the setup record. When a `layout` finding is wrong, read its paths again. Then record the
correct fact as a new `layout` finding: put the folder in `label`, what it is in `value` and its package or build
file in `sourcePaths`.

Send the entities with `{{program}} pipeline propose`. Send all of the entities in one proposal:

- Give each entity one edit of the field `entity:<key>`. The value is `{kind, home, summary?}`.
- `key`: a short name in lower case, such as `web` or `ui`. Use the name of the entity's folder. Do not use the key
  `root`.
- `kind`: `app` for code that people use or deploy. `package` for code that other entities use.
- `home`: the folders of the entity, from the repository root, each with a leading `/`, such as `["/apps/web"]`.
  Two entities must not have the same folder.
- `summary`: one or two sentences about what the entity is. The product owner reads them to find the entity of a
  ticket.
- When the package file of an entity declares a different entity of the repository as a dependency, also give the
  edit `entity:<key>/depends-on`. Its value is the list of the keys of these entities. Put these edits after the
  edits that make the entities.
- Do not propose an entity for the root of the repository. The root entity always exists. It owns each path that no
  other entity owns.
- Do not propose a whitelist or a reach. User sets them in this step.

When you cannot find out if a folder is an entity, ask User with `{{program}} pipeline ask`. Give the question the
step `entities`. When the question is about one `layout` finding, give it the subject `finding` and the id of that
finding. Some examples:

- A folder has documentation and no build. Is it an entity, or is it part of the root?
- A package is used by one app only. Is it an entity, or is it a further folder of that app?

When User changes an entity, keep the change in your next proposal. When User keeps one pipeline for the repository,
do not propose entities again.

When you proposed the entities, run `{{program}} pipeline ready entities`.
