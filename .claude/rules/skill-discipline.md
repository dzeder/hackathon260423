# Skill Discipline

- Every new skill in `.claude/skills/` gets reviewed via `skill-creator` eval harness before merge
- `SKILL.md` must start with a "pushy" description — name specific phrases or file types that should trigger it
- Progressive disclosure: `SKILL.md` short and decisive; long procedures in `references/`; deterministic work in `scripts/`
- Skills that don't fire reliably are worse than no skill at all → fail the eval, don't merge
