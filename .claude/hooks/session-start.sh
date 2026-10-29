#!/bin/bash
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

# graphify lives outside the repo (~/.local), so it never survives a
# fresh container. Reinstalling is cheap; only skip it if already present.
export PATH="$HOME/.local/bin:$PATH"
if ! command -v graphify >/dev/null 2>&1; then
  uv tool install graphifyy --quiet
fi
echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"

# graphify-out/ is gitignored and only exists on disk for this container's
# lifetime: full extract if missing, cheap incremental update otherwise.
if [ -f graphify-out/graph.json ]; then
  graphify update . || echo "warning: graphify update failed, graph may be stale" >&2
else
  graphify extract . --code-only || echo "warning: graphify extract failed" >&2
fi
