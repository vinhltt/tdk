import { describe, expect, it } from "bun:test";
import { convertCommandToCodexSkill } from "../../../src/lib/harness-transform/command-to-codex-skill";
import { mergeConfigToml, mergeConfigTomlWithDiagnostics } from "../../../src/lib/harness-transform/config-toml-merge";
import {
	buildFeaturesFlagBlock,
	mergeFeaturesFlagToml,
} from "../../../src/lib/harness-transform/features-flag-block";
import { buildHooksJsonFragment } from "../../../src/lib/harness-transform/hooks-json-fragment";

describe("mergeConfigToml", () => {
	const block = '[agents.test]\ndescription = "Test"';

	it("wraps a managed block with TDK sentinels", () => {
		const result = mergeConfigToml("", block);
		expect(result).toContain("# --- tdk-managed-agents-start ---");
		expect(result).toContain("# --- tdk-managed-agents-end ---");
		expect(result).not.toContain("ck-managed");
		expect(result).toContain("[agents.test]");
	});

	it("replaces old managed blocks and collapses duplicates", () => {
		const existing = [
			"# --- tdk-managed-agents-start ---",
			"[agents.old]",
			"description = \"Old\"",
			"# --- tdk-managed-agents-end ---",
			"",
			"# --- tdk-managed-agents-start ---",
			"[agents.other]",
			"description = \"Other\"",
			"# --- tdk-managed-agents-end ---",
		].join("\n");
		const result = mergeConfigTomlWithDiagnostics(existing, block);
		expect(result.content.match(/tdk-managed-agents-start/g)).toHaveLength(1);
		expect(result.content).toContain("[agents.test]");
		expect(result.content).not.toContain("[agents.old]");
		expect(result.warnings.some((warning) => warning.includes("collapsing"))).toBe(true);
	});

	it("preserves CRLF line endings", () => {
		const existing = 'model = "gpt-5.4"\r\n\r\n[features]\r\nmulti_agent = true\r\n';
		const result = mergeConfigToml(existing, block);
		expect(result).toContain("\r\n# --- tdk-managed-agents-start ---\r\n");
		expect(result.includes("\n# --- tdk-managed-agents-start ---\n")).toBe(false);
	});
});

describe("feature flag and hooks fragments", () => {
	it("builds a TDK-managed features flag block", () => {
		expect(buildFeaturesFlagBlock()).toBe(
			[
				"# --- tdk-managed-features-start ---",
				"[features]",
				"hooks = true",
				"# --- tdk-managed-features-end ---",
			].join("\n"),
		);
	});

	it("merges hooks into an existing user [features] section", () => {
		const result = mergeFeaturesFlagToml('[features]\nmulti_agent = true\nhooks = false\n');
		expect(result.match(/^\[features\]$/gm)).toHaveLength(1);
		expect(result).toContain("multi_agent = true");
		expect(result).toContain("hooks = true");
		expect(result).not.toContain("tdk-managed-features-start");
	});

	it("preserves CRLF when inserting hooks into existing [features]", () => {
		const result = mergeFeaturesFlagToml("[features]\r\nmulti_agent = true\r\n");
		expect(result).toContain("multi_agent = true\r\nhooks = true\r\n");
		expect(result).not.toContain("hooks = true\n");
	});

	it("removes legacy codex_hooks when inserting hooks", () => {
		const result = mergeFeaturesFlagToml("[features]\ncodex_hooks = true\n");
		expect(result).toContain("hooks = true");
		expect(result).not.toContain("codex_hooks");
	});

	it("inserts a newline after a bare [features] header at EOF", () => {
		expect(mergeFeaturesFlagToml("[features]")).toBe("[features]\nhooks = true\n");
	});

	it("appends a managed features block when no [features] section exists", () => {
		const result = mergeFeaturesFlagToml('model = "gpt-5.4"\n');
		expect(result).toContain('model = "gpt-5.4"');
		expect(result).toContain("# --- tdk-managed-features-start ---");
		expect(result).toContain("[features]");
		expect(result).toContain("hooks = true");
	});

	it("builds a Codex hooks.json fragment with wrapper command and origin", () => {
		const fragment = buildHooksJsonFragment(
			{ PreToolUse: [{ command: "node hook-gateway.cjs privacy-block", timeout: 1000 }] },
			{ "node hook-gateway.cjs privacy-block": "hooks/wrapper.cjs" },
			"tdk-core",
		);
		expect(fragment.PreToolUse[0]).toEqual({
			command: 'node "hooks/wrapper.cjs"',
			timeout: 1000,
			_origin: "tdk-core",
		});
	});

	it("throws when a hook wrapper mapping is missing", () => {
		expect(() =>
			buildHooksJsonFragment(
				{ PreToolUse: [{ command: "node hook-gateway.cjs privacy-block" }] },
				{},
				"tdk-core",
			),
		).toThrow("Missing Codex hook wrapper mapping");
	});
});

describe("convertCommandToCodexSkill", () => {
	it("turns command segments into Title-Case skill frontmatter and preserves body", () => {
		const result = convertCommandToCodexSkill({
			name: "tdk/plan",
			description: "Create a plan",
			segments: ["tdk", "plan"],
			body: "Use $ARGUMENTS to plan.",
		});
		expect(result.name).toBe("Tdk Plan");
		expect(result.description).toBe("Create a plan");
		expect(result.body).toContain('name: "Tdk Plan"');
		expect(result.body).toContain("Use $ARGUMENTS to plan.");
		expect(result.warnings.some((warning) => warning.includes("Claude-specific"))).toBe(true);
	});

	it("preserves command body bytes inside the generated skill", () => {
		const sourceBody = "\n\n  keep leading and trailing whitespace  \n";
		const result = convertCommandToCodexSkill({
			name: "tdk/raw",
			body: sourceBody,
		});
		expect(result.body).toContain(sourceBody);
	});

	it("rejects descriptions over the Codex limit", () => {
		const result = convertCommandToCodexSkill({
			name: "too-long",
			description: "a".repeat(257),
			body: "Run.",
		});
		expect(result.error).toContain("exceeds 256");
	});
});
