# Task Requirement: [TASK NAME]

**Task ID**: `[TASK-###]`
**Type**: `[Page | API Endpoint | Batch Job]`
**Feature Branch**: `[feature/branch-name]`
**Created**: [DATE]
**Status**: `[Draft | Ready | In Progress | Done]`
**Author**: [NAME]
**Reviewer**: [NAME]

---

## 1. Overview

### Purpose

[One paragraph: WHY this task exists, what problem it solves, and what business value it delivers.]

### Scope

- **In scope**: [What this task covers]
- **Out of scope**: [What is explicitly excluded — prevents scope creep]

### Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| [Task / Feature / API] | Upstream / Downstream | Done / In Progress / Planned | [Brief note] |

---

## 2. Type-Specific Requirements

<!--
  Fill in ONLY the section matching your task type. Delete the other two.
-->

---

### [TYPE A] Page Requirements

> Delete this section if task type is NOT a Page.

#### Page Identity

| Field | Value |
|-------|-------|
| Route | `/[role]/[resource]` e.g. `/admin/users` |
| Layout | `[default | admin | candidate | company | public]` |
| Auth Required | `Yes / No` |
| Roles Allowed | `[admin, company, candidate, public]` |
| SSR | `Yes / No` (default: No) |

#### UI / UX

- **Primary action**: [What the user comes here to do]
- **Entry points**: [How users reach this page — navbar, button, redirect, etc.]
- **Exit points**: [Where users go after completing the action]

#### Components & Layout

```
[Page Name]
├── [SectionComponent]           – [purpose]
│   ├── [ChildComponent]         – [purpose]
│   └── [ChildComponent]         – [purpose]
└── [SectionComponent]           – [purpose]
```

#### Data Requirements

| Data | Source | API Endpoint | Notes |
|------|--------|--------------|-------|
| [Resource list] | API | `GET /api/[resource]` | Paginated |
| [Detail] | API | `GET /api/[resource]/{id}` | On mount |

#### State & Interactions

| Interaction | Trigger | Expected Behavior |
|-------------|---------|-------------------|
| [Button click] | User | [What happens — API call, modal, redirect] |
| [Form submit] | User | [Validation → POST → success/error feedback] |
| [Pagination] | User | [Fetch next page, preserve filters] |

#### Validation Rules (client-side)

| Field | Rules | Error Message (i18n key) |
|-------|-------|--------------------------|
| [field_name] | required, max:255 | `validation.field_name.required` |
| [field_name] | email | `validation.field_name.email` |

#### Loading & Empty States

- **Loading**: [Skeleton / Spinner behavior]
- **Empty list**: [What to show when no data exists]
- **Error**: [What to show on API failure]

---

### [TYPE B] API Endpoint Requirements

> Delete this section if task type is NOT an API endpoint.

#### Endpoint Identity

| Field | Value |
|-------|-------|
| Method | `GET / POST / PUT / PATCH / DELETE` |
| Path | `/api/[role]/[resource]/{param}` |
| Auth | `Bearer token (Sanctum)` |
| Role Guard | `[admin, company, candidate, public]` |
| Controller | `App\Http\Controllers\[Role]\[Resource]Controller` |
| Route File | `routes/api_[role].php` |

#### Request

**Path Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes | Resource primary key |

**Query Parameters (GET):**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number |
| `per_page` | integer | No | 15 | Items per page |
| `search` | string | No | — | Full-text search keyword |
| `sort_by` | string | No | `created_at` | Sort column |
| `sort_dir` | enum | No | `desc` | `asc` or `desc` |

**Request Body (POST / PUT / PATCH):**

```json
{
  "field_name": "string (required, max:255)",
  "another_field": "integer (required)",
  "optional_field": "string (nullable)"
}
```

**FormRequest class**: `App\Http\Requests\[Role]\[Resource]\[Action]Request`

#### Response

**Success — HTTP 200 / 201:**

```json
{
  "data": {
    "id": 1,
    "field_name": "value",
    "created_at": "2026-01-01T00:00:00Z"
  },
  "message": "messages.[action]_success"
}
```

**Paginated list — HTTP 200:**

```json
{
  "data": [ { "id": 1, "..." : "..." } ],
  "meta": {
    "current_page": 1,
    "per_page": 15,
    "total": 100,
    "last_page": 7
  }
}
```

**Error responses:**

| HTTP Code | Constant | Scenario |
|-----------|----------|---------|
| 400 | `Response::HTTP_BAD_REQUEST` | Invalid input not caught by FormRequest |
| 401 | `Response::HTTP_UNAUTHORIZED` | Missing / expired token |
| 403 | `Response::HTTP_FORBIDDEN` | Insufficient role |
| 404 | `Response::HTTP_NOT_FOUND` | Resource not found |
| 422 | `Response::HTTP_UNPROCESSABLE_ENTITY` | FormRequest validation failed |
| 500 | `Response::HTTP_INTERNAL_SERVER_ERROR` | Unexpected server error |

#### Business Logic

1. [Step 1: e.g., Validate request via FormRequest]
2. [Step 2: e.g., Check ownership / policy via Gate::authorize]
3. [Step 3: e.g., Call Service method]
4. [Step 4: e.g., Service calls Repository for data access]
5. [Step 5: e.g., Return JSON response via ResponseTrait]

#### Layering

```
[Role]Controller
  └── [Resource]Service::methodName()
        └── [Resource]Repository::queryMethod()
              └── [Resource] Model
```

#### Side Effects

- [e.g., Fires `ResourceCreated` event → triggers email notification]
- [e.g., Invalidates cache key `resource:list`]
- [e.g., Dispatches `ProcessResource` queue job]

---

### [TYPE C] Batch Job Requirements

> Delete this section if task type is NOT a Batch/Queue Job.

