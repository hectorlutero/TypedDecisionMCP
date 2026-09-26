#!/usr/bin/env bash
# Instantiate TypedDecisionMCP on this VM: node_modules, dist, GGUF, head-mlp.
# Idempotent. Safe for Cloud Agent install and for the instantiate-mcp skill.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "instantiate-mcp: node and npm are required" >&2
  exit 1
fi

if [[ ! -f package-lock.json ]]; then
  echo "instantiate-mcp: package-lock.json missing" >&2
  exit 1
fi

if [[ ! -d node_modules/@modelcontextprotocol/sdk ]] || [[ package-lock.json -nt node_modules ]]; then
  npm ci
fi

if [[ ! -f dist/index.js ]]; then
  npm run build
fi

npm run fetch-model

cache="${HOME}/.cache/TypedDecisionMCP"
head="${DECIDE_HEAD_MLP:-${cache}/head-mlp.json}"
if [[ ! -s "$head" ]]; then
  npm run train:joint
fi

if [[ ! -s "$head" ]]; then
  echo "instantiate-mcp: head-mlp weights missing at ${head}" >&2
  exit 1
fi

if [[ ! -f dist/index.js ]]; then
  echo "instantiate-mcp: dist/index.js missing after build" >&2
  exit 1
fi

echo "instantiate-mcp: ready ${root}/dist/index.js ${head}"
