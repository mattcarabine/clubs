import { describe, expect, it } from "vitest";

import { AI_MODEL } from "./config";
import { buildRequest, type GenerateTask } from "./generate";

const task: GenerateTask = {
  kind: "session",
  subjectKey: "s1",
  version: "s1",
  input: { score: "3-1" },
  prompt: {
    system: "House style.",
    context: { baselines: [] },
    instructions: "Write it.",
  },
  schema: { type: "object" },
  writeups: () => [],
};

describe("buildRequest", () => {
  it("uses the configured model, adaptive thinking and the schema", () => {
    const request = buildRequest(task);
    expect(request.model).toBe(AI_MODEL);
    expect(request.thinking).toEqual({ type: "adaptive" });
    expect(request.output_config?.format).toEqual({
      type: "json_schema",
      schema: { type: "object" },
    });
  });

  it("caches the system prompt and the background, and puts the data last", () => {
    const request = buildRequest(task);
    expect(request.system).toEqual([
      {
        type: "text",
        text: "House style.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(request.messages[0].content).toEqual([
      {
        type: "text",
        text: 'Background:\n{"baselines":[]}',
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: 'Write it.\n\nData:\n{"score":"3-1"}' },
    ]);
  });

  it("asks for plain text without a schema or background", () => {
    const request = buildRequest({
      ...task,
      schema: undefined,
      prompt: { system: "House style.", instructions: "Write it." },
    });
    expect(request.output_config?.format).toBeUndefined();
    expect(request.messages[0].content).toHaveLength(1);
  });
});
