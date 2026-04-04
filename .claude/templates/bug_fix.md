# Template: Investigating and Fixing a Bug

Step-by-step protocol for bug fixes. Follow every step.

---

## Step 1: Reproduce the Bug

**Do not touch any code until you can reproduce the bug.**

- [ ] Confirm the exact steps to reproduce
- [ ] Document the expected behavior vs actual behavior
- [ ] Note the error output (exception message, HTTP status code, log output)
- [ ] If the bug cannot be reproduced, document what was tried and ask for more information

**Reproduction log:**
```
Steps to reproduce:
1. ...
2. ...
3. ...

Expected:
...

Actual:
...

Error output:
...
```

---

## Step 2: Identify the Root Cause

- [ ] Trace the code path from the user action to the error
- [ ] Read the relevant source files before making any changes
- [ ] Identify the specific line(s) causing the issue
- [ ] Document the root cause

**Root cause:**
```
File: {file_path}:{line_number}
Cause: {description of why the bug occurs}
```

---

## Step 3: Apply Minimal Targeted Fix

- [ ] Fix ONLY the root cause — do not refactor surrounding code
- [ ] Do not add features, improve code style, or make "while you're here" changes
- [ ] Ensure the fix does not introduce new issues
- [ ] Verify the fix resolves the original reproduction case

---

## Step 4: Write a Regression Test

- [ ] Write a test that reproduces the original bug (should fail without the fix)
- [ ] Run the test to confirm it fails without the fix
- [ ] Run the test to confirm it passes with the fix
- [ ] Place the test in the appropriate test file (see `.claude/templates/new_test.md`)

---

## Step 5: Run Full Test Suite

- [ ] Run `make test` — all tests must pass
- [ ] Run `make lint` — no new lint errors
- [ ] If any existing tests break, the fix is incorrect — go back to Step 3

---

## Step 6: Check for Same Bug in Related Areas

- [ ] Search for similar patterns in related files
- [ ] If the bug exists elsewhere, fix it there too
- [ ] Add tests for those cases as well

---

## Step 7: Update State

- [ ] Update `.claude/state/CURRENT_STATUS.md` with:
  - What bug was fixed
  - Root cause summary
  - Files changed
- [ ] If this was a task in `.claude/state/TASK_QUEUE.md`, mark it as DONE
