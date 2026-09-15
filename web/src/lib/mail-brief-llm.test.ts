import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAIL_BRIEF_MODEL } from "./mail-brief-model";
import type { BriefLlmInput } from "./mail-brief-llm";

/**
 * Covers the parts of Brief mode that do not need a live API: which model the
 * fallback chain picks (admin setting → MAIL_BRIEF_MODEL env → built-in
 * default, allowlist-filtered at every step), and the guarantee that a model
 * response can never smuggle an unknown asset id into the renderer.
 */

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { generateBriefDraft } = await import("./mail-brief-llm");

const REPLY = {
  subject: "Great training",
  opener: "It was a pleasure.",
  recap_intro: "Here is what we covered.",
  feedback_ask: "How did it go?",
  closing: "Talk soon.",
  selected_change_ids: ["material_intro"],
};

function reply(overrides: Partial<typeof REPLY> = {}, message: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text", text: JSON.stringify({ ...REPLY, ...overrides }) }],
    usage: { input_tokens: 10 },
    stop_reason: "end_turn",
    ...message,
  };
}

const input: BriefLlmInput = {
  language: "en",
  recipient_name: "Jane",
  brief: "Two days at a cement plant.",
  recipient_count: 1,
  has_datasets_link: false,
};

const originalEnv = { key: process.env.ANTHROPIC_API_KEY, model: process.env.MAIL_BRIEF_MODEL };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.MAIL_BRIEF_MODEL;
  create.mockReset();
  create.mockResolvedValue(reply());
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of [
    ["ANTHROPIC_API_KEY", originalEnv.key],
    ["MAIL_BRIEF_MODEL", originalEnv.model],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const modelUsed = () => create.mock.calls[0][0].model as string;

describe("model fallback chain", () => {
  it("uses the built-in default when nothing is configured", async () => {
    await generateBriefDraft(input);
    expect(modelUsed()).toBe(DEFAULT_MAIL_BRIEF_MODEL);
    expect(DEFAULT_MAIL_BRIEF_MODEL).toBe("claude-opus-4-8");
  });

  it("prefers the admin setting over the env var", async () => {
    process.env.MAIL_BRIEF_MODEL = "claude-opus-4-8";
    await generateBriefDraft({ ...input, model: "claude-sonnet-5" });
    expect(modelUsed()).toBe("claude-sonnet-5");
  });

  it("falls back to the env var when the admin setting is unset", async () => {
    process.env.MAIL_BRIEF_MODEL = "claude-sonnet-5";
    for (const model of [undefined, null]) {
      create.mockClear();
      await generateBriefDraft({ ...input, model });
      expect(modelUsed()).toBe("claude-sonnet-5");
    }
  });

  it("tolerates whitespace around the env value", async () => {
    process.env.MAIL_BRIEF_MODEL = "  claude-sonnet-5  ";
    await generateBriefDraft(input);
    expect(modelUsed()).toBe("claude-sonnet-5");
  });

  it("ignores an off-allowlist setting rather than sending it", async () => {
    // A stale value in workspace_settings must never reach the API.
    process.env.MAIL_BRIEF_MODEL = "claude-sonnet-5";
    await generateBriefDraft({ ...input, model: "claude-3-opus-20240229" });
    expect(modelUsed()).toBe("claude-sonnet-5");
  });

  it("ignores an off-allowlist env value and lands on the default", async () => {
    process.env.MAIL_BRIEF_MODEL = "gpt-4";
    await generateBriefDraft({ ...input, model: "also-not-a-model" });
    expect(modelUsed()).toBe(DEFAULT_MAIL_BRIEF_MODEL);
  });
});

describe("guardrails on the response", () => {
  it("drops asset ids that are not in the catalog", async () => {
    create.mockResolvedValue(
      reply({ selected_change_ids: ["material_intro", "material_teleportation", "useful_inspector"] }),
    );
    const result = await generateBriefDraft(input);
    expect(result.selected_change_ids).toEqual(["material_intro", "useful_inspector"]);
  });

  it("returns the prose fields unchanged", async () => {
    const result = await generateBriefDraft(input);
    expect(result).toMatchObject({ subject: REPLY.subject, closing: REPLY.closing });
  });

  it("refuses to call the API without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generateBriefDraft(input)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(create).not.toHaveBeenCalled();
  });

  it("turns a refusal and a truncation into their own actionable errors", async () => {
    create.mockResolvedValue(reply({}, { stop_reason: "refusal" }));
    await expect(generateBriefDraft(input)).rejects.toThrow(/declined/);

    create.mockResolvedValue(reply({}, { stop_reason: "max_tokens" }));
    await expect(generateBriefDraft(input)).rejects.toThrow(/too long/);
  });

  it("rejects empty and malformed content instead of returning half an email", async () => {
    create.mockResolvedValue({ content: [], usage: {}, stop_reason: "end_turn" });
    await expect(generateBriefDraft(input)).rejects.toThrow(/no usable content/);

    create.mockResolvedValue({
      content: [{ type: "text", text: "sorry, here is your email" }],
      usage: {},
      stop_reason: "end_turn",
    });
    await expect(generateBriefDraft(input)).rejects.toThrow(/malformed/);

    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ subject: "only this" }) }],
      usage: {},
      stop_reason: "end_turn",
    });
    await expect(generateBriefDraft(input)).rejects.toThrow();
  });

  it("concatenates text blocks and ignores non-text ones", async () => {
    const json = JSON.stringify(REPLY);
    create.mockResolvedValue({
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: json.slice(0, 20) },
        { type: "text", text: json.slice(20) },
      ],
      usage: {},
      stop_reason: "end_turn",
    });
    await expect(generateBriefDraft(input)).resolves.toMatchObject({ subject: REPLY.subject });
  });
});

describe("the prompt handed to the model", () => {
  it("states the language, the recipients and the grammatical number", async () => {
    await generateBriefDraft({ ...input, language: "fr", recipient_count: 3, recipient_name: "Ana, Bo, Cy" });
    const userPrompt = create.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain("in French");
    expect(userPrompt).toContain("Ana, Bo, Cy");
    expect(userPrompt).toContain("plural");
    expect(userPrompt).toContain("Two days at a cement plant.");
  });

  it("tells the model whether a dataset link will be attached", async () => {
    await generateBriefDraft({ ...input, has_datasets_link: true });
    expect(create.mock.calls[0][0].messages[0].content).toContain("WILL be attached");

    create.mockClear();
    await generateBriefDraft(input);
    expect(create.mock.calls[0][0].messages[0].content).toContain("do not mention one");
  });

  it("caches the stable system prefix and lists the real asset catalog", async () => {
    await generateBriefDraft(input);
    const system = create.mock.calls[0][0].system[0];
    expect(system.cache_control).toEqual({ type: "ephemeral" });
    expect(system.text).toContain("- material_intro [training_material]");
    expect(system.text).toContain("Do NOT write, invent, format, or paraphrase any URLs");
  });
});
