# Model

Runtime GGUF is not in git. `DECIDIR_TIER` selects the pin (`0.6B` default).

| Tier | Repo | File | SHA-256 |
|---|---|---|---|
| `0.6B` | `unsloth/Qwen3-0.6B-GGUF` | `Qwen3-0.6B-Q8_0.gguf` | `e150ed544dfe6016930c026a93913a5e3184181ebfe6ab2223ae01dd0491784c` |
| `1.7B` | `unsloth/Qwen3-1.7B-GGUF` | `Qwen3-1.7B-Q4_K_M.gguf` | `b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897` |
| `4B` | `unsloth/Qwen3-4B-GGUF` | `Qwen3-4B-Q4_K_M.gguf` | `f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a` |

```bash
npm run fetch-model
DECIDIR_TIER=1.7B npm run fetch-model
```

Saves to `$DECIDIR_MODEL` or `~/.cache/TypedDecisionMCP/<file>`.
