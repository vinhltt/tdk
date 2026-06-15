# Test Code Patterns — Reference

Patterns for generating `.api.spec.ts` files from `*.testcases.md`.

---

## Spec File Structure

```typescript
import { test, expect } from '@playwright/test';
import { getAuthToken, authHeaders } from '../setup/auth.setup';
import inputData from './input.json';
import expectedOutput from './output.json';

test.describe('POST /api/users', () => {
  // Shared state for CRUD lifecycle within this describe block
  let createdId: string;

  // Tests run sequentially within describe (CRUD lifecycle order)
  test.describe.configure({ mode: 'serial' });

  // --- Happy Path ---

  test('TC-001: create user with valid data', async ({ request }) => {
    const token = await getAuthToken('admin');
    const res = await request.post('/api/users', {
      data: inputData.createUser,
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.email).toBe(expectedOutput.createUser.email);
    createdId = body.id;
  });

  // --- Validation ---

  test('TC-002: missing required email field', async ({ request }) => {
    const token = await getAuthToken('admin');
    const { email, ...withoutEmail } = inputData.createUser;
    const res = await request.post('/api/users', {
      data: withoutEmail,
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(422);
  });

  // --- Auth ---

  test('TC-010: no auth token returns 401', async ({ request }) => {
    const res = await request.post('/api/users', {
      data: inputData.createUser,
    });
    expect(res.status()).toBe(401);
  });

  // --- Teardown ---

  test.afterAll(async ({ request }) => {
    if (createdId) {
      const token = await getAuthToken('admin');
      await request.delete(`/api/users/${createdId}`, {
        headers: authHeaders(token),
      });
    }
  });
});
```

---

## Mapping Rules: Testcase Table -> test() Block

| Testcase Column | Maps To |
|-----------------|---------|
| TC-ID | Comment: `// TC-001` and test name prefix |
| Description | `test('TC-001: {description}', ...)` |
| Steps | Sequential statements within test body |
| Expected Status | `expect(res.status()).toBe({status})` |
| Expected Response | `expect(body).toHaveProperty(...)` or `expect(body.field).toBe(...)` |
| Expected Error | `expect(body.message).toContain(...)` or `expect(body.errors).toBeDefined()` |
| Body/Params | `data: inputData.{key}` or inline object |
| Auth | `headers: authHeaders(token)` or omit for no-auth tests |

---

## CRUD Lifecycle Pattern

When a describe block covers a resource with multiple CRUD operations:

```typescript
test.describe('Users CRUD', () => {
  let userId: string;

  test.describe.configure({ mode: 'serial' });

  test('TC-001: create user', async ({ request }) => {
    // ... POST /api/users
    userId = body.id;
  });

  test('TC-002: get created user', async ({ request }) => {
    const res = await request.get(`/api/users/${userId}`, { ... });
    expect(res.status()).toBe(200);
  });

  test('TC-003: update user', async ({ request }) => {
    const res = await request.put(`/api/users/${userId}`, { ... });
    expect(res.status()).toBe(200);
  });

  test('TC-004: delete user', async ({ request }) => {
    const res = await request.delete(`/api/users/${userId}`, { ... });
    expect(res.status()).toBe(200);
  });
});
```

---

## Externalized Test Data Pattern

### input.json (per resource directory)
```json
{
  "createUser": {
    "email": "test@example.com",
    "name": "Test User",
    "password": "SecurePass123!"
  },
  "updateUser": {
    "name": "Updated User"
  },
  "invalidUser": {
    "email": "not-an-email",
    "name": ""
  }
}
```

### output.json (per resource directory)
```json
{
  "createUser": {
    "email": "test@example.com",
    "name": "Test User"
  },
  "listUsers": {
    "minLength": 1
  }
}
```

### Usage in spec
```typescript
import inputData from './input.json';
import expectedOutput from './output.json';

// Use: inputData.createUser, expectedOutput.createUser.email
```

---

## List Endpoint Pattern

```typescript
test('TC-005: list users returns paginated results', async ({ request }) => {
  const token = await getAuthToken('admin');
  const res = await request.get('/api/users', {
    params: { page: 1, per_page: 10 },
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.data.length).toBeGreaterThanOrEqual(expectedOutput.listUsers.minLength);
});
```

---

## Error Response Pattern

```typescript
test('TC-015: not found returns 404', async ({ request }) => {
  const token = await getAuthToken('admin');
  const res = await request.get('/api/users/nonexistent-id', {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(404);
});
```
