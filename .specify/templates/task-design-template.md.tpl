# Task Design: [TASK NAME]

**Task ID**: `[TASK-###]`
**Requirement**: `[Link or path to task-requirement file]`
**Type**: `[Page | API Endpoint | Batch Job]`
**Feature Branch**: `[feature/branch-name]`
**Created**: [DATE]
**Status**: `[Draft | Ready | In Progress | Done]`
**Author**: [NAME]
**Reviewer**: [NAME]

---

## 1. Design Overview

### Approach

[One paragraph: HOW this task will be implemented — key technical decisions, patterns used, and why this approach was chosen over alternatives.]

### Constitution Check

*GATE: Must pass before writing any implementation code.*

- [ ] **YAGNI**: Implements only what the requirement specifies — no speculative additions
- [ ] **KISS**: Simplest viable solution; no unnecessary abstraction
- [ ] **DRY**: No duplicated logic (extracts shared code only when 3+ callsites exist)
- [ ] **Coding Standards**: Follows sub-workspace `rules/coding/coding-convention.md`
- [ ] **Structure Integrity**: All new files placed in correct directories per `rules/coding/structure.md`
- [ ] **Quality Gates**: Will pass `yarn type-check` (FE) / `composer lint-check` (BE)
- [ ] **No Hardcoded Values**: HTTP codes use constants, messages use i18n keys / `__('messages.key')`
- [ ] **Tests Planned**: Unit + integration tests identified in Section 6

**Deviations** (document only if any check above is intentionally not met):

| Rule | Deviation | Justification |
|------|-----------|---------------|
| [Rule name] | [What was deviated] | [Why it is acceptable here] |

---

## 2. Affected Files

<!--
  List every file that will be CREATED or MODIFIED.
  This section is the implementation contract — reviewers check this first.
-->

### New Files

| File Path | Purpose |
|-----------|---------|
| `[path/to/NewFile.php]` | [What this file does] |
| `[path/to/NewComponent.vue]` | [What this file does] |

### Modified Files

| File Path | Change Summary |
|-----------|---------------|
| `[path/to/ExistingFile.php]` | [What is being changed and why] |
| `[path/to/routes/api_role.php]` | [e.g., Register new route] |

---

## 3. Type-Specific Design

<!--
  Fill in ONLY the section matching your task type. Delete the other two.
-->

---

### [TYPE A] Page Design

> Delete this section if task type is NOT a Page.

#### Routing & Layout

| Field | Value |
|-------|-------|
| Route | `[/role/resource]` |
| Route Helper | `[RouteHelper.roleResource()]` — generated via `yarn gen:routes` |
| Layout | `[default \| admin \| candidate \| company \| public]` |
| Page File | `frontend/app/pages/[role]/[resource].vue` |
| SSR | `Yes / No` |

#### Component Tree

```
pages/[role]/[resource].vue          – Page entry; owns data fetching
├── components/[Role]/[Resource]/
│   ├── [ResourceHeader].vue         – [e.g., title, action buttons]
│   ├── [ResourceTable].vue          – [e.g., data table with pagination]
│   │   └── [ResourceTableRow].vue   – [e.g., single row with inline actions]
│   ├── [ResourceForm].vue           – [e.g., create/edit modal form]
│   └── [ResourceFilter].vue         – [e.g., search & filter bar]
```

#### State Design (Pinia)

```typescript
// stores/[resource]Store.ts  (create only if state is shared across components)
interface [Resource]State {
  list: [Resource][]
  detail: [Resource] | null
  pagination: Pagination
  filters: [Resource]Filters
  loading: boolean
  error: string | null
}
```

> Use local `ref`/`reactive` inside the page if state is NOT shared.

#### Composables

| Composable | File | Responsibility |
|------------|------|---------------|
| `use[Resource]` | `composables/use[Resource].ts` | [Data fetch, CRUD actions, state management] |
| `use[Resource]Form` | `composables/use[Resource]Form.ts` | [Form state, validation, submit handler] |

#### API Integration

