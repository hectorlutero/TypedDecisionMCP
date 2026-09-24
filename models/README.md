# Model

Runtime GGUF is not in git. `DECIDE_TIER` selects the pin (`0.6B` default). `DECIDIR_TIER` still works if `DECIDE_TIER` is unset.

| Tier | Repo | File | SHA-256 |
|---|---|---|---|
| `0.6B` | `unsloth/Qwen3-0.6B-GGUF` | `Qwen3-0.6B-Q8_0.gguf` | `e150ed544dfe6016930c026a93913a5e3184181ebfe6ab2223ae01dd0491784c` |
| `1.7B` | `unsloth/Qwen3-1.7B-GGUF` | `Qwen3-1.7B-Q4_K_M.gguf` | `b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897` |
| `4B` | `unsloth/Qwen3-4B-GGUF` | `Qwen3-4B-Q4_K_M.gguf` | `f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a` |

```bash
npm run fetch-model
DECIDE_TIER=1.7B npm run fetch-model
```

Saves to `$DECIDE_MODEL` or `~/.cache/TypedDecisionMCP/<file>`.

Env útil nesta máquina:

- `DECIDE_TIER=0.6B|1.7B|4B` (default **0.6B** — ship)
- `DECIDE_GPU=0|cpu` — força CPU (necessário se Vulkan OOM em tiers maiores; no 0.6B preferir `auto`)
- `DECIDE_KV=0` — desliga reuse KV (ablation; piora qualidade/latência)
