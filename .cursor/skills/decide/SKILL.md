---
name: decide
description: Use TypedDecisionMCP for command, subagent, diff, file, commit.
---

# decide

Call the MCP tool `decide` (formerly `decidir`) with `preset` and `state`. For `file` or `bundle`, put 2–20 paths in `state.candidates`. Portuguese aliases (`comando`, `subagente`, `ficheiro`, `pacote`) still parse.

The motor is local logits. It does not generate answer tokens. Trust `action` and the typed `answers`. Never invent a probability in the chat text.
