#!/bin/bash
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

# graphify lives outside the repo (~/.local), so it never survives a
# fresh container. `uv tool install` is itself idempotent/fast when already
# installed, so just always run it rather than guarding it ourselves.
# [mcp] extra is needed for the graphify-mcp server declared in .mcp.json.
export PATH="$HOME/.local/bin:$PATH"
uv tool install "graphifyy[mcp]" --quiet
echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"

# graphify-out/ is gitignored and only exists on disk for this container's
# lifetime: full extract if missing, cheap incremental update otherwise.
if [ -f graphify-out/graph.json ]; then
  graphify update . || echo "warning: graphify update failed, graph may be stale" >&2
else
  graphify extract . --code-only || echo "warning: graphify extract failed" >&2
fi
