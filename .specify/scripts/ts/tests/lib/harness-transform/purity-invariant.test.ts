import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as transform from "../../../src/lib/harness-transform";

const transformRoot = join(import.meta.dir, "../../../src/lib/harness-transform");

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const absolute = join(dir, entry);
		return statSync(absolute).isDirectory() ? sourceFiles(absolute) : [absolute];
	});
}

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("harness-transform public API and purity invariant", () => {
	it("exports the documented public API", () => {
		expect(transform.CODEX_CAPABILITY_TABLE.length).toBeGreaterThan(0);
		expect(typeof transform.convertAgentToCodexToml).toBe("function");
		expect(typeof transform.buildWrapperScript).toBe("function");
		expect(typeof transform.mergeConfigToml).toBe("function");
		expect(typeof transform.convertCommandToCodexSkill).toBe("function");
	});

	it("does not import fs or bake consumer destination paths into source modules", () => {
		for (const file of sourceFiles(transformRoot).filter((path) => path.endsWith(".ts"))) {
			const source = readFileSync(file, "utf8");
			expect(source).not.toMatch(/from\s+["']node:fs/);
			expect(source).not.toMatch(/from\s+["']fs/);
			const executableSource = stripComments(source);
			expect(executableSource).not.toContain(".codex-plugin/");
			expect(executableSource).not.toContain(".agents/skills/");
		}
	});
});
