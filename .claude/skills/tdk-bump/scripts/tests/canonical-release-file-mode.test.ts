import { describe, expect, test } from "bun:test";

import { canonicalReleaseFileMode } from "../canonical-release-file-mode.ts";

describe("canonical release file mode", () => {
  test.each([0o644, 0o664, 0o755, 0o775])("serializes %o as 0644", (physicalMode) => {
    expect(canonicalReleaseFileMode(physicalMode)).toBe("0644");
  });
});
