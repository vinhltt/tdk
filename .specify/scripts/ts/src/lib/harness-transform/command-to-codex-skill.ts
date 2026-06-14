export interface CommandToCodexSkillItem {
	name: string;
	description?: string;
	segments?: string[];
	body: string;
}

export interface CommandToCodexSkillResult {
	name: string;
	description: string;
	body: string;
	warnings: string[];
	error?: string;
}

const MAX_DESCRIPTION_LENGTH = 256;

function sourceSegments(item: CommandToCodexSkillItem): string[] {
	return item.segments?.length ? item.segments : item.name.split("/");
}

function titleCaseSkillName(segments: string[]): string {
	return segments
		.filter(Boolean)
		.join(" ")
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase())
		.replace(/\s+/g, " ")
		.trim();
}

function hasClaudeDynamicSyntax(body: string): boolean {
	return body.includes("$ARGUMENTS") || /\$[1-9]\d*/.test(body) || (body.includes("{{") && body.includes("}}"));
}

export function convertCommandToCodexSkill(
	item: CommandToCodexSkillItem,
): CommandToCodexSkillResult {
	const name = titleCaseSkillName(sourceSegments(item)) || "Migrated Command";
	const description = (item.description || `Migrated command ${item.name}`).replace(/\s+/g, " ").trim();
	const warnings: string[] = [];

	if (description.length > MAX_DESCRIPTION_LENGTH) {
		return {
			name,
			description,
			body: item.body,
			warnings,
			error: `Codex skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
		};
	}
	if (hasClaudeDynamicSyntax(item.body)) {
		warnings.push(
			"Command template contains Claude-specific dynamic syntax; installed as a Codex skill for manual adaptation.",
		);
	}

	const body = [
		"---",
		`name: ${JSON.stringify(name)}`,
		`description: ${JSON.stringify(description)}`,
		"---",
		"",
		item.body,
		"",
	].join("\n");

	return { name, description, body, warnings };
}
