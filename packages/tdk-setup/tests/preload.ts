import { afterAll } from 'bun:test';
import { cleanupConsumers } from './fixtures';

// Fixture roots are mkdtemp'd per consumer and were never removed, leaving thousands
// of /tmp/tdk-* directories behind. Registered here so all test files inherit it.
afterAll(cleanupConsumers);
