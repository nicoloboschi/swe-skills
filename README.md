# swe-skills

A collection of [agent skills](https://www.skills.sh) for software-engineering
work — the kind of thing you want your coding agent to be able to do, packaged so
Claude Code, Cursor, Codex, opencode and friends can pick them up.

## Skills

| skill | what it does |
|---|---|
| [whiteboard](skills/whiteboard) | Draw diagrams on a real, local Excalidraw canvas. *"show me on the whiteboard"* |

## Install

Everything:

```bash
npx skills add nicoloboschi/swe-skills
```

Or one skill:

```bash
npx skills add nicoloboschi/swe-skills/whiteboard
```

Or manually — clone anywhere and symlink the skills you want into your agent's
skills directory:

```bash
git clone https://github.com/nicoloboschi/swe-skills.git ~/dev/swe-skills
ln -s ~/dev/swe-skills/skills/whiteboard ~/.claude/skills/whiteboard
```

Each skill has its own README with requirements and usage — read that before
installing, since some (whiteboard) need a one-time local setup.

## Layout

```
skills/
  <skill-name>/
    SKILL.md        # the procedure the agent follows (name + description frontmatter)
    README.md       # human-facing docs: what it does, install, requirements
    reference.md    # optional: detail the agent loads on demand
    scripts/        # optional: anything the agent shells out to
    docs/           # optional: images used by the README
```

## Adding a skill

1. Create `skills/<name>/` with a `SKILL.md` carrying YAML frontmatter:

   ```yaml
   ---
   name: <name>
   description: What it does, and the phrases that should trigger it.
   ---
   ```

   The `description` is what the agent matches against, so write it for
   retrieval: say when to use the skill, in the words a user would actually type.

2. Keep `SKILL.md` to the procedure. Push detail (format cheat sheets, palettes,
   API tables) into sibling files the agent reads only when it needs them.

3. Add a `README.md` for humans and a row to the table above.

4. Self-contained: a skill directory must work wherever it is symlinked, so
   resolve script paths relative to the script itself rather than assuming
   `~/.claude/skills/...`.
