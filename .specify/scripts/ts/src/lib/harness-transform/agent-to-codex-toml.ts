import { resolveCodexModel } from "./model-taxonomy";
import { toCodexSlug } from "./codex-slug";

export interface AgentToCodexTomlItem {
	name: string;
	description?: string;
	frontmatter?: Record<string, unknown>;
	body: string;
}

export interface AgentToCodexTomlResult {
	filename: string;
	toml: string;
	warnings: string[];
}

function escapeTomlMultiline(value: string): string {
	return value.replace(/"""/g, '\\"\\"\\"');
}

function deriveSandboxMode(tools: unknown): { sandboxMode: string | null; warning?: string } {
	if (tools === undefined || tools === null) return { sandboxMode: null };
	if (typeof tools !== "string") {
		return {
			sandboxMode: null,
			warning: `Ignored non-string tools frontmatter (${typeof tools}) while deriving sandbox_mode`,
		};
	}
	if (!tools.trim()) return { sandboxMode: null };

	const toolList = tools
		.split(/[,;|]/)
		.map((tool) => tool.trim().toLowerCase().replace(/\(.*\)$/, ""))
		.filter(Boolean);
	const hasWrite = toolList.some((tool) =>
		["bash", "write", "edit", "multiedit", "notebookedit", "apply_patch", "task"].includes(tool),
	);
	const hasRead = toolList.some((tool) => ["read", "grep", "glob", "ls", "search"].includes(tool));

	if (hasWrite) return { sandboxMode: "workspace-write" };
	if (hasRead) return { sandboxMode: "read-only" };
	return {
		sandboxMode: null,
		warning: `No known read/write tool found in tools frontmatter: "${tools}"`,
	};
}

export function convertAgentToCodexToml(item: AgentToCodexTomlItem): AgentToCodexTomlResult {
	const frontmatter = item.frontmatter ?? {};
	const warnings: string[] = [];
	const slug = toCodexSlug(item.name);
	const lines: string[] = [];

	const modelResult = resolveCodexModel(frontmatter.model);
	if (modelResult.warning) warnings.push(modelResult.warning);
	if (modelResult.resolved) {
		lines.push(`model = ${JSON.stringify(modelResult.resolved.codexModel)}`);
		if (modelResult.resolved.reasoningEffort) {
			lines.push(
				`model_reasoning_effort = ${JSON.stringify(modelResult.resolved.reasoningEffort)}`,
			);
		}
	} else if (typeof frontmatter.model === "string" && frontmatter.model.trim() && frontmatter.model.trim() !== "inherit") {
		lines.push(`# model = ${JSON.stringify(frontmatter.model.trim())}`);
	}

	const sandboxResult = deriveSandboxMode(frontmatter.tools);
	if (sandboxResult.warning) warnings.push(sandboxResult.warning);
	if (sandboxResult.sandboxMode) {
		lines.push(`sandbox_mode = ${JSON.stringify(sandboxResult.sandboxMode)}`);
	}

	const body = item.body.trim();
	if (!body) {
		warnings.push(`Agent "${item.name}" has empty body; writing empty developer_instructions`);
	}
	if (lines.length > 0) lines.push("");
	lines.push(`developer_instructions = """\n${escapeTomlMultiline(body)}\n"""`);

	return { filename: `${slug}.toml`, toml: lines.join("\n"), warnings };
}

export function buildCodexConfigEntry(name: string, description?: string): string {
	const slug = toCodexSlug(name);
	return [
		`[agents.${slug}]`,
		`description = ${JSON.stringify(description || name)}`,
		`config_file = "agents/${slug}.toml"`,
	].join("\n");
}
