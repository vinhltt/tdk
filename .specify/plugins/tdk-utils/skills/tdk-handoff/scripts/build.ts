import { join } from 'node:path';

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, 'handoff-export.ts')],
  outdir: import.meta.dir,
  target: 'bun',
  format: 'esm',
  plugins: [{
    name: 'pinned-handoff-dependencies',
    setup(build) {
      // Shared source must use this build's exact pins, not a second central copy.
      build.onResolve({ filter: /^(commander|yaml|zod)$/ }, ({ path }) => ({
        path: Bun.resolveSync(path, import.meta.dir),
      }));
    },
  }],
});
if (!result.success) throw new AggregateError(result.logs, 'Handoff bundle build failed');
console.log(`Built handoff-export.js (${result.outputs[0]!.size} bytes)`);
