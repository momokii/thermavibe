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

## Security Rules — Non-Negotiable

20. **Never expose secrets.** Never write code that stores, logs, or exposes secrets, tokens, or credentials in any form — not in source code, not in test fixtures, not in log output.
21. **Validate all input.** Always validate and sanitize all external input at the boundary layer (`backend/app/api/v1/endpoints/`) before it reaches any business logic.
22. **No auth bypasses.** Never implement an auth bypass "to be fixed later" — incomplete auth is a blocker, not a deferrable item.
23. **Check dependencies.** Before adding any dependency, check for known vulnerabilities (`pip audit` / `npm audit`) and document the check in `.claude/state/DECISIONS_LOG.md`.
24. **Flag vulnerabilities.** If a security vulnerability is discovered in existing code during any session, flag it to the user immediately before proceeding with the current task. Consult `.claude/SECURITY_STANDARDS.md` for the full security posture.

## Environment Awareness Rules

25. **Identify the environment.** Always check `APP_ENV` (or ask the user) before running any command. Consult `.claude/ENVIRONMENT_GUIDE.md` when in doubt.
26. **Confirm before production changes.** In staging or production: present a written plan and receive explicit confirmation before executing any change, migration, or destructive operation.
27. **No dev tools in production.** Never expose debug ports, seed scripts, or development tooling in production configuration.
28. **Verify gitignore.** Verify `.env` is properly gitignored before the first commit of any session (it is already configured — do not remove it).

## Session End — Mandatory Before Closing

29. **Update CURRENT_STATUS.** Update `.claude/state/CURRENT_STATUS.md` with accurate current state and a session summary.
30. **Update TASK_QUEUE.** Update `.claude/state/TASK_QUEUE.md` — mark completed tasks, add newly discovered tasks.
31. **Log decisions.** Log any significant decision in `.claude/state/DECISIONS_LOG.md`.
32. **Update standards.** Update `.claude/CODING_STANDARDS.md` if new patterns were established or existing ones were corrected.
33. **Update security.** Update `.claude/SECURITY_STANDARDS.md` if new security findings or patterns were identified.

## Self-Maintenance Directive

34. **Keep files accurate.** The `.claude/` files must stay accurate at all times. If a convention in `CODING_STANDARDS.md` is found to be wrong or outdated, correct it immediately and log the change in `DECISIONS_LOG.md`.
35. **Update stale state.** If the project state in `CURRENT_STATUS.md` is stale, update it before proceeding.

## Escalation Rule

36. **Ask when blocked.** When blocked, uncertain about scope, or facing a decision with significant architectural, security, or UX impact: document the blocker in `CURRENT_STATUS.md` and ask the user — do not assume and proceed.
