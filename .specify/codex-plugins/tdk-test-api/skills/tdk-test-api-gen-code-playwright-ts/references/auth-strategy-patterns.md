# Auth Strategy Patterns — Reference

Code templates for `auth.setup.ts` generation, selected by `test.api.authStrategy` in `.specify.json`.

---

## Bearer Token Strategy

```typescript
// setup/auth.setup.ts — Bearer token from env var
export async function getAuthToken(role: string = 'default'): Promise<string> {
  const envKey = `API_TOKEN_${role.toUpperCase()}`;
  const token = process.env[envKey] || process.env.API_TOKEN;
  if (!token) {
    throw new Error(`Auth token not found. Set ${envKey} or API_TOKEN env var.`);
  }
  return token;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
```

---

## Session / Cookie Strategy (storageState)

```typescript
// setup/auth.setup.ts — Login + storageState persistence
import { test as setup } from '@playwright/test';

const AUTH_FILE = 'playwright/.auth/user.json';

setup('authenticate', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || 'password',
    },
  });

  if (response.status() !== 200) {
    throw new Error(`Login failed with status ${response.status()}`);
  }

  await request.storageState({ path: AUTH_FILE });
});

// In playwright.config.ts, use:
// projects: [
//   { name: 'setup', testMatch: '**/setup/*.setup.ts' },
//   { name: 'tests', dependencies: ['setup'],
//     use: { storageState: 'playwright/.auth/user.json' } },
// ]
```

---

## API Key Strategy

```typescript
// setup/auth.setup.ts — API key from env var
export function getApiKey(): string {
  const key = process.env.API_KEY;
  if (!key) {
    throw new Error('API_KEY env var not set.');
  }
  return key;
}

export function apiKeyHeaders(): Record<string, string> {
  return { 'X-API-Key': getApiKey() };
}

// Alternative: query parameter
export function apiKeyParams(): Record<string, string> {
  return { api_key: getApiKey() };
}
```

---

## No Auth Strategy

```typescript
// setup/auth.setup.ts — No auth required (public API)
export async function getAuthToken(_role?: string): Promise<string> {
  return ''; // No auth needed
}

export function authHeaders(_token?: string): Record<string, string> {
  return {}; // No auth headers
}
```

---

## Usage in Spec Files (All Strategies)

```typescript
import { getAuthToken, authHeaders } from '../setup/auth.setup';

test('TC-001: create resource', async ({ request }) => {
  const token = await getAuthToken('admin');
  const res = await request.post('/api/resource', {
    data: inputData.create,
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(201);
});
```
