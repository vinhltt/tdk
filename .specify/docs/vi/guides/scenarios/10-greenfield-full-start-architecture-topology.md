# Scenario: Greenfield Full Start, Architecture, And Workspace Layout

> **Dùng khi**: Bắt đầu một project mới và bạn cần project inception,
> constitution, epic/spec context, architecture reports, workspace layout
> proposal, dependency policy guidance, và sub-workspace docs trước implementation.

Scenario này cover toàn bộ project-start chain:

```text
/tdk-greenfield-start --full
-> /tdk-constitution --init
-> /tdk-discovery
-> /tdk-specify
-> /tdk-clarify
-> /tdk-architecture-advisor
-> /tdk-workspace-layout-propose
-> /tdk-workflow-config-apply
-> /tdk-workspace-dependency-policy
-> /tdk-sub-workspace-bootstrap
```

`/tdk-sub-workspace-bootstrap` chạy docs, recommendation, scaffold và đăng ký
route cho mọi sub-workspace đã configure mà không hỏi câu nào. Chuỗi thủ công
vẫn là phương án thay thế khi bạn muốn review từng recommendation trước khi
scaffold, hoặc khi chưa cài `tdk-scaffold`:

```text
/tdk-sub-workspace-docs --all
-> /tdk-sub-workspace-automation-recommend --sub-workspace <name>
-> review recommendation, đặt status: approved
-> /tdk-scaffold-from-recommendation <recommendation-path>
-> /tdk-delegate-routing diff, rồi register
```

Chain này có hai nhóm artifact khác nhau:

- **Project-level artifacts**: inception, constitution/memory, architecture,
  workspace layout, dependency policy, sub-workspace docs, automation
  recommendations, cùng các skill, agent và route được scaffold từ chúng.
- **Feature/epic artifacts**: discovery, `spec.md` với embedded quality gate, và
  clarifications.

Important gate: `/tdk-workflow-config-apply` preview trước và hỏi trước khi
ghi config. Với project mới, approve guarded apply trước
`/tdk-sub-workspace-bootstrap` hoặc `/tdk-sub-workspace-docs --all`; cả hai chỉ
hoạt động khi `.specify/.specify.json` đã có `subWorkspaces[]` được configure.

## Chạy Bằng Một Lệnh

`/tdk-project-bootstrap` chạy phần lớn chain này bằng một lệnh, với đúng một câu
hỏi về config:

```text
/tdk-project-bootstrap "Project brief..."
```

Lệnh này chạy `/tdk-greenfield-start` cùng phần interview của nó, rồi
`/tdk-architecture-advisor`, `/tdk-workspace-layout-propose`, một config gate
chạy cùng guarded CLI apply mà `/tdk-workflow-config-apply` bọc bên ngoài,
memory với các domain được suy ra, `/tdk-constitution --init --auto`, bước
sub-workspace, và một `AGENTS.md` ở root. Nó tạo một `.specify/.specify.json`
tối thiểu khi chưa có config JSON hay YAML nào. Cần có brief, hoặc một file
markdown bên trong workspace, trừ khi `project-inception.md` đã tồn tại và không
ở trạng thái `not-ready`, nên sau khi halt ở chỗ đó hãy truyền lại brief: dòng cuối
khi đó là `Next: fix the listed items, then rerun /tdk-project-bootstrap <brief>`.

Lệnh này không chạy `/tdk-discovery`, `/tdk-specify`, `/tdk-clarify`, hay
`/tdk-workspace-dependency-policy`; hãy tự chạy các lệnh đó sau. Review
`.specify/configurations/inception/project-bootstrap-report.md`, bắt đầu từ
`## Needs your review`. Gate, report, chạy lại, commit và rollback hoạt động
giống như trong [Brownfield Project Bootstrap](11-brownfield-project-bootstrap.md).
Dùng chain từng bước bên dưới khi bạn muốn review từng bước trước khi bước sau
chạy.

## Prerequisites

- TDK đã được install trong consumer project dưới `.specify/`.
- Quá trình cài harness đã phân giải thành bộ base gắn kết gồm `tdk-core`,
  `tdk-inception`, `tdk-memory`, và `tdk-utils`. Các command nền tảng
  project/workspace đến `/tdk-sub-workspace-docs` được đóng gói dưới
  `tdk-inception`; command tiếp nối `/tdk-sub-workspace-automation-recommend`
  thuộc `tdk-scaffold`. Tên command và đường dẫn artifact không đổi.
