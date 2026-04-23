#!/usr/bin/env bash
# Day-one harness install. Idempotent. Safe to re-run.
# Most steps use `|| true` so a missing marketplace or inaccessible private
# repo won't kill the whole setup.
set -uo pipefail

echo "→ Installing Anthropic official marketplaces..."
claude plugin marketplace add anthropics/skills || true
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin marketplace add anthropics/financial-services-plugins || true
claude plugin marketplace add anthropics/knowledge-work-plugins || true

echo "→ Installing Anthropic core skills..."
claude plugin install anthropics/skills:document-skills || true
claude plugin install anthropics/skills:skill-creator || true
claude plugin install anthropics/skills:mcp-builder || true
claude plugin install anthropics/skills:webapp-testing || true
claude plugin install anthropics/skills:brand-guidelines || true

echo "→ Installing obra/superpowers SDLC bundle..."
claude plugin marketplace add obra/superpowers || true
claude plugin install obra/superpowers:test-driven-development || true
claude plugin install obra/superpowers:systematic-debugging || true
claude plugin install obra/superpowers:root-cause-tracing || true
claude plugin install obra/superpowers:subagent-driven-development || true

echo "→ Installing financial-services skills..."
claude plugin install anthropics/financial-services-plugins:three-statement-modeling || true
claude plugin install anthropics/financial-services-plugins:variance-analysis || true
claude plugin install anthropics/financial-services-plugins:commentary-generator || true
claude plugin install anthropics/knowledge-work-plugins:finance || true

echo "→ Cloning reference repos (read-only, for patterns)..."
mkdir -p references
pushd references >/dev/null

  # Ohanafy proprietary references — require SSO-authorized `gh` token.
  echo "  → Ohanafy private references (SSO required)..."
  mkdir -p ohanafy
  pushd ohanafy >/dev/null
    for repo in \
      ohanafy/ohanafy-managed-package \
      ohanafy/ohanafy-connect \
      ohanafy/ohanafy-demo-data \
    ; do
      gh repo clone "$repo" 2>/dev/null || echo "    (skip: $repo unavailable or already cloned)"
    done
  popd >/dev/null

  # Public references.
  echo "  → Public references..."
  for repo in \
    anthropics/financial-services-plugins \
    anthropics/knowledge-work-plugins \
    modelcontextprotocol/servers \
    tremorlabs/tremor \
    recharts/recharts \
    dream-num/univer \
    handsontable/hyperformula \
    OfficeDev/Office-Addin-TaskPane-React \
    trailheadapps/lwc-recipes \
    lastmile-ai/mcp-agent \
    DataDog/dd-trace-js \
    microsoft/playwright \
  ; do
    gh repo clone "$repo" 2>/dev/null || echo "    (skip: $repo already cloned or inaccessible)"
  done
popd >/dev/null

echo "→ Verifying install..."
claude plugin list 2>/dev/null | tee .claude/installed-plugins.txt || echo "(claude CLI not available; plugin list skipped)"

echo "→ Making hooks executable..."
chmod +x .claude/hooks/*.sh 2>/dev/null || true

echo "✅ Harness ready. Next: npm install && npm test from repo root."
