import { describe, expect, it } from "bun:test";
import {
	CODEX_CAPABILITY_TABLE,
	CODEX_SUPPORTED_EVENTS,
	detectCodexCapabilities,
	findCapabilitiesForVersion,
} from "../../../src/lib/harness-transform/codex-capabilities";

describe("codex-capabilities", () => {
	it("does not include unsupported Claude-only events", () => {
		const baseline = CODEX_CAPABILITY_TABLE[CODEX_CAPABILITY_TABLE.length - 1];
		expect(baseline.events.SubagentStart).toBeUndefined();
		expect(baseline.events.PreCompact).toBeUndefined();
		expect(baseline.events.Notification).toBeUndefined();
	});

	it("tracks legacy and current PreToolUse capability differences", () => {
		const legacy = CODEX_CAPABILITY_TABLE.find((entry) => entry.version === "0.124.0-alpha.3");
		const current = CODEX_CAPABILITY_TABLE.find((entry) => entry.version === "0.130.0");
		expect(legacy?.events.PreToolUse.supportsAdditionalContext).toBe(false);
		expect(legacy?.events.PreToolUse.permissionDecisionValues).toEqual(["deny"]);
		expect(current?.events.PreToolUse.supportsAdditionalContext).toBe(true);
		expect(current?.events.PreToolUse.permissionDecisionValues).toEqual(["deny", "allow", "block"]);
	});

	it("derives supported events from the newest capability row", () => {
		expect(CODEX_SUPPORTED_EVENTS.has("SessionStart")).toBe(true);
		expect(CODEX_SUPPORTED_EVENTS.has("UserPromptSubmit")).toBe(true);
		expect(CODEX_SUPPORTED_EVENTS.has("PreToolUse")).toBe(true);
		expect(CODEX_SUPPORTED_EVENTS.has("Stop")).toBe(true);
	});

	it("matches exact and newer versions", () => {
		expect(findCapabilitiesForVersion("0.124.0-alpha.3")?.version).toBe("0.124.0-alpha.3");
		expect(findCapabilitiesForVersion("0.131.0")?.version).toBe("0.130.0");
	});

	it("returns strict oldest capabilities with TDK_CODEX_COMPAT=strict", async () => {
		const caps = await detectCodexCapabilities({ env: { TDK_CODEX_COMPAT: "strict" } });
		expect(caps.version).toBe(CODEX_CAPABILITY_TABLE[CODEX_CAPABILITY_TABLE.length - 1].version);
	});

	it("uses injected version probe so tests do not require codex on PATH", async () => {
		const caps = await detectCodexCapabilities({
			runCodexVersion: async () => "codex 0.130.0",
			env: {},
		});
		expect(caps.version).toBe("0.130.0");
	});

	it("falls back to oldest capabilities when version probing fails", async () => {
		const caps = await detectCodexCapabilities({
			runCodexVersion: async () => {
				throw new Error("codex missing");
			},
			env: {},
		});
		expect(caps.version).toBe(CODEX_CAPABILITY_TABLE[CODEX_CAPABILITY_TABLE.length - 1].version);
	});
});
