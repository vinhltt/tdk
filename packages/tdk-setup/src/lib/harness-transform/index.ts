/**
 * TDK harness transform core.
 *
 * Boundary contract: these modules produce bytes; consumers place bytes.
 * A module that writes files or knows a final `.codex-plugin/`, `.codex/`, or
 * `.agents/skills/` destination path belongs in a consumer/install plan.
 */
export * from "./agent-to-codex-toml";
export * from "./codex-capabilities";
export * from "./codex-hook-wrapper";
export * from "./codex-slug";
export * from "./command-to-codex-skill";
export * from "./config-toml-merge";
export * from "./features-flag-block";
export * from "./hooks-json-fragment";
export * from "./model-taxonomy";
