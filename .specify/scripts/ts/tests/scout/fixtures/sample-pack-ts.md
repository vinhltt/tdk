# Repomix Output

This is a fixture pack for vitest.

================
File: src/index.ts
================
```typescript
import { foo } from './foo';
import bar from './bar';
import { z } from 'zod';

export const main = () => foo() + bar();
export function helper() { return 1; }
export class Service {}
```

================
File: src/foo.ts
================
```typescript
export const foo = () => 'foo';
export default function legacy() { return 0; }
```

================
File: src/bar.ts
================
```typescript
const local = 1;
export default function bar() { return 'bar'; }
```

================
File: src/utils/helpers.ts
================
```typescript
import { join } from 'node:path';
const internal = require('node:fs');
export type Helper = string;
export interface Opts { x: number }
```

================
File: src/utils/format.ts
================
```typescript
export { foo as renamedFoo } from './shared';
export const format = (x: string) => x.trim();
```