| Action | Composable Method | Endpoint | Notes |
|--------|------------------|----------|-------|
| Fetch list | `fetch[Resource]List()` | `GET /api/[role]/[resource]` | Paginated, filter params |
| Fetch detail | `fetch[Resource]Detail(id)` | `GET /api/[role]/[resource]/{id}` | Called on mount |
| Create | `create[Resource](payload)` | `POST /api/[role]/[resource]` | Refreshes list on success |
| Update | `update[Resource](id, payload)` | `PUT /api/[role]/[resource]/{id}` | — |
| Delete | `delete[Resource](id)` | `DELETE /api/[role]/[resource]/{id}` | Confirm dialog first |

#### TypeScript Types

```typescript
// types/[resource].ts
interface [Resource] {
  id: number
  // ... fields from API response
  created_at: string
  updated_at: string
}

interface [Resource]Filters {
  search?: string
  // ... filter fields
}

interface Create[Resource]Payload {
  // ... create fields
}
```

#### i18n Key Mapping

| UI Element | i18n Key |
|------------|---------|
| Page title | `[feature].[screen].title` |
| [Button label] | `[feature].[screen].[action]` |
| [Field label] | `[feature].[screen].[field]` |
| [Validation error] | `validation.[field].[rule]` |

---

### [TYPE B] API Endpoint Design

> Delete this section if task type is NOT an API endpoint.

#### Layer Design

```
[Role]Controller::methodName()
  └── [Resource]Service::methodName(payload)
        ├── [Resource]Repository::queryOrMutateMethod()
        │     └── [Resource] Model
        ├── [AnotherRepository] (if cross-entity)
        └── [SideEffect]: Event / Job dispatch (if any)
```

#### Class Signatures

**Controller** — `App\Http\Controllers\[Role]\[Resource]Controller`

```php
// routes/api_[role].php registration:
// Route::post('[resource]', [[Resource]Controller::class, 'methodName'])->middleware(['auth:sanctum', 'role:[role]']);

public function methodName([Action]Request $request): JsonResponse
{
    // 1. Authorize via policy (if ownership check needed)
    // 2. Delegate to service
    // 3. Return response via ResponseTrait
}
```

**FormRequest** — `App\Http\Requests\[Role]\[Resource]\[Action]Request`

```php
public function rules(): array
{
    return [
        'field_name' => ['required', 'string', 'max:255'],
        'another_field' => ['required', 'integer'],
        'optional_field' => ['nullable', 'string'],
    ];
}
```

**Service** — `App\Services\[Resource]Service`

```php
public function methodName([Action]Request $request): [Resource]
{
    // Business logic, orchestration, BussinessException throws
}
```

**Repository** — `App\Repositories\[Resource]Repository`

```php
public function queryOrMutateMethod(array $filters): Collection|LengthAwarePaginator
{
    // Eloquent queries, filter application via ModelFilter
}
```

#### ModelFilter (if list endpoint)

```php
// App\ModelFilters\[Resource]Filter
// Applied via: $this->model->filter($request->all())
public function search(string $value): Builder { ... }
public function sortBy(string $column): Builder { ... }
```

#### Event / Job Side Effects

| Trigger | Class | Queue | Purpose |
|---------|-------|-------|---------|
| After create | `[Resource]Created::class` | `[queue]` | [e.g., Send notification email] |
| After update | `[Resource]Updated::class` | `[queue]` | [e.g., Invalidate cache] |

---

### [TYPE C] Batch Job Design

> Delete this section if task type is NOT a Batch/Queue Job.

#### Class Design

**Job Class** — `App\Jobs\[JobName]`

```php
class [JobName] implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = [seconds];
    public int $tries = [number];
    public int $backoff = [seconds]; // retry delay

    public function __construct(
        // inject only the minimum data needed (IDs, not full models)
        private readonly int $[paramId],
    ) {}

    public function handle([Resource]Service $service): void
    {
        // Orchestrate via service; no direct DB access here
    }
}
```

**Service Method** — `App\Services\[Resource]Service::processJob()`

```php
public function processJob(int $paramId): void
{
    // 1. Fetch data in chunks (chunkById / lazy)
    // 2. Process each record
    // 3. Mark as processed (idempotency flag)
    // 4. Log result
}
```

#### Processing Flow