#### Job Identity

| Field | Value |
|-------|-------|
| Class | `App\Jobs\[JobName]` |
| Queue | `[default | emails | notifications | heavy]` |
| Trigger | `[Schedule / Event / Manual dispatch / API call]` |
| Schedule | `[daily at 02:00 / every 15 minutes / on-demand]` |
| Timeout | `[seconds]` |
| Max Tries | `[number]` |
| Retry Delay | `[seconds]` |

#### Input / Parameters

| Parameter | Type | Source | Description |
|-----------|------|--------|-------------|
| `[param]` | [type] | [CLI arg / DB query / Event payload] | [Description] |

#### Processing Logic

1. [Step 1: Fetch data — define query / scope clearly]
2. [Step 2: Chunk processing — batch size: X records per chunk]
3. [Step 3: Core transformation / business operation]
4. [Step 4: Persist results]
5. [Step 5: Logging / reporting]

#### Chunk & Memory Constraints

- **Batch size**: [N records per chunk]
- **Memory limit**: [e.g., 256MB]
- **Estimated runtime**: [e.g., < 5 minutes for 100k records]

#### Error Handling

| Scenario | Behavior |
|----------|---------|
| Single record failure | [Skip + log / Retry / Fail job] |
| DB connection lost | [Auto-retry via Laravel retry mechanism] |
| Timeout exceeded | [Job marked failed, alert sent] |
| Partial completion | [Resume from last checkpoint / restart from scratch] |

#### Output & Reporting

- **Success**: [Log entry / DB status update / Notification sent]
- **Failure**: [Log entry / Alert channel / Dead-letter record]
- **Audit trail**: [Table / log file where results are persisted]

#### Idempotency

[Describe how running the job twice does NOT produce duplicate side effects. e.g., "Uses `processed_at` flag to skip already-handled records."]

---

## 3. Acceptance Criteria

<!--
  Written as Given-When-Then scenarios.
  Each scenario must be independently verifiable.
-->

### Scenario 1 — [Happy Path Title] (P1)

**Given** [initial system state]
**When** [actor performs action]
**Then** [expected outcome is observable]
**And** [secondary outcome, if any]

---

### Scenario 2 — [Error / Edge Case Title] (P1)

**Given** [initial system state]
**When** [actor performs invalid/edge action]
**Then** [system responds with specific error or fallback]

---

### Scenario 3 — [Permission / Auth Case] (P2)

**Given** [actor WITHOUT required role]
**When** [actor attempts restricted action]
**Then** [system denies with 403 / redirect / UI block]

---

[Add more scenarios as needed. P1 = blocking, P2 = important, P3 = nice-to-have]

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | [e.g., API p95 < 200ms / Page LCP < 2s / Batch < 10 min for 1M rows] |
| Security | [e.g., No PII in logs / Input sanitized / Auth enforced] |
| Scalability | [e.g., Must handle N concurrent users / N records] |
| Accessibility | [e.g., WCAG AA compliant / Keyboard navigable] |
| Localization | [e.g., All user-facing text uses i18n keys, supports ja/en/vi] |
| Logging | [e.g., Log all mutations with actor ID at INFO level] |
| Auditability | [e.g., All state changes recorded in audit_logs table] |

---

## 5. Data / Schema Impact

<!--
  Fill only if this task creates or modifies DB tables, columns, or indexes.
  Delete this section if there is no schema change.
-->

### New / Modified Tables

| Table | Change | Columns Added / Modified |
|-------|--------|--------------------------|
| `[table_name]` | CREATE / ALTER | `[column_name] [type] [constraints]` |

### Migration Notes

- [e.g., Data backfill required for existing rows]
- [e.g., Index required on `[column]` for expected query pattern]
- [e.g., Nullable first, enforce NOT NULL after backfill]

---

## 6. i18n Keys

<!--
  List all NEW i18n keys introduced by this task.
  Keys must exist in all supported locales: ja, en, vi.
-->

| Key | ja | en | vi |
|-----|----|----|----|
| `[feature].[key]` | [Japanese text] | [English text] | [Vietnamese text] |

---

## 7. Test Requirements

### Unit Tests

| Scenario | Class Under Test | Method |
|----------|-----------------|--------|
| [Happy path] | `[ServiceClass]` | `[methodName]` |
| [Validation failure] | `[FormRequest]` | `rules()` |
| [Edge case] | `[ServiceClass]` | `[methodName]` |

### Integration / Feature Tests (API only)

| Scenario | HTTP Method | Endpoint | Expected Status |
|----------|-------------|----------|-----------------|
| Authenticated success | `[METHOD]` | `/api/[role]/[resource]` | 200 / 201 |
| Unauthenticated | `[METHOD]` | `/api/[role]/[resource]` | 401 |
| Forbidden role | `[METHOD]` | `/api/[role]/[resource]` | 403 |
| Validation error | `[METHOD]` | `/api/[role]/[resource]` | 422 |
| Not found | `[METHOD]` | `/api/[role]/[resource]/{bad_id}` | 404 |

### Frontend Component Tests (Page only)

| Scenario | Component | What to assert |
|----------|-----------|----------------|
| Renders loading state | `[ComponentName]` | Skeleton visible before data resolves |
| Renders data | `[ComponentName]` | Records appear after API mock resolves |
| Empty state | `[ComponentName]` | Empty state message visible when list is empty |
| Error state | `[ComponentName]` | Error banner shown on API failure |

---

## 8. Open Questions

<!--
  Capture unresolved decisions. Each item must have an owner and a deadline.
-->

| # | Question | Owner | Deadline | Resolution |
|---|----------|-------|----------|------------|
| 1 | [Unresolved question] | [Name] | [DATE] | [Pending / Answer] |

---

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [DATE] | [Name] | Initial draft |
