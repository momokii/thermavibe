# Agent Rules — Non-Negotiable

These rules MUST be followed at all times. Violating any rule requires explicit user instruction.

---

## Before Starting Any Task

1. **Read state files first.** Always read `.claude/state/CURRENT_STATUS.md` and `.claude/state/TASK_QUEUE.md` before doing any work.
2. **Read relevant docs.** Check `docs/prd/` and `docs/technical/` for the task's requirements before writing code.
3. **Check CLAUDE.md.** The root `CLAUDE.md` contains mandatory workflow and architecture rules that apply to every session.

## During Work

4. **Follow the layer contract.** Routes call Services. Services call Models. Never skip a layer. If a route needs data, the service provides it. If a service needs data, the model provides it.
5. **Stay in scope.** Never make changes outside the current task's defined scope. If you notice something that should be fixed, note it in `state/CURRENT_STATUS.md` or ask the user — don't fix it on spec.
6. **Async-first.** All database operations use SQLAlchemy async sessions. Never use sync DB calls.
7. **Type everything.** All Python functions must have full type hints. All TypeScript is strict mode.

## Safety Rules

8. **Zero-regression rule.** Existing passing tests must remain passing. If your changes break tests, fix the tests before committing.
9. **No destructive operations.** Never delete or overwrite files without explicit instruction. Never run `git push --force`, `rm -rf`, or or similar destructive commands.
10. **Preserve existing files.** Never modify `settings.json` or `settings.local.json` without explicit instruction.

## When Making Decisions

11. **Ask before infrastructure changes.** Schema changes, new dependencies, architectural changes, and new API endpoints all require user approval before implementation.
12. **Follow the PRD.** If the PRD (`docs/prd/`) specifies behavior, implement as specified. If the PRD says one thing and code does another, flag it explicitly.
13. **Provider-agnostic design.** Never hardcode to one AI provider, payment gateway, camera model, or printer model. Always use the strategy pattern with swappable providers.

## When Blocked or Uncertain

14. **Document blockers.** When blocked, document the blocker in `.claude/state/CURRENT_STATUS.md` with the clear description of what's blocking and why.
15. **Ask, don't assume.** If behavior is undefined in `docs/prd/`, ambiguous, or unclear — ask the user before proceeding. Wrong state is worse than no state.
16. **Check open questions.** Review `docs/prd/08-open-questions.md` to see if the ambiguity is already known.

## After Completing Work

17. **Update state files.** Always update `.claude/state/CURRENT_STATUS.md` after completing or partially completing work.
18. **Write tests.** Every new service must have corresponding unit tests. Every new API endpoint must have integration tests.
19. **Update docs.** Keep all affected documentation current with the changes made. If an API contract changes, update `docs/technical/api-contract.md`.
