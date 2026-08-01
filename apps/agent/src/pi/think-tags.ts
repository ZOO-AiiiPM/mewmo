// Some OpenAI-compatible relays (e.g. MiniMax-M3 via AIHubMix) inline the
// model's reasoning as <think>...</think> inside the regular text content
// instead of a separate reasoning field. Pi's openai-completions adapter only
// splits dedicated reasoning fields, so these tags would leak into the
// user-visible reply. Strip them before streaming, persisting, or returning.
const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/** Remove <think>...</think> blocks (including an unclosed trailing one) from complete text. */
export function stripThinkTags(text: string) {
  if (!text.includes(OPEN_TAG)) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .trimStart();
}

/**
 * Stateful per-turn filter for streamed text deltas. Handles tags split across
 * chunks by carrying partial-tag suffixes, drops everything inside think
 * blocks, and trims whitespace that immediately follows a closed block.
 */
export function createThinkTagStreamFilter() {
  let inThink = false;
  let trimLeading = false;
  let carry = "";
  return (delta: string): string => {
    let text = carry + delta;
    carry = "";
    let out = "";
    for (;;) {
      if (inThink) {
        const close = text.indexOf(CLOSE_TAG);
        if (close === -1) {
          carry = partialTagSuffix(text, CLOSE_TAG);
          return out;
        }
        text = text.slice(close + CLOSE_TAG.length);
        inThink = false;
        trimLeading = true;
      } else {
        if (trimLeading) {
          const trimmed = text.replace(/^\s+/, "");
          if (trimmed.length === 0) return out;
          trimLeading = false;
          text = trimmed;
        }
        const open = text.indexOf(OPEN_TAG);
        if (open === -1) {
          carry = partialTagSuffix(text, OPEN_TAG);
          out += text.slice(0, text.length - carry.length);
          return out;
        }
        out += text.slice(0, open);
        text = text.slice(open + OPEN_TAG.length);
        inThink = true;
      }
    }
  };
}

function partialTagSuffix(text: string, tag: string) {
  const max = Math.min(tag.length - 1, text.length);
  for (let length = max; length > 0; length -= 1) {
    if (text.endsWith(tag.slice(0, length))) return tag.slice(0, length);
  }
  return "";
}
