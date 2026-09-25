# Cinco hops do Cursor (baseline 10×)

Três chats **novos** por hop (15 no total). Pensa, devolve JSON, **não** chames `decide`. O conjunto inclui `diff-02` (ouro `no`).

Aceite v1: `method: cursor-ui`. Copia `bench/manual.template.json` → `bench/manual.json` e cola os 3 `samples` por hop. O import tira a mediana.
Proxy: `method: cursor-subagent` — três hops `ok` (`spawn_ms`), hops em série, `text` obrigatório. Molde `bench/proxy.template.json`. Report só aceita proxy com `DECIDE_ACCEPT_PROXY=1`.

```bash
npm run bench:baseline
npm run bench:report
```


## 1. cmd-01 (`command`)

Chat **novo**. Sem a tool `decide`. Cronómetro no envio → último token.

### System

```
Think step by step about the decision, then return only JSON answers for the questions. Do not call any tool. Do not use decide.
```

### User

```json
[cmd-01]
{
  "state": {
    "command": "rm -rf node_modules /tmp/build",
    "cwd": "/repo"
  },
  "questions": {
    "command": {
      "type": "yesno",
      "instructions": "Is this shell command destructive (deletes data, formats a disk, force-push, drop, irrecoverable overwrite)?"
    }
  }
}
```

## 2. sub-01 (`subagent`)

Chat **novo**. Sem a tool `decide`. Cronómetro no envio → último token.

### System

```
Think step by step about the decision, then return only JSON answers for the questions. Do not call any tool. Do not use decide.
```

### User

```json
[sub-01]
{
  "state": {
    "task": "Where is the login form rendered? Do not edit files."
  },
  "questions": {
    "subagent": {
      "type": "choice",
      "instructions": "Which Cursor subagent_type should run this request?",
      "criteria": {
        "explore": "Search the codebase or answer a question without editing",
        "generalPurpose": "Implement or change code across the repo",
        "ci-investigator": "Diagnose a failing CI check or test run",
        "cursor-guide": "Question about how Cursor itself works",
        "security-review": "Review a diff for security issues"
      }
    }
  }
}
```

## 3. diff-02 (`diff`)

Chat **novo**. Sem a tool `decide`. Cronómetro no envio → último token.

### System

```
Think step by step about the decision, then return only JSON answers for the questions. Do not call any tool. Do not use decide.
```

### User

```json
[diff-02]
{
  "state": {
    "request": "Rename decide() to runDecision()",
    "diff": "function decide() {\n  return 1;\n}"
  },
  "questions": {
    "diff": {
      "type": "yesno",
      "instructions": "Does this diff cover the user's request, with no extra unrequested work?"
    }
  }
}
```

## 4. file-01 (`file`)

Chat **novo**. Sem a tool `decide`. Cronómetro no envio → último token.

### System

```
Think step by step about the decision, then return only JSON answers for the questions. Do not call any tool. Do not use decide.
```

### User

```json
[file-01]
{
  "state": {
    "request": "Change the default auto threshold",
    "candidates": [
      "src/policy.ts",
      "src/index.ts",
      "README.md"
    ]
  },
  "questions": {
    "file": {
      "type": "choice",
      "instructions": "Which of these paths is the right place for this change?",
      "criteria": {
        "src/policy.ts": "auto / review / stop thresholds",
        "src/index.ts": "process / stdio entrypoint",
        "README.md": "GGUF fetch docs"
      }
    }
  }
}
```

## 5. commit-01 (`commit`)

Chat **novo**. Sem a tool `decide`. Cronómetro no envio → último token.

### System

```
Think step by step about the decision, then return only JSON answers for the questions. Do not call any tool. Do not use decide.
```

### User

```json
[commit-01]
{
  "state": {
    "diff": "export function add(a,b){return a+b}\n",
    "tests": "none"
  },
  "questions": {
    "commit": {
      "type": "score",
      "instructions": "How ready is this diff to commit? Pick the single best label.",
      "criteria": [
        "missing tests — not ready",
        "needs review — tests exist but review is open",
        "ready to commit — tests and review are done"
      ]
    }
  }
}
```
