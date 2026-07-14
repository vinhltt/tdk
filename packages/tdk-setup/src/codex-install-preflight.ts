import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { sha256File } from './checksum';
import { validateSafeSegment } from './install-settings-paths';

const ManifestEntrySchema = z.object({
  version: z.string().min(1),
  files: z.record(z.string().regex(/^[a-f0-9]{64}$/)).optional(),
}).passthrough();
const ManifestSchema = z.object({
  plugins: z.record(ManifestEntrySchema),
}).passthrough();

function readManifest(manifestPath: string, label: string): z.infer<typeof ManifestSchema> {
  try {
    return ManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
  } catch (error) {
    throw new Error(`Invalid ${label} manifest at ${manifestPath}: ${(error as Error).message}`);
  }
}

function assertSafeGeneratedManifestFileKey(relativePath: string): void {
  const segments = relativePath.split('/');
  if (
    path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.includes('\\')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || path.posix.normalize(relativePath) !== relativePath
  ) {
    throw new Error(`Unsafe generated Codex manifest file key: ${relativePath}`);
  }
}

export function assertResolvedCodexPackages(input: {
  consumerRoot: string;
  resolvedPlugins: string[];
}): void {
  const sourceManifestPath = path.join(input.consumerRoot, '.specify', 'plugins', 'manifest.json');
  const codexManifestPath = path.join(input.consumerRoot, '.specify', 'codex-plugins', 'manifest.json');
  const sourceManifest = readManifest(sourceManifestPath, 'source plugin');
  const codexManifest = readManifest(codexManifestPath, 'generated Codex plugin');

  for (const plugin of [...new Set(input.resolvedPlugins)].sort()) {
    validateSafeSegment(plugin, 'resolved plugin id');
    const source = sourceManifest.plugins[plugin];
    if (!source) throw new Error(`Codex preflight missing source plugin: ${plugin}`);
    const generated = codexManifest.plugins[plugin];
    if (!generated) throw new Error(`Codex preflight missing generated plugin: ${plugin}`);
    if (generated.version !== source.version) {
      throw new Error(`Codex preflight version mismatch for ${plugin}: source ${source.version}, generated ${generated.version}`);
    }

    const pluginJsonChecksum = generated.files?.['.codex-plugin/plugin.json'];
    if (!pluginJsonChecksum) throw new Error(`Codex preflight incomplete generated package for ${plugin}: missing .codex-plugin/plugin.json`);
    const packageRoot = path.join(input.consumerRoot, '.specify', 'codex-plugins', plugin);
    for (const [relativePath, checksum] of Object.entries(generated.files ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      assertSafeGeneratedManifestFileKey(relativePath);
      const filePath = path.join(packageRoot, relativePath);
      if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
        throw new Error(`Codex preflight incomplete generated package for ${plugin}: missing ${relativePath}`);
      }
      if (sha256File(filePath) !== checksum) {
        throw new Error(`Codex preflight stale generated package for ${plugin}: ${relativePath}`);
      }
    }
  }
}
