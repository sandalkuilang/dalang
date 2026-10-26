---
name: forge
description: Shortcut for /sapu:forge from the sapu plugin, so the owner can type /forge. Used only when the user types /forge.
disable-model-invocation: true
---

Invoke the Skill tool with `skill: "sapu:forge"` and the user's arguments unchanged: $ARGUMENTS

If the Skill tool has no `sapu:forge`, the sapu plugin is not enabled in this repo. Tell the user to run `claude plugin install sapu@sapu --scope project` from the main checkout of this repo, and stop.