```
[Trigger: Schedule / Event / API call]
  └── [JobName]::dispatch($param)
        └── [Resource]Service::processJob($param)
              ├── Fetch: [Resource]::query()->where(...)->chunkById(N, fn)
              ├── Per chunk:
              │   ├── Skip already-processed records (idempotency check)
              │   ├── Transform / compute
              │   └── Persist result
              └── Log: info('[JobName] completed', ['processed' => $count])
```

#### Idempotency Strategy

| Mechanism | Implementation |
|-----------|---------------|
| [e.g., Status flag] | [e.g., `processed_at IS NULL` guard; set to `now()` after success] |
| [e.g., Unique index] | [e.g., Unique constraint on `(job_run_date, resource_id)`] |

#### Schedule Registration

```php
// App\Console\Kernel.php  (or routes/console.php in Laravel 11)
$schedule->job(new [JobName]($param))->[daily()->at('02:00') | everyFifteenMinutes()];
```

---

## 4. Data Flow / Sequence

<!--
  Describe the end-to-end data flow as a numbered sequence or ASCII diagram.
  Keep it short — focus on non-obvious handoffs and state changes.
-->

### Happy Path

```
[Actor / Trigger]
  1. [Action: e.g., User submits form]
  2. [FE: composable method called → POST /api/role/resource]
  3. [BE: FormRequest validates → Controller delegates to Service]
  4. [Service: applies business rules → Repository persists]
  5. [Side effect: Event fired → Listener sends notification]
  6. [BE: Returns 201 JSON response]
  7. [FE: Success toast shown → list refreshed]
```

### Error Path

```
[Actor / Trigger]
  1. [Action that produces an error]
  2. [Where the error is detected: FormRequest / Service / Repository]
  3. [Error type: ValidationException / BussinessException / 500]
  4. [BE response: HTTP code + error payload]
  5. [FE: Error banner / field error displayed]
```

---

## 5. Schema Changes

<!--
  Delete this section if no DB migration is required.
-->

### Migration: `[timestamp]_[description].php`

```php
Schema::create('[table_name]', function (Blueprint $table) {
    $table->id();
    $table->string('[column]', 255);
    $table->unsignedBigInteger('[fk_column]');
    $table->timestamp('processed_at')->nullable();
    $table->timestamps();

    $table->foreign('[fk_column]')->references('id')->on('[parent_table]');
    $table->index(['[query_column]', '[sort_column]']); // covers expected query pattern
});
```

### Model Fillable / Casts

```php
// App\Models\[Resource]
protected $fillable = ['field', 'another_field'];
protected $casts = ['processed_at' => 'datetime'];
```

---

## 6. Test Design

### Unit Tests

| Scenario | Class Under Test | Method | Mock / Stub |
|----------|-----------------|--------|-------------|
| Happy path | `[Service]` | `methodName()` | Repository returns fixture |
| Business rule violation | `[Service]` | `methodName()` | Repository returns edge case |
| Validation rules | `[FormRequest]` | `rules()` | — |

### Integration / Feature Tests (API)

```php
// tests/Feature/[Role]/[Resource]Test.php

public function test_authenticated_[role]_can_[action]_[resource](): void { ... }
public function test_unauthenticated_request_returns_401(): void { ... }
public function test_forbidden_role_returns_403(): void { ... }
public function test_validation_failure_returns_422(): void { ... }
```

### Frontend Component Tests

```typescript
// tests/components/[Role]/[Resource]/[ResourceComponent].test.ts

it('renders skeleton while loading', ...)
it('renders records after data resolves', ...)
it('shows empty state when list is empty', ...)
it('shows error banner on API failure', ...)
```

---

## 7. Implementation Notes

<!--
  Capture decisions, gotchas, and non-obvious implementation details
  that a developer needs to know BEFORE writing code.
  Delete items that are not applicable.
-->

- **[Decision]**: [e.g., Using `lazy()` instead of `chunk()` to reduce memory on large datasets]
- **[Gotcha]**: [e.g., The `processed_at` column must be set atomically to avoid race conditions with parallel workers]
- **[Constraint]**: [e.g., MinIO presigned URLs expire in 1 hour — do not cache beyond that]
- **[Pattern reference]**: [e.g., Follow the same pattern as `App\Jobs\SendNotificationJob` for queue retry config]

---

## 8. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [DATE] | [Name] | Initial design |
