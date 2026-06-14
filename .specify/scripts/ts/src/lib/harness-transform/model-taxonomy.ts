import taxonomy from "./model-taxonomy.json";

export type ModelTier = "heavy" | "balanced" | "light";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface CodexModelResolution {
	codexModel: string;
	reasoningEffort?: ReasoningEffort;
}

export interface ModelTaxonomyResult {
	resolved: CodexModelResolution | null;
	warning?: string;
}

type TaxonomyData = {
	sourceTiers: Record<string, ModelTier>;
	codex: Record<ModelTier, CodexModelResolution>;
};

const modelTaxonomy = taxonomy as TaxonomyData;

export function resolveCodexModel(model: unknown): ModelTaxonomyResult {
	if (model === undefined || model === null) {
		return { resolved: null };
	}
	if (typeof model !== "string") {
		return {
			resolved: null,
			warning: `Ignored non-string model frontmatter (${typeof model})`,
		};
	}

	const trimmed = model.trim();
	if (!trimmed || trimmed === "inherit") {
		return { resolved: null };
	}

	const tier = modelTaxonomy.sourceTiers[trimmed];
	if (!tier) {
		return {
			resolved: null,
			warning: `Unknown model "${trimmed}" - not in taxonomy, commented out`,
		};
	}

	return { resolved: modelTaxonomy.codex[tier] };
}
