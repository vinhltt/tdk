---
name: tdk-implement-task
description: "[deprecated - scheduled for removal in future version] Execute the implementation plan by processing and executing all tasks defined in tasks.md"
metadata: 
  version: "2.1.0"
---

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** - Do NOT attempt workarounds or auto-fixes
2. **Report the error** - Show the exact error message to the user
3. **Wait for user** - Ask user how to proceed before taking any action

**DO NOT:**
- Try alternative approaches when scripts fail
- Create branches manually when script validation fails
- Guess or assume what the user wants after an error
- Continue with partial results

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Skill References

> Shared base instructions: `.specify/_shared/skills/embedded-brainstorm.md`

### Sequential Thinking (Implementation Reasoning)

**Trigger:** When encountering non-trivial implementation decisions during task execution.
**Technique:** Pause and reason step-by-step:
1. State the decision point clearly
2. Identify constraints from plan.md and spec.md (## 2. Scope Boundary, ## 7. Success Criteria, ## 8. Risks & Mitigations)
3. List 2-3 implementation approaches
4. Evaluate against project patterns (from codebase understanding)
5. Choose approach that aligns with existing code patterns + KISS principle
6. Document reasoning briefly in progress output

**Post-task verification:**
After completing each task, verify:
1. Does the output match the task description?
2. Does it align with plan.md architecture?
3. Are there side effects on other tasks?

## Outline
### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-implement-task`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1: Setup

Run `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/check-prerequisites.ts {task_id} --json --require-tasks --include-tasks` from repo root (pass the validated task_id from Step 0). Parse JSON for taskId, featureDir, availableDocs.

2. **Check checklists status** (if FEATURE_DIR/checklists/ exists):
   - Scan all checklist files in the checklists/ directory
   - For each checklist, count:
     - Total items: All lines matching `- [ ]` or `- [X]` or `- [x]`
     - Completed items: Lines matching `- [X]` or `- [x]`
     - Incomplete items: Lines matching `- [ ]`
   - Create a status table:

     ```text
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | ✓ PASS |
     | test.md   | 8     | 5         | 3          | ✗ FAIL |
     | security.md | 6   | 6         | 0          | ✓ PASS |
     ```

   - Calculate overall status:
     - **PASS**: All checklists have 0 incomplete items
     - **FAIL**: One or more checklists have incomplete items

   - **If any checklist is incomplete**:
     - Display the table with incomplete item counts
     - **STOP** and ask: "Some checklists are incomplete. Do you want to proceed with implementation anyway? (yes/no)"
     - Wait for user response before continuing
     - If user says "no" or "wait" or "stop", halt execution
     - If user says "yes" or "proceed" or "continue", proceed to step 3

   - **If all checklists are complete**:
     - Display the table showing all checklists passed
     - Automatically proceed to step 3

3. Load and analyze the implementation context:
   - **REQUIRED**: Read tasks.md for the complete task list and execution plan
   - **REQUIRED**: Read plan.md for tech stack, architecture, and file structure
   - **IF EXISTS**: Read data-model.md for entities and relationships
   - **IF EXISTS**: Read contracts/ for API specifications and test requirements
   - **IF EXISTS**: Read research.md for technical decisions and constraints
   - **IF EXISTS**: Read quickstart.md for integration scenarios

4. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the following command succeeds to determine if the repository is a git repo (create/verify .gitignore if so):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Check if Dockerfile* exists or Docker in plan.md → create/verify .dockerignore
   - Check if .eslintrc*or eslint.config.* exists → create/verify .eslintignore
   - Check if .prettierrc* exists → create/verify .prettierignore
   - Check if .npmrc or package.json exists → create/verify .npmignore (if publishing)
   - Check if terraform files (*.tf) exist → create/verify .terraformignore
   - Check if .helmignore needed (helm charts present) → create/verify .helmignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **Common Patterns by Technology** (from plan.md tech stack):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `Makefile`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Tool-Specific Patterns**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

5. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Tests, Core, Integration, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Execution flow**: Order and dependency requirements

6. Execute implementation following the task plan:
   - **Phase-by-phase execution**: Complete each phase before moving to the next
   - **Respect dependencies**: Run sequential tasks in order, parallel tasks [P] can run together
   - **Sequential Thinking at Decision Points:**
     When a task involves non-trivial choices (data structure, algorithm, pattern):
     - Pause execution and apply sequential thinking technique
     - Reason through constraints and options before implementing
     - Choose the simplest approach that satisfies requirements (KISS)
     - Brief reasoning note in progress output
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Validation checkpoints**: Verify each phase completion before proceeding

   ### ⚡ UT Phase Delegation (Auto-detect)

   **Before executing each phase**, check if it is a Unit Test phase:

   **Detection criteria** - phase name contains ANY of:
   - `Unit Test`, `Test Update`, `Test Creation`, `UT `
   - Phase description contains `Delegate to:` + `/tdk-ut-backfill-plan` or `/tdk-ut-backfill-auto` or `/tdk-ut-backfill-impl`
   - OR all tasks in the phase are test-related (file paths contain `.spec.`, `.test.`, `Tests/`, `__tests__/`, `test/`)

   **When UT phase detected:**

   1. **Pause** normal task-by-task execution for this phase
   2. **Auto-detect sub-workspace** from `PROJECT_CONTEXT` (loaded in Step 0.1 via `tdk-load-project-context`):
      - Use `PROJECT_CONTEXT.subWorkspaces` list (name + path) — already parsed from `.specify.json`
      - If `PROJECT_CONTEXT.targetSubWorkspace` is set → use it directly
      - Otherwise, for each task file path in this UT phase, match against sub-workspace paths
      - If ALL tasks map to 1 sub-workspace → auto-resolve: `--sub-workspace {name}`
      - If tasks span multiple sub-workspaces → **AskUserQuestion** to confirm which sub-workspace
      - If no sub-workspaces configured → omit `--sub-workspace` flag
   3. **Check if `{FEATURE_DIR}/ut-plan.md` exists:**
      - **If ut-plan.md EXISTS** → delegate to `/tdk-ut-backfill-impl {task_id} --sub-workspace {ws}`
        (UT plan already done — only need: generate test code → run → report)
      - **If ut-plan.md MISSING** → delegate to `/tdk-ut-backfill-auto {task_id} --sub-workspace {ws}`
        (Full workflow: check rules → plan → generate → run → report)
   4. **AskUserQuestion** before delegating:
      - Option 1: (recommended) "Delegate to `/tdk-ut-backfill-impl`" or "Delegate to `/tdk-ut-backfill-auto`" (based on step 3)
      - Option 2: "Manual — I'll handle tests myself"
      - Option 3: "Skip UT phase"
   5. **After delegation completes**:
      - Mark all tasks in this UT phase as `[X]` in tasks.md
      - Log: `"✓ Phase '{phase_name}' delegated to {skill} - completed"`
      - Resume normal execution with next phase
   6. **If delegation fails**:
      - Do NOT mark tasks as completed
      - Report error to user
      - Ask: "UT delegation failed. Continue with remaining phases or stop?"
   7. **If downstream skill reports sub-workspace mismatch** → AskUserQuestion to correct

   **Non-UT phases** → execute tasks directly as before (no change)

7. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code**: If you need to write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement models, services, CLI commands, endpoints
   - **Integration work**: Database connections, middleware, logging, external services
   - **Polish and validation**: Unit tests, performance optimization, documentation

8. Progress tracking and error handling:
   - Report progress after each completed task
   - Halt execution if any non-parallel task fails
   - For parallel tasks [P], continue with successful tasks, report failed ones
   - Provide clear error messages with context for debugging
   - Suggest next steps if implementation cannot proceed
   - **IMPORTANT** For completed tasks, make sure to mark the task off as [X] in the tasks file.

9. Completion validation:
   - Verify all required tasks are completed
   - Check that implemented feature match the original specification
   - Validate that tests pass and coverage meets requirements
   - Confirm the implementation follows the technical plan
   - Report final status with summary of completed work

[deprecated] Note: This command assumes a complete task breakdown exists in tasks.md. If tasks are incomplete or missing, suggest running `/tdk-tasks` first to regenerate the task list.
