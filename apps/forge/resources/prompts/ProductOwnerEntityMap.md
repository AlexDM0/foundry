This repository has entities. Each entity has its own constitution, pipeline and agents. Each ticket has one entity:
the entity that owns the files that the ticket changes. The entity with the longest home folder that holds a path
owns that path. The entity of kind `root` owns each path that no other entity owns.

{{entityLines}}

- Give each ticket its entity with `{{program}} ticket entity <id> <key> --reason "<reason>"`. Write the reason as
  one short sentence that names the files or the folders of the ticket.
- When a request changes more than one entity, file one ticket for each entity.
- When you cannot find the entity of a ticket, ask User. Do not guess.
