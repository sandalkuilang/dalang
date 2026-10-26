---
name: sapu
description: Shortcut for /sapu:sapu from the sapu plugin, so the owner can type /sapu. Used only when the user types /sapu.
disable-model-invocation: true
---

Invoke the Skill tool with `skill: "sapu:sapu"` and the user's arguments unchanged: $ARGUMENTS

If the Skill tool has no `sapu:sapu`, the sapu plugin is not enabled in this repo. Tell the user to run `claude plugin install sapu@sapu --scope project` from the main checkout of this repo, and stop.
