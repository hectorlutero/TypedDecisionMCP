# Model

Runtime GGUF is not in git. Ship default is **all-MiniLM-L6-v2 Q8** for `head-mlp`. `DECIDE_TIER` selects a Qwen pin for logits / override. `DECIDIR_TIER` still works if `DECIDE_TIER` is unset.

| Pin | Repo | File | SHA-256 |
|---|---|---|---|
| **ship (default)** | `second-state/All-MiniLM-L6-v2-Embedding-GGUF` | `all-MiniLM-L6-v2-Q8_0.gguf` | `263215c3cadd6e16740741a7624ab4cbb6c8e777688bd5331ecfbf5681c2f8ed` |
| `0.6B` | `unsloth/Qwen3-0.6B-GGUF` | `Qwen3-0.6B-Q8_0.gguf` | `e150ed544dfe6016930c026a93913a5e3184181ebfe6ab2223ae01dd0491784c` |
| `1.7B` | `unsloth/Qwen3-1.7B-GGUF` | `Qwen3-1.7B-Q4_K_M.gguf` | `b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897` |
| `4B` | `unsloth/Qwen3-4B-GGUF` | `Qwen3-4B-Q4_K_M.gguf` | `f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a` |

```bash
npm run fetch-model
DECIDE_TIER=0.6B npm run fetch-model
DECIDE_TIER=1.7B npm run fetch-model
```

Saves to `$DECIDE_MODEL` or `~/.cache/TypedDecisionMCP/<file>`.

Env útil nesta máquina:

- Default engine: **`head-mlp`** + MiniLM. Opt-in antigo: `DECIDE_ENGINE=logits` + `DECIDE_TIER=0.6B` (ou `DECIDE_MODEL` para o GGUF Qwen).
- `DECIDE_TIER=0.6B|1.7B|4B` — força pin Qwen (logits / override)
- `DECIDE_GPU=0|cpu` — força CPU (necessário se Vulkan OOM em tiers maiores; no MiniLM preferir `auto`)
- `DECIDE_KV=0` — desliga reuse KV no motor logits (ablation; piora qualidade/latência)
- `DECIDE_FEWSHOT=1` — option few-shot no prefixo (opt-in; no 0.6B quality cai abaixo de 0,75)
- `DECIDE_ENGINE=logits` — motor de logits (Qwen). Default é `head-mlp` (embedding curto + probe + LRU; hot path sem wrap). Pesos em `$DECIDE_HEAD_MLP` ou `~/.cache/TypedDecisionMCP/head-mlp.json` (ship = MiniLM joint; backup Qwen em `head-mlp-qwen-joint.json`)
