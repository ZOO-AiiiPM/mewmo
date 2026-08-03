import { describe, expect, it } from "vitest";

import {
  buildComposerSendOptions,
  type ComposerSendOptions,
} from "./composer-one-shot";

describe("deep thinking persistent send options", () => {
  it("includes thinking on consecutive sends and keeps it independent from skillId", () => {
    const thinking = true;
    const payloads: ComposerSendOptions[] = [];
    payloads.push(buildComposerSendOptions({
      content: "第一轮",
      skillId: "deep-insight",
      thinking,
      includeContext: false,
    }));
    payloads.push(buildComposerSendOptions({
      content: "第二轮",
      thinking,
      includeContext: false,
    }));

    expect(payloads).toEqual([
      {
        content: "第一轮",
        skillId: "deep-insight",
        thinking: true,
        includeContext: false,
      },
      { content: "第二轮", thinking: true, includeContext: false },
    ]);
  });

  it("omits thinking only after the user turns the option off", () => {
    expect(buildComposerSendOptions({
      content: "第三轮",
      thinking: false,
      includeContext: false,
    })).toEqual({ content: "第三轮", includeContext: false });
  });
});
