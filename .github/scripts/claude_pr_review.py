#!/usr/bin/env python3
"""
Claude PR Review bot.

Reads a diff from a file, sends it to Claude with the Ohanafy Plan system prompt,
and prints a structured markdown review to stdout.

Graceful: exits 0 with a quiet note if ANTHROPIC_API_KEY is missing.
"""

import argparse
import os
import sys


SYSTEM = """You are a PR reviewer for the Ohanafy Plan hackathon. You have context on:
- The slice (§2 of HACKATHON-BUILD-OS.md)
- The track ownership (§2.3)
- The scope-cut tree (§14)
- The demo happy path (§15)

For the given diff, return a markdown comment with EXACTLY this structure:

## Claude Review

### What changed
<2-4 sentence plain-English summary>

### Track
<A / B / C based on branch name>

### Risk
<low / medium / high>
<One-sentence reason>

### Demo-path impact
<Which step(s) of §15 this enables, changes, or breaks>

### Scope cut?
<Yes + §14 rule # if the diff comments out or removes a tracked feature; No otherwise>

### Human action
<+1 to merge | review before merge | none>

### Flags
<Bullet list of anything unusual: new deps, changed contracts between tracks, console errors visible in demo, etc. Empty if clean.>

Be direct. No preamble. No emojis.
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff-file", required=True)
    parser.add_argument("--pr-number", required=True)
    parser.add_argument("--track", required=True)
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("_Claude review skipped: `ANTHROPIC_API_KEY` not set._")
        return 0

    try:
        import anthropic
    except ImportError:
        print("_Claude review skipped: `anthropic` SDK not installed._")
        return 0

    with open(args.diff_file, "r", encoding="utf-8") as fh:
        diff = fh.read()

    if not diff.strip():
        print("_No reviewable diff._")
        return 0

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1500,
        system=SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Track: {args.track}\n"
                    f"PR #: {args.pr_number}\n\n"
                    f"Diff (truncated to 60KB):\n```\n{diff[:60000]}\n```"
                ),
            }
        ],
    )

    print(msg.content[0].text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
