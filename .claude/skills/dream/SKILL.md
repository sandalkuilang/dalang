---
name: dream
description: Shortcut for /sapu:dream from the sapu plugin, so the owner can type /dream. Used only when the user types /dream.
disable-model-invocation: true
---

Invoke the Skill tool with `skill: "sapu:dream"` and the user's arguments unchanged: $ARGUMENTS

If the Skill tool has no `sapu:dream`, the sapu plugin is not enabled in this repo. Tell the user to run `claude plugin install sapu@sapu --scope project` from the main checkout of this repo, and stop.
