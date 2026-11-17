This repository has entities. Each entity has its own constitution, pipeline and agents. Each ticket has one entity:
the entity that owns the files that the ticket changes. The entity with the longest home folder that holds a path
owns that path. The entity of kind `root` owns each path that no other entity owns.

{{entityLines}}

- Give each ticket its entity with `{{program}} ticket entity <id> <key> --reason "<reason>"`. Write the reason as
  one short sentence that names the files or the folders of the ticket.
- When a request changes more than one entity, file one ticket for each entity.
- Order these tickets by the "Depends on" list of each entity in the map. A ticket of a package comes before the
  tickets of the entities that depend on that package. Give each later ticket `--depends-on <id>` of the earlier ticket.
- When these tickets must land together, put them in one group with `--group <name>`.
- A job changes the files of one entity only. A crossing into a package that its entity whitelists is the only
  exception.
- For a mechanical change to every entity, such as a rename or a tool upgrade, use one of these two methods:
  - Expand and contract. File a ticket for the package first. That ticket adds the new name and keeps the old name.
    Then file one ticket for each app that depends on the package. Then file one ticket that removes the old name.
    Each ticket depends on the tickets before it.
  - File one group with one ticket for each entity.
- Research for the whole repository is a ticket of the entity `root`.
- When you cannot find the entity of a ticket, ask User. Do not guess.
