const TDK_IMPLEMENT_SKILL_PATH = "skills/tdk-implement/SKILL.md";

const CODEX_PARALLEL_STOP = [
  "## ⛔ Codex: `--parallel` is unsupported",
  "",
  "If `$ARGUMENTS` contains `--parallel`, **STOP immediately**. Do not validate the task ID, load references, read or mutate project files, or start workers.",
  "",
  "Rerun without `--parallel`: `/tdk-implement <task-id>` uses the default serial path.",
].join("\n");

function frontmatterEnd(markdown: string): { index: number; newline: "\n" | "\r\n" } {
	const match = markdown.match(/^---(\r?\n)[\s\S]*?\r?\n---/);
	if (!match || !match[1]) {
		throw new Error(`Cannot specialize ${TDK_IMPLEMENT_SKILL_PATH}: YAML frontmatter is required`);
	}
	return { index: match[0].length, newline: match[1] as "\n" | "\r\n" };
}

export function specializeCodexSkill(relativePath: string, content: Buffer): Buffer {
	if (relativePath !== TDK_IMPLEMENT_SKILL_PATH) return content;

	const markdown = content.toString("utf8");
	const { index, newline } = frontmatterEnd(markdown);
	const body = markdown.slice(index).replace(/^(?:\r?\n)+/, "");
	const guard = CODEX_PARALLEL_STOP.replaceAll("\n", newline);
	return Buffer.from(
		`${markdown.slice(0, index)}${newline}${newline}${guard}${newline}${newline}${body}`,
		"utf8",
	);
}
