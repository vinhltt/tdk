import { createHash } from "node:crypto";

const MAX_CODEX_SLUG_LENGTH = 96;

function shortHash(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function toCodexSlug(name: string): string {
	const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
	let slug = normalized
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();

	if (!slug) {
		slug = `agent_${shortHash(name)}`;
	}

	if (slug.length > MAX_CODEX_SLUG_LENGTH) {
		slug = slug.slice(0, MAX_CODEX_SLUG_LENGTH).replace(/_+$/g, "");
	}

	return slug || `agent_${shortHash(name)}`;
}