- `/tdk-sub-workspace-bootstrap` cũng thuộc `tdk-scaffold`. Nếu không có plugin
  này, dùng chuỗi thủ công bắt đầu từ `/tdk-sub-workspace-docs --all`; các bước
  sau của chuỗi đó cũng cần `tdk-scaffold`.
- Project có JSON `.specify/.specify.json`; workflow config apply không tạo
  first-time config từ đầu. Đường chạy bằng một lệnh tạo sẵn một bản tối thiểu.
- Có `bun`.
- `repomix` được install trước `/tdk-sub-workspace-bootstrap` hoặc
  `/tdk-sub-workspace-docs --all`. Xem mục
  Prerequisites trong `.specify/docs/vi/guides/setup/setup-guide.md`.

## Chuỗi Command Đề Xuất

Dùng explicit arguments; short chain ở trên chỉ là shape.

```text
/tdk-greenfield-start "Project brief..." --full
/tdk-constitution --init .specify/configurations/inception/project-inception.md
/tdk-discovery feat-001 "Epic brief..."
/tdk-specify feat-001 "Feature or epic requirement description"
/tdk-clarify feat-001
/tdk-architecture-advisor .specify/configurations/inception/project-inception.md
/tdk-workspace-layout-propose .specify/configurations/architecture/architecture-decision.md
/tdk-workflow-config-apply
```

Review diff/warnings do skill hiển thị. Nếu patch được approve, skill
apply parsed `planHash` internally. Sau đó tiếp tục:

```text
/tdk-workspace-dependency-policy .specify/configurations/workspace-layout/workspace-layout-proposal.json
/tdk-sub-workspace-bootstrap
```

Khi bootstrap chạy xong, review
`.specify/configurations/automation-recommendations/bootstrap-report.md`, bắt đầu
từ `## Needs your review`, trước khi chạy `/tdk-plan`. Chuỗi thủ công nằm ở bước
10 bên dưới.

Nếu bạn cố ý muốn policy guidance trước runtime config apply, chạy
`/tdk-workflow-config-apply --dry-run` trước, rồi
`/tdk-workspace-dependency-policy`, nhưng xem result là advisory trên
proposed layout.

## Output Map

| Step | Command | Primary output | Writes runtime config? |
|---|---|---|---|
| 1 | `/tdk-greenfield-start --full` | `.specify/configurations/inception/project-inception.md` | No |
| 2 | `/tdk-constitution --init` | `<memory root>/constitution.md`, memory index/config, Arc42 summaries, typed memory files when evidence exists | No `.specify/.specify.json` mutation |
| 3 | `/tdk-discovery <id> <brief>` | `<feature-dir>/discovery.md`, `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md` | No |
| 4 | `/tdk-specify <id> <description>` | `<feature-dir>/spec.md` với `## Specification Quality Gate` | No |
| 5 | `/tdk-clarify <id>` | Updates `<feature-dir>/spec.md` and `## Clarifications` | No |
| 6 | `/tdk-architecture-advisor` | `.specify/configurations/architecture/architecture-options.md`, `architecture-decision.md` | No |
| 7 | `/tdk-workspace-layout-propose` | `.specify/configurations/workspace-layout/workspace-layout-proposal.md`, `workspace-layout-proposal.json` | No |
| 8 | `/tdk-workflow-config-apply` | Diff/warnings review, then updated `.specify/.specify.json`, apply report, backup when approved | Yes, after confirmation |
| 9 | `/tdk-workspace-dependency-policy` | `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`, optional `enforcement-snippets.md` | No |
| 10 | `/tdk-sub-workspace-bootstrap` | Với mỗi configured sub-workspace: arc42-lite docs dưới `<docsPath>/sub-workspaces/<name>/`, `.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md`, các skill và agent còn thiếu dưới `.claude/`, và một section `## <name>` mới trong `delegate-routing.md`; cùng với `.specify/configurations/automation-recommendations/bootstrap-report.md` | No `.specify/.specify.json` mutation; chỉ tạo artifact còn thiếu |

`<feature-dir>` được resolve từ project config và task ID. Trong default setup,
nó thường nằm dưới `.specify/specs/<id>/`.

## Step-By-Step Gates

### 1. Greenfield inception

```text
/tdk-greenfield-start "Project brief..." --full
```

Đọc `.specify/configurations/inception/project-inception.md` trước khi tiếp tục.
Kiểm tra:

- readiness là `ready` hoặc `ready-with-assumptions`;
- project shape classification hợp lý;
- unresolved questions không block constitution, discovery, hoặc architecture work;
- recommended next route khớp project goal.

Command này chỉ intake/routing. Nó không tạo specs, layout files,
plans, source code, tracker issues, hoặc `.specify/.specify.json`.

### 2. Constitution and memory authority

```text
/tdk-constitution --init .specify/configurations/inception/project-inception.md
```

Command này tạo hoặc update project authority:

- `<memory root>/constitution.md`
- `<memory root>/memory-index.md`
- `<memory root>/memory.yaml`
- `<memory root>/arc42/README.md`
- `<memory root>/arc42/01-introduction-and-goals.md` through
  `12-glossary.md`
- typed memory files dưới `decisions/`, `risks-and-debt/`,
  `quality-requirements/`, `integrations/`, `operations/`, và `glossary/`
  khi có evidence

README và human docs chỉ là context. Constitution và memory là authority mạnh hơn
cho các command sau.

### 3. Discovery

```text
/tdk-discovery feat-001 "Epic brief..."
```

Discovery là optional cho small, clear feature work. Dùng khi work đủ rộng khiến
problem, personas, MVP cutline, hoặc product-level signals cần context riêng.

Output:

- `<feature-dir>/discovery/problem.md`
- `<feature-dir>/discovery/personas.md`
- `<feature-dir>/discovery/mvp-scope.md`
- `<feature-dir>/discovery.md`

Discovery không tạo `UR-*`, `FR-*`, hoặc `SC-*`; chỉ `/tdk-specify` sở hữu
requirement IDs.

### 4. Specify

```text
/tdk-specify feat-001 "Feature or epic requirement description"
```

Output:

- `<feature-dir>/spec.md`
- `## Specification Quality Gate` trong `<feature-dir>/spec.md`

`spec.md` là requirement authority. Nó nên có 9 numbered sections cộng với
`## Clarifications`. Tất cả `UR-*`, `FR-*`, và `SC-*` IDs thuộc về file này.

### 5. Clarify

```text
/tdk-clarify feat-001
```

Clarify update `spec.md`; nó không tạo artifact mới. Gate trước khi đi tiếp:

- `## 9. Unresolved Questions` chính xác là `None`, hoặc remaining questions
  được explicitly accepted là deferred.
- Session `## Clarifications` ghi mọi accepted answer.
- Các section liên quan như requirement, scope, risk, entity, hoặc success criteria
  được update, không chỉ Q/A log.

### 6. Architecture advisor

```text
/tdk-architecture-advisor .specify/configurations/inception/project-inception.md
```

Standard mode ghi:

- `.specify/configurations/architecture/architecture-options.md`
- `.specify/configurations/architecture/architecture-decision.md`

Nó chỉ là report. Nó không ghi ADRs, topology, specs, HLD, plans, tasks,
source code, hoặc `.specify/.specify.json`.

Review:

- selected architecture và confidence;
- ít nhất hai rejected options;
- quality attribute scenarios;
- trust boundaries và data classification;
- kill criteria và unresolved questions.

### 7. Workspace layout proposal

```text
/tdk-workspace-layout-propose .specify/configurations/architecture/architecture-decision.md
```

Output:

- `.specify/configurations/workspace-layout/workspace-layout-proposal.md`
- `.specify/configurations/workspace-layout/workspace-layout-proposal.json`

JSON là authoring proposal, không phải runtime config. Runtime-backed fields
giới hạn ở `architecture.type`, `subWorkspaces[]`, docs và `modules[]`.
Implementation/test routing nằm trong `delegate-routing.md`: `/skills` cung cấp
toolset, `@agents` tùy chọn cung cấp executor, thể hiện qua `## Delegate Skills`
và `## Delegate Agents`. Backfill chỉ lấy test route; TDD lấy test trước rồi
domain route. Các field `boundaryType`, `owner`, `contracts`,
`allowedDependencies` và `routing` vẫn chỉ report-only nếu schema chưa mở rộng.
Sau khi đối chiếu nguồn chuẩn `.claude/` và chuyển sang OMP bằng source-checkout
CLI nếu cần, duyệt routing diff rồi dùng `/tdk-plan <id> --refresh-routing` cho
các phase todo hiện có; route equality không chứng minh executor readiness.
Xem [skills guide](../skills-guide.md#detailed-mode-notes).

### 8. Workflow config review and guarded apply

```text
/tdk-workflow-config-apply
```

Default mode chạy TypeScript CLI dry-run trước, parse JSON preview,
và hiển thị:

- `planHash`
- `applyEligible`
- `requiresConfirmation`
- `confirmationFindings`
- `diff`
- `warnings`

Bạn không copy `planHash` thủ công. Nếu bạn approve patch được hiển thị, skill
apply đúng preview đó bằng parsed hash. Nếu decline, nó không ghi file nào.

Automation hoặc debugging vẫn có thể dùng explicit two-step form:

```text
/tdk-workflow-config-apply --dry-run
/tdk-workflow-config-apply --yes --expect-hash <planHash>
```

Chỉ dùng `--accept-overwrites` sau khi explicitly approve same-name overwrites,
architecture type changes, hoặc normalized path collisions. `--reconcile` là
report-only và không thể kết hợp với `--yes`.

### 9. Workspace dependency policy

```text
/tdk-workspace-dependency-policy .specify/configurations/workspace-layout/workspace-layout-proposal.json
```

Output:

- `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`
- `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md`
  khi snippets được request hoặc evidence support chúng

Đây chỉ là policy/report. Nó không edit ESLint, Nx, Turborepo,
dependency-cruiser, package manager files, source folders, layout files, ADRs,
routing files, hoặc `.specify/.specify.json`.

### 10. Sub-workspace bootstrap

```text
/tdk-sub-workspace-bootstrap
```

Command này cần configured `subWorkspaces[]` trong `.specify/.specify.json`, và
cần có `bun` cùng `repomix` trên `PATH`. Thêm `--sub-workspace <name>` để chỉ
chạy cho một sub-workspace. Với mỗi configured sub-workspace, theo thứ tự trong
config, bootstrap chỉ chạy một bước khi output của bước đó còn thiếu:

- `/tdk-sub-workspace-docs --sub-workspace <name>` khi chưa có file docs nào;
- `/tdk-sub-workspace-automation-recommend --sub-workspace <name> --auto --no-community-search`
  khi chưa có recommendation; `--auto` ghi file này với `status: approved` và
  `approval: auto-init`;
- `/tdk-scaffold-from-recommendation <recommendation-path> --auto`, bước này tạo
  các skill và agent còn thiếu dưới `.claude/` và không patch gì;
- `/tdk-delegate-routing register --auto`, bước này thêm section `## <name>` vào
  `delegate-routing.md` chỉ khi route file chưa có section đó.

Bootstrap không bao giờ sửa, ghi đè hay xóa file đã có, ngoại trừ việc append
một route section, việc scaffold ghi lại `scaffold-outcome.json` của chính nó,
và việc ghi lại report của chính bootstrap. Khi một child skill lẽ ra sẽ
hỏi, bootstrap chọn nhánh không ghi gì và đưa mục đó vào danh sách review. Lỗi ở
một sub-workspace không làm dừng các sub-workspace khác. Với layout mới, folder
sub-workspace chưa có source file hay package manifest nào được báo là
`deferred`; chạy lại bootstrap khi đã có code hoặc manifest. Path đã configure
nhưng không tồn tại được báo là `skipped (missing path)`.

Report nằm ở
`.specify/configurations/automation-recommendations/bootstrap-report.md`. Đọc
`## Needs your review` trước: mục này liệt kê skill và agent mới (kèm `tools` và
`skills:` của từng agent), route đã đăng ký, các câu hỏi đã bị bỏ qua, và các
sub-workspace bị deferred hoặc thiếu docs. Sau đó tiếp tục với `/tdk-plan`.

"Không hỏi" nghĩa là các TDK skill không hỏi câu nào. Bản thân Claude Code vẫn
có thể xin quyền trước khi ghi vào `.claude/`, tùy permission mode bạn đang dùng.

#### Phương án thủ công

Dùng chuỗi này khi muốn review từng recommendation trước khi scaffold, hoặc khi
chưa cài `tdk-scaffold`; nếu không có plugin đó thì chỉ dùng được
`/tdk-sub-workspace-docs --all`. Command và đường dẫn artifact giống hệt những
gì bootstrap dùng.

```text
/tdk-sub-workspace-docs --all
/tdk-sub-workspace-automation-recommend --sub-workspace <name>
/tdk-scaffold-from-recommendation .specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md
/tdk-delegate-routing diff --proposal <path-to-delegate-routing-proposal.json>
```

`/tdk-sub-workspace-docs --all` cần configured `subWorkspaces[]` trong
`.specify/.specify.json` và real paths trên disk. Với mỗi target, nó ghi hoặc
refresh:

- `<docsPath>/sub-workspaces/<name>/README.md`
- `<docsPath>/sub-workspaces/<name>/architecture.md`
- `<docsPath>/sub-workspaces/<name>/interfaces.md`
- `<docsPath>/sub-workspaces/<name>/data-flow.md`
- `<docsPath>/sub-workspaces/<name>/engineering.md`

Skill chạy resolver, pack code bằng repomix, chạy scout, rồi delegate writing
cho `tdk-docs-writer` agent. Nó chỉ generate arc42-lite docs;
nó không tạo PRDs, roadmap docs, hoặc runtime config.

Chạy `/tdk-sub-workspace-automation-recommend --sub-workspace <name>` cho từng
sub-workspace sau khi docs tồn tại. Recommendation đọc
selected sub-workspace docs, workspace dependency policy, official docs, primary
sources, local installed skills, và optional direct community lookup qua
`npx skills find` hoặc skills.sh. Nó không dùng `ck:find-skills` và không
support `--all`.

Review recommendation rồi đặt `status: approved` trong frontmatter của nó, sau đó
chạy `/tdk-scaffold-from-recommendation`. Skill này ghi
`delegate-routing-proposal.json` cạnh recommendation; review proposal đó bằng
`/tdk-delegate-routing diff`, rồi register với `approvalDigest` của diff và
`--yes`. Xem [skills guide](../skills-guide.md#project-inception-commands).

## What This Chain Does Not Produce

- Không có implementation `plan.md`
- Không có `tasks-breakdown/`
- Không có source code
- Không có tracker issues
- Không có HLD artifacts
- Không có ADR files by default
- Không có active dependency enforcement config
- Không có runtime config mutation cho đến khi guarded layout apply dùng
  `/tdk-workflow-config-apply`

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Topology apply báo missing JSON config | `.specify/.specify.json` không tồn tại hoặc chỉ có YAML config | Tạo/migrate JSON config trước, hoặc chạy `/tdk-project-bootstrap`, lệnh này tạo JSON config tối thiểu khi chưa có config JSON hay YAML nào |
| `--yes` bị reject | Thiếu `--expect-hash` trong automation mode | Dùng no-flag interactive mode, hoặc rerun dry-run và truyền parsed `planHash` |
| Sub-workspace docs báo không có sub-workspaces | Dry-run đã review nhưng chưa apply | Run guarded workflow config apply, rồi rerun docs |
| Sub-workspace docs báo missing path | Config trỏ tới folder không tồn tại | Tạo intended folder hoặc fix layout/config trước docs |
| Dependency policy không tạo snippets | Không có supported stack evidence hoặc snippets không được request | Dùng `--suggest` sau khi layout evidence đủ mạnh |

## Next Commands

Sau scenario này, chọn path tiếp theo:

| Goal | Next command |
|---|---|
| Tạo parent epic design docs từ epic PRD | `/tdk-epic-hld feat-001` |
| Biến epic PRD + HLD thành child spec seeds | `/tdk-task-breakdown feat-001` |
| Build implementation plan trực tiếp | `/tdk-plan feat-001` |
| Bắt đầu implement sau khi có plan | `/tdk-implement feat-001` |
