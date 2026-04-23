#!/usr/bin/env python3
"""
Regenerate STATUS.md from live repo state.

Pulls: current branches + commits ahead of main, last push time,
open blockers, recent decisions. Asks Claude to compose the §7.4 format.

Graceful: exits 0 with a quiet note if ANTHROPIC_API_KEY is missing.
"""

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def sh(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)
    except Exception as exc:
        return f"(command failed: {exc})"


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        # Emit a minimal hand-written status so the file is never empty.
        print(f"# STATUS — {datetime.utcnow().isoformat()}Z\n")
        print("_ANTHROPIC_API_KEY not set; status-refresh bot is quiet today._\n")
        return 0

    try:
        import anthropic
    except ImportError:
        print(f"# STATUS — {datetime.utcnow().isoformat()}Z\n")
        print("_`anthropic` SDK not installed; status-refresh bot is quiet today._\n")
        return 0

    branches = sh(["git", "branch", "-a"])
    recent_log = sh(["git", "log", "--all", "--since=4 hours ago", "--pretty=format:%h %an %s"])
    blockers = Path("BLOCKERS.md").read_text() if Path("BLOCKERS.md").exists() else ""
    decisions = Path("DECISION_LOG.md").read_text() if Path("DECISION_LOG.md").exists() else ""

    user_msg = (
        f"Regenerate STATUS.md for the Ohanafy Plan hackathon. Follow §7.4 format.\n\n"
        f"Branches:\n```\n{branches[:2000]}\n```\n\n"
        f"Recent commits:\n```\n{recent_log[:3000]}\n```\n\n"
        f"Open blockers:\n```\n{blockers[:2000]}\n```\n\n"
        f"Recent decisions:\n```\n{decisions[:2000]}\n```\n\n"
        "Output ONLY markdown. Start with `# STATUS — <ISO timestamp>`. "
        "Include: tracks table, demo-path coverage (§15), open blockers, recent decisions, next checkpoint."
    )

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2000,
        system="You are the STATUS.md dashboard bot for the Ohanafy Plan hackathon.",
        messages=[{"role": "user", "content": user_msg}],
    )

    print(msg.content[0].text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
