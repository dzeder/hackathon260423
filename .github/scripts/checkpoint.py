#!/usr/bin/env python3
"""
Mid-day checkpoint composer (§13 of HACKATHON-BUILD-OS.md).

Pulls the last 2 hours of git history, BLOCKERS.md, and DECISION_LOG.md,
asks Claude to fill out the §13 prompt for the given time window,
and prints a markdown checkpoint to stdout.

Graceful: exits 0 with a quiet note if ANTHROPIC_API_KEY is missing.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path


PROMPTS = {
    "12pm": "12:00 checkpoint — are all 3 tracks at a runnable skeleton? What's blocking Track A's skeleton merge?",
    "2pm": "2:00 checkpoint — is Track A's copilot calling Track B's MCP servers live? Which demo-path steps are working end to end?",
    "330pm": "3:30 checkpoint — can we record the backup video right now? Any wobble on the happy path?",
}


def sh(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)
    except Exception as exc:
        return f"(command failed: {exc})"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--time", required=True, choices=list(PROMPTS))
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(f"_Checkpoint {args.time} skipped: `ANTHROPIC_API_KEY` not set._")
        return 0

    try:
        import anthropic
    except ImportError:
        print(f"_Checkpoint {args.time} skipped: `anthropic` SDK not installed._")
        return 0

    git_log = sh(["git", "log", "--since=2 hours ago", "--pretty=format:%h %s"])
    blockers = Path("BLOCKERS.md").read_text() if Path("BLOCKERS.md").exists() else "(no BLOCKERS.md)"
    decisions = Path("DECISION_LOG.md").read_text() if Path("DECISION_LOG.md").exists() else "(no DECISION_LOG.md)"

    user_msg = (
        f"Checkpoint prompt: {PROMPTS[args.time]}\n\n"
        f"Git log (last 2 hours):\n```\n{git_log[:4000]}\n```\n\n"
        f"Open blockers:\n```\n{blockers[:2000]}\n```\n\n"
        f"Recent decisions:\n```\n{decisions[:2000]}\n```\n\n"
        "Compose a checkpoint update: 5-8 bullets answering the prompt. "
        "Be terse. CFO audience. No emojis."
    )

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1200,
        system="You are the checkpoint composer for the Ohanafy Plan hackathon.",
        messages=[{"role": "user", "content": user_msg}],
    )

    print(msg.content[0].text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
