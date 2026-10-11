import { join } from 'node:path';

// review-scope pulls in zod, yaml and (through git-map) their pins: resolve them from this build's node_modules,
// not from scripts/ts, so the bundle uses exactly the versions in package.json/bun.lock.
for (const name of ['review-write-report', 'review-scope']) {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, `${name}.ts`)],
    outdir: import.meta.dir,
    target: 'bun',
    format: 'esm',
    plugins: [{
      name: 'pinned-review-dependencies',
      setup(build) {
        build.onResolve({ filter: /^(yaml|zod)$/ }, ({ path }) => ({ path: Bun.resolveSync(path, import.meta.dir) }));
      },
    }],
  });
  if (!result.success) throw new AggregateError(result.logs, `${name} bundle build failed`);
  console.log(`Built ${name}.js (${result.outputs[0]!.size} bytes)`);
}
