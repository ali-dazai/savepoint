@AGENTS.md

## Claude-specific

- The Supabase connector reaches the live project: read-only queries are fine for investigating; any write or
  deploy only with Ali's OK.
- Use cheaper subagents (Sonnet, Haiku) for mechanical work such as copying, reformatting or sweeping files.
- The Claude project "save point" holds only a short pointer doc; the memory is in `savepoint-notes`.
