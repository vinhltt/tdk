export const RELEASE_MANIFEST_RELATIVE_PATH = ".specify/release-manifest.json";
export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;
export const RELEASE_MANIFEST_ALGORITHM = "sha256";
export const MARKETPLACE_RELATIVE_PATH = ".claude-plugin/marketplace.json";
export const TDK_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface DistributeConfig {
  ship: string[];
  doNotShip: string[];
}

export interface ReleaseManifestFileEntry {
  sha256: string;
  size: number;
  mode: string;
}

export interface ReleaseManifest {
  schemaVersion: number;
  tdkVersion?: string;
  algorithm: string;
  generatedAt: string;
  rules: {
    source: "distribute.json";
    ship: string[];
    doNotShip: string[];
  };
  files: Record<string, ReleaseManifestFileEntry>;
}

export type ManifestDiffAction = "new" | "updated" | "deleted" | "unchanged";

export interface ManifestDiffEntry {
  action: ManifestDiffAction;
  path: string;
  expectedTargetSha256?: string;
}

export class ReleaseManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseManifestError";
  }
}
