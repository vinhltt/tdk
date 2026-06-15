import { describe, expect, it } from "bun:test";
import {
	buildCodexConfigEntry,
	convertAgentToCodexToml,
} from "../../../src/lib/harness-transform/agent-to-codex-toml";
import { resolveCodexModel } from "../../../src/lib/harness-transform/model-taxonomy";
import { toCodexSlug } from "../../../src/lib/harness-transform/codex-slug";

describe("toCodexSlug", () => {
	it("normalizes names into Codex-safe slugs", () => {
		expect(toCodexSlug("code-reviewer")).toBe("code_reviewer");
		expect(toCodexSlug("MyAgent")).toBe("myagent");
		expect(toCodexSlug("agent.v2!")).toBe("agent_v2");
		expect(toCodexSlug("-agent-")).toBe("agent");
		expect(toCodexSlug("🔥🔥")).toMatch(/^agent_[0-9a-f]{8}$/);
		expect(toCodexSlug("a".repeat(300)).length).toBeLessThanOrEqual(96);
	});
});

describe("convertAgentToCodexToml", () => {
	it("generates per-agent TOML with model, sandbox, and developer instructions", () => {
		const result = convertAgentToCodexToml({
			name: "code-reviewer",
			frontmatter: { model: "opus", tools: "Read, Write" },
			body: "You are a senior code reviewer.",
		});
		expect(result.filename).toBe("code_reviewer.toml");
		expect(result.toml).toContain('model = "gpt-5.4"');
		expect(result.toml).toContain('model_reasoning_effort = "xhigh"');
		expect(result.toml).toContain('sandbox_mode = "workspace-write"');
		expect(result.toml).toContain('developer_instructions = """');
		expect(result.warnings).toEqual([]);
	});

	it("derives read-only sandbox mode", () => {
		const result = convertAgentToCodexToml({
			name: "explorer",
			frontmatter: { tools: "Read, Grep, Glob" },
			body: "Inspect files.",
		});
		expect(result.toml).toContain('sandbox_mode = "read-only"');
	});

	it("escapes embedded triple quotes", () => {
		const result = convertAgentToCodexToml({
			name: "writer",
			body: 'Use """ carefully.',
		});
		expect(result.toml).toContain('\\"\\"\\"');
	});

	it("warns on unknown model and preserves it as a comment", () => {
		const result = convertAgentToCodexToml({
			name: "custom",
			frontmatter: { model: "custom-model" },
			body: "Work.",
		});
		expect(result.toml).toContain('# model = "custom-model"');
		expect(result.warnings.some((warning) => warning.includes("Unknown model"))).toBe(true);
	});

	it("fails closed to read-only when tools are missing, malformed, empty, or unknown", () => {
		for (const tools of [undefined, ["Read"], "", "UnknownTool"]) {
			const result = convertAgentToCodexToml({
				name: "guarded",
				frontmatter: { tools },
				body: "Work.",
			});
			expect(result.toml).toContain('sandbox_mode = "read-only"');
			expect(result.warnings.some((warning) => warning.includes("read-only"))).toBe(true);
		}
	});
});

describe("model taxonomy and config entry", () => {
	it("resolves taxonomy from JSON-backed data", () => {
		expect(resolveCodexModel("sonnet").resolved).toEqual({
			codexModel: "gpt-5.4",
			reasoningEffort: "high",
		});
	});

	it("builds a registry entry", () => {
		const entry = buildCodexConfigEntry("code-reviewer", "Reviews code");
		expect(entry).toContain("[agents.code_reviewer]");
		expect(entry).toContain('description = "Reviews code"');
		expect(entry).toContain('config_file = "agents/code_reviewer.toml"');
	});
});
