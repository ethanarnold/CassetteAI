# CassetteAI

## Key Files

- **`SPEC.md`** — Single source of truth. Contains architecture, component specs, build progress checklists, biological glossary, and risk register. Read this for _what_ to build, _why_, _what's done_, and _what's next_. Update checkboxes as work completes.

## Workflow

1. At the start of each conversation, read `SPEC.md` to see current progress.
2. Refer to `SPEC.md` for detailed specs when implementing a component.
3. After completing work, update `SPEC.md` checkboxes and decisions log.

## Rules

### Security
1. NEVER expose an API key for any reason.
2. Never hardcode Modal tokens, Anthropic keys, or any credentials. Use environment variables exclusively.
3. Never commit `.env` files, `secrets/`, or any file matching `*.pem`, `*.key`.

### Tech Stack
4. Python 3.10+, type hints, and `async` for all FastAPI routes.
5. Frontend: React + Vite + Tailwind. No additional UI frameworks without discussion.
6. Pin all dependency versions. Never add a dependency without stating why.

### Biology / Domain
7. Never fabricate biological data (sequences, scores, etc.). Use real model outputs only.
8. When describing biology to users/judges, be transparent about limitations (e.g., proxied cell types).

### Code Quality
9. Keep backend modules small and single-purpose per the project structure in SPEC.md.
10. Use Sonnet for orchestration/parsing, Opus for biological interpretation.
11. Use streaming for all user-facing Claude responses.

### Git
12. Commit frequently with descriptive messages.
13. Never force-push.