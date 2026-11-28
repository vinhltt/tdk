# Scenario: Brownfield Project Bootstrap

> **Dùng khi**: Một repository có sẵn chưa có project knowledge nào của TDK, và
> ngay sau khi cài TDK bạn muốn có onboarding, architecture recovery, workspace
> layout, config, memory domain, constitution, sub-workspace docs và một
> `AGENTS.md` ở root chỉ bằng một lệnh, rồi review kết quả sau.

Scenario này cover đường chạy bằng một lệnh:

```text
install TDK
-> /tdk-project-bootstrap
-> review project-bootstrap-report.md
-> commit
-> /tdk-specify
-> /tdk-plan
```

`/tdk-project-bootstrap` chạy chain này thay bạn và bỏ qua mọi bước đã có
output:

```text
/tdk-brownfield-start --full
-> /tdk-architecture-advisor --recover-existing
-> /tdk-workspace-layout-propose --from-existing
-> config gate, câu hỏi duy nhất
-> /tdk-memory-init với các domain được suy ra
-> /tdk-constitution --init --auto
-> /tdk-sub-workspace-bootstrap, hoặc /tdk-sub-workspace-docs khi không có tdk-scaffold
-> AGENTS.md ở root và CLAUDE.md làm cầu nối
```

Chạy command này chính là đồng ý tạo mọi artifact còn thiếu mà nó phụ trách.
Bản thân nó không bao giờ sửa, ghi đè hay xóa byte đã có; ngoại lệ duy nhất là
lần config apply bạn xác nhận ở gate và việc ghi lại report của chính nó. Các
child skill vẫn giữ quy tắc ghi riêng của chúng. Khi một child skill lẽ ra sẽ
hỏi, command chọn nhánh không ghi gì và đưa mục đó vào `## Needs your review`
trong report.

Với repository mới chưa có code, cùng command này nhận một brief; xem đường
chạy bằng một lệnh trong
[Greenfield Full Start](10-greenfield-full-start-architecture-topology.md#chạy-bằng-một-lệnh).

## Prerequisites

- Quá trình cài harness đã phân giải thành bộ base gắn kết gồm `tdk-core`,
  `tdk-inception`, `tdk-memory`, và `tdk-utils`. `/tdk-project-bootstrap` thuộc
  `tdk-inception`.
- Nên cài `tdk-scaffold`. Khi có plugin này, bước sub-workspace chạy
  `/tdk-sub-workspace-bootstrap`; nếu không có, bước đó chỉ ghi sub-workspace
  docs bằng `/tdk-sub-workspace-docs`.
- Có `bun` trên `PATH`. Nếu thiếu, command dừng lại với gợi ý cài đặt trước khi
  ghi bất cứ thứ gì.
- Có `repomix` trên `PATH` cho bước sub-workspace. Khi thiếu, report cảnh báo,
  bước sub-workspace bị bỏ qua, và report đưa ra `npm install -g repomix` cùng
  lệnh chạy lại. Xem mục Prerequisites trong
  [Setup Guide](../setup/setup-guide.md).
- Tùy chọn: chạy `/tdk-scout --scope <repo-root> --task-hint "brownfield onboarding"`
  trước. Command không chạy scout; onboarding đọc scout report gần đây như một
  nguồn evidence.

## Chuỗi Command Đề Xuất

```text
/tdk-project-bootstrap
```

Trả lời câu hỏi config nếu nó xuất hiện, rồi đọc
`.specify/configurations/inception/project-bootstrap-report.md`, bắt đầu từ
`## Needs your review`. Commit, rồi bắt đầu feature đầu tiên:

```text
/tdk-specify feat-001 "Feature description"
/tdk-plan feat-001
```

## Output Map

| Step | Chạy khi | Primary output | Có hỏi? |
|---|---|---|---|
| Preflight | Mọi lần chạy | `.specify/.specify.json` chỉ được tạo khi chưa có cả `.specify/.specify.json` lẫn `.specify/.specify.yaml`; report | Không |
| `/tdk-brownfield-start --full` | Chưa có onboarding report từ `--full`, hoặc `Readiness Status` của nó là `not-ready` | `.specify/configurations/inception/brownfield-onboarding.md` | Không; các câu hỏi của nó thành unresolved question với confidence Low |
| `/tdk-architecture-advisor --recover-existing` | Chưa có recovery report | `.specify/configurations/architecture/architecture-recovery.md`; không bao giờ ghi `architecture-decision.md` | Không |
| `/tdk-workspace-layout-propose --from-existing` | Chưa có proposal JSON | `.specify/configurations/workspace-layout/workspace-layout-proposal.json` và `.md` | Không |
| Config gate | Đã có proposal chứa sub-workspace; chỉ hỏi khi dry-run diff không phải ` no changes` và plan apply-eligible | `.specify/.specify.json` đã cập nhật, `topology-apply-report.md`, backup | Có |
| `/tdk-memory-init` | Memory Status Block chưa liệt kê domain nào; bỏ qua khi bảng domain là `unknown` hoặc status là lỗi, khi đó constitution cũng bị bỏ qua | Memory root với các domain được suy ra | Không; memory root nằm ngoài repository có thể thêm một lần xin đồng ý của chính tdk-memory |
| `/tdk-constitution --init --auto` | Status Block không ghi `constitution: present` | `<memory root>/constitution.md`, `arc42/README.md`, 12 arc42 summary, typed memory file khi có evidence | Không |
| Sub-workspaces | Config đã apply có `subWorkspaces[]` không rỗng và có ít nhất một path đã tồn tại | Artifact của `/tdk-sub-workspace-bootstrap` và `bootstrap-report.md` của nó, hoặc chỉ docs khi không có `tdk-scaffold` | Không |
| `AGENTS.md` | Lần chạy không bị halt; `AGENTS.md` chỉ được ghi khi root chưa có | `AGENTS.md`; `CLAUDE.md` chứa `@AGENTS.md` khi đã có `AGENTS.md` và chưa có cả `CLAUDE.md` lẫn `.claude/CLAUDE.md` | Không |
| Report | Mọi lần chạy | `.specify/configurations/inception/project-bootstrap-report.md` | Không |

## Step-By-Step Gates

### 1. Cài đặt

Cài TDK theo ba bước: copy payload `.specify/` vào repository bằng
`distribute.sh` từ một TDK source checkout, chạy `bash .specify/setup.sh` trong
repository, rồi chạy harness install.
[Setup Guide](../setup/setup-guide.md) hướng dẫn hai bước cuối. Khi cài
harness, thêm `tdk-scaffold` vào danh sách plugin tùy chọn:

```bash
# from packages/tdk-setup in the TDK source checkout
CONSUMER_ROOT=/path/to/sample
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-scaffold --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-scaffold --yes
```

Chỉ tiếp tục khi Claude Code, mở tại repository root, có liệt kê
`/tdk-project-bootstrap`.

Khi setup báo không tìm thấy `.specify/.specify.json`, đừng copy
`.specify/.specify.json.example`: file này chứa các sub-workspace mẫu. Command
tự tạo một config tối thiểu khi chưa có config JSON hay YAML nào.

### 2. Chạy command

```text
/tdk-project-bootstrap
```

Mode là brownfield khi có code hoặc package manifest nằm ngoài các folder của
TDK, công cụ và docs, ví dụ `.specify/`, `.claude/`, `.git/`, `node_modules/`,
và `docs/`. Truyền `--brownfield` hoặc `--greenfield` để ghi
đè; lần chạy lại dùng lại mode đã ghi trong report. Brownfield bỏ qua brief và
`--quick`, và report có ghi điều đó.

Một bước bị lỗi được ghi lại cùng cách sửa và không làm dừng các bước sau không
phụ thuộc vào nó. Khi onboarding kết thúc ở `not-ready`, command liệt kê các mục
còn thiếu rồi halt, và lần chạy tiếp theo sẽ chạy lại onboarding. Hãy xử lý các
khoảng trống đó trong repository hoặc README, không sửa trong onboarding report:
onboarding tự tạo lại report của nó.

**Halt** nghĩa là mọi bước còn lại cho tới hết bước `AGENTS.md` đều bị bỏ qua,
nên onboarding `not-ready` cũng dừng luôn các bước architecture, layout và config;
report vẫn được ghi, và command in ra:

```text
Next: fix the listed items, then rerun /tdk-project-bootstrap
```

### 3. Config gate

Command preview thay đổi config bằng topology dry-run. Gate này là câu hỏi duy
nhất mà command đặt ra. Câu hỏi liệt kê từng sub-workspace được đề xuất với
tên, path và confidence, cùng mọi confirmation finding. Các lựa chọn là:

- `Apply`
- `Stop to edit the proposal`

Khi có confirmation finding, ví dụ ghi đè cùng tên, đổi architecture type, hoặc
trùng path sau khi chuẩn hóa, lựa chọn apply duy nhất là
`Apply including overwrites`. Mọi câu trả lời khác đều tính là Stop. Nếu config
thay đổi giữa lúc preview và lúc apply, command preview và hỏi thêm một lần; lần
plan bị stale thứ hai tính là Stop.

Không có câu hỏi khi:

- dòng cuối của dry-run diff đúng là ` no changes`: config đã được apply, và
  lần chạy tiếp tục;
- không có proposal JSON, chỉ có `.specify/.specify.yaml`, hoặc proposal có
  `subWorkspaces[]` rỗng: config và bước sub-workspace bị bỏ qua, và lần chạy
  vẫn tiếp tục. Với mảng rỗng,
  report ghi `architecture.type` của proposal là chưa apply và đưa ra
  `/tdk-workflow-config-apply` để apply thủ công; khi chỉ có YAML, report liệt
  kê việc migrate YAML sang JSON;
- dry-run lỗi hoặc proposal không apply-eligible: config và bước sub-workspace
  bị bỏ qua, report ghi lý do, và lần chạy vẫn tiếp tục.

Mỗi khi config bị bỏ qua vì lý do khác với `subWorkspaces[]` rỗng, `AGENTS.md`
và constitution của lần chạy đó sẽ không có sub-workspace. Khi đó report nhắc xóa
`AGENTS.md` đó rồi chạy lại sau khi đã apply config, và cập nhật constitution bằng
`/tdk-constitution`.

Chỉ khi chọn Stop, khi apply lỗi (lỗi validation, lock hoặc backup), hoặc khi
command không thể hỏi (chạy headless hoặc trong subagent), nó ghi tóm tắt gate cùng các lựa chọn vào report, liệt kê proposal và
các file evidence của nó, rồi halt. Sửa proposal, rồi chạy lại command.

### 4. Đọc report và sửa sau

Mở `.specify/configurations/inception/project-bootstrap-report.md`:

- `## Needs your review` đứng đầu.
- Tiếp theo là mode, và mỗi bước một dòng với outcome, đường dẫn và timestamp
  ISO-8601.
- `## How to add a sub-workspace later`.
- `## Rollback`.

Một mục rời khỏi `## Needs your review` khi bạn xóa nó hoặc lần chạy lại thấy nó
không còn áp dụng. Xử lý lần lượt các mục:

- **Quyết định ở gate và confidence của recovery.** Kiểm tra confidence và các
  unresolved question của `architecture-recovery.md`, cùng mọi thay đổi
  desired-state mà proposal markdown giữ ngoài JSON.
- **Memory domain được suy ra.** Command suy ra business domain từ onboarding
  report, README và docs, rồi truyền chúng cho `/tdk-memory-init` với
  `provenance: inferred`. Business domain là một khái niệm nghiệp vụ mà nguồn
  có nêu tên, ví dụ orders hay billing. Việc code làm về mặt kỹ thuật thì không
  phải domain, nên một thư viện hay tool thuần kỹ thuật không có domain nào. Tên
  package, tên folder và tên sub-workspace không bao giờ được dùng làm tên
  domain. Sửa một domain bằng cách chỉnh overview của nó dưới
  `memory_path` mà `/tdk-memory-query --status` in ra, hoặc bằng
  `/tdk-memory-update`. Các domain block không qua được bước kiểm tra được liệt
  kê thay vì được truyền đi; khi không còn domain nào, report đưa ra
  `/tdk-memory-init` làm bước thủ công.
- **Constitution.** `/tdk-constitution --init --auto` không hỏi gì. Nó giữ quyền
  authority của constitution và memory khi xung đột với README và liệt kê từng
  xung đột cùng nguồn của nó, liệt kê thay đổi template ở trạng thái pending mà
  không sửa `.specify/templates/`, và ghi `TODO(RATIFICATION_DATE)` khi chưa
  biết ngày thông qua. Cập nhật sau bằng `/tdk-constitution`.
- **`AGENTS.md`.** Chỉ được tạo khi root chưa có; file đã có không bao giờ bị
  đụng tới, và report ghi `kept`. File mô tả project, không phải TDK workflow:
  mục đích và cấu trúc, bảng sub-workspace, các lệnh build, test, lint và run
  đọc từ package manifest hoặc CI config với confidence High, các convention
  quan sát được kèm nguồn, và `## Where knowledge lives`. Report đánh dấu `thin`
  khi file không có dòng command nào lẫn dòng sub-workspace nào. Cứ sửa tự do;
  lần chạy lại giữ nguyên file.
- **Cầu nối `CLAUDE.md`.** Khi đã có `AGENTS.md`, dù vừa tạo hay được giữ
  nguyên, và chưa có cả `CLAUDE.md` lẫn `.claude/CLAUDE.md`, command tạo `CLAUDE.md` chứa đúng một dòng `@AGENTS.md`, để Claude Code nạp
  `AGENTS.md`. Nó không bao giờ dùng symlink. File đã có được giữ nguyên; nếu
  file đó không có dòng `@AGENTS.md`, report gợi ý thêm dòng import đó.
- **Mục OMP.** Khi có `.omp/` và lần chạy này đã tạo `CLAUDE.md`, report liệt kê
  lệnh sau để chạy bằng setup CLI của một TDK source checkout:

  ```text
  bun "<resolved-source-cli>" convert-flat "<consumer-root>" --harness omp --parts context --yes
  ```

  Khi không có source checkout, hoặc không có `tdk-scaffold`, report in ra điều
  kiện tiên quyết thay cho lệnh. `.omp/AGENTS.md` chỉ được tạo khi root có
  `CLAUDE.md` và part `context` được chọn.
- **Sub-workspaces.** Khi có `tdk-scaffold`, report link tới section
  `## Needs your review` của
  `.specify/configurations/automation-recommendations/bootstrap-report.md`. Path
  đã configure nhưng chưa tồn tại được ghi là `deferred`. Khi chưa path nào tồn
  tại, như sau một layout greenfield mới, bước này không chạy, và report đưa ra
  `/tdk-sub-workspace-bootstrap` để chạy khi một folder đã có code.
- **Bước bị lỗi hoặc halt.** Mỗi bước đều kèm cách sửa.

Chạy lại sẽ tiếp tục từ chỗ dừng: mọi bước đều bỏ qua khi output của nó đã tồn
tại, và file đã sửa được dùng nguyên như vậy. Lần chạy lại không tự tạo lại các
file phía sau: muốn tạo lại một file, hãy xóa nó và mọi file sau nó trong chain
(onboarding, rồi `architecture-recovery.md`, rồi proposal JSON và md).

### 5. Commit

Command không có bước commit. Xem `git status` rồi commit các file nó đã tạo:
`.specify/.specify.json` được tạo hoặc apply, các report dưới
`.specify/configurations/`, `AGENTS.md`, `CLAUDE.md`, các file memory nằm trong
repository, và mọi thứ bước sub-workspace đã ghi.

```bash
git status
git add <reviewed paths>
git commit
```

Khi `/tdk-memory-query --status` báo `external: true`, memory nằm trong một
repository khác: commit ở đó bằng `git -C "<memoryRoot>"`.

### 6. Tiếp tục với một feature

Command kết thúc bằng:

```text
Next: review "Needs your review", then /tdk-plan
```

`/tdk-plan` cần một spec, nên feature đầu tiên bắt đầu bằng `/tdk-specify`:

```text
/tdk-specify feat-001 "Feature description"
/tdk-plan feat-001
```

Xem [Child Feature Implementation](01-child-feature-implementation.md) cho phần
còn lại của vòng feature.

### 7. Thêm sub-workspace sau này

Lần chạy lại không phát hiện sub-workspace mới. Hãy tự propose, apply và
bootstrap layout mới:

```text
/tdk-workspace-layout-propose --from-existing .specify/configurations/architecture/architecture-recovery.md
/tdk-workflow-config-apply
/tdk-sub-workspace-bootstrap
```

Ở greenfield mode, propose từ
`.specify/configurations/architecture/architecture-decision.md` và không kèm
`--from-existing`. Khi không có `tdk-scaffold`, thay lệnh cuối bằng
`/tdk-sub-workspace-docs --sub-workspace <name>`. Section
`## How to add a sub-workspace later` của report nhắc lại đường đi này.

### 8. Rollback

Làm theo section `## Rollback` của report:

- `.specify/.specify.json` do command tạo: xóa file đó;
- config đã apply: dùng các dòng `backupPath` và `manualRevert` trong
  `.specify/configurations/workspace-layout/topology-apply-report.md`;
- file trong repository: dùng git;
- memory nằm ngoài repository: dùng lịch sử của repository đó;
- bước sub-workspace: làm theo phần rollback trong report của chính nó.

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Command dừng với gợi ý cài đặt | Chưa cài `.specify/` hoặc không có `bun` trên `PATH` | Làm xong [Setup Guide](../setup/setup-guide.md), rồi chạy lại |
| Lần chạy halt sau onboarding | Onboarding vẫn `not-ready` | Xử lý các khoảng trống được liệt kê trong repository hoặc README, rồi chạy lại |
| Lần chạy halt ở config gate | Bạn chọn Stop, hoặc lần chạy không thể hỏi | Sửa proposal, rồi chạy lại trong session tương tác |
| Bước config và sub-workspace bị bỏ qua | Chỉ có `.specify/.specify.yaml` | Migrate YAML config sang JSON như report liệt kê, rồi chạy lại |
| Bước sub-workspace bị bỏ qua | Không có `repomix` hoặc `bun` trên `PATH` | `npm install -g repomix`, rồi chạy lại |
| Config apply bị lỗi | Lỗi validation, lock, hoặc backup | Đọc dòng lỗi trong report, xóa lock path mà dòng đó nêu nếu có, rồi chạy lại |
| Sub-workspace mới không được nhận | Lần chạy lại không phát hiện sub-workspace mới | Làm theo bước 7 |

## Next Commands

| Goal | Next command |
|---|---|
| Bắt đầu spec cho feature đầu tiên | `/tdk-specify feat-001 "Feature description"` |
| Build implementation plan sau khi có spec | `/tdk-plan feat-001` |
| Apply thay đổi layout thủ công | `/tdk-workflow-config-apply` |
| Cập nhật project authority | `/tdk-constitution` |

Cú pháp command và cost profile nằm trong
[skills guide](../skills-guide.md#project-inception-commands). Contract của
command là
[`tdk-project-bootstrap/SKILL.md`](../../../../plugins/tdk-inception/skills/tdk-project-bootstrap/SKILL.md).
