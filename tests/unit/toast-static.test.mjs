import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const read = (path) => readFileSync(path, "utf8");

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(path)) files.push(path);
  }
  return files;
}

function extractShowToastCalls(source) {
  const calls = [];
  let index = 0;
  while ((index = source.indexOf("showToast(", index)) !== -1) {
    const start = index;
    index += "showToast(".length;
    let depth = 1;
    let quote = null;
    let escaped = false;
    let call = "showToast(";

    for (; index < source.length; index += 1) {
      const char = source[index];
      call += char;

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === "\"" || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0) {
        index += 1;
        break;
      }
    }

    calls.push({ start, text: call });
  }
  return calls;
}

function argumentCount(call) {
  const args = call.slice("showToast(".length, -1);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let count = args.trim() ? 1 : 0;

  for (const char of args) {
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (char === "," && depth === 0) count += 1;
  }

  return count;
}

test("failure toasts use a red exclamation icon in every toast component", () => {
  const provider = read("apps/web/src/components/ui/ToastProvider.tsx");
  const sharedToast = read("packages/ui/src/components/Toast.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(provider, /toast\.type === "success" \? "✓" : "!"/);
  assert.doesNotMatch(provider, /toast\.type === "success" \? "✓" : "×"/);
  assert.match(sharedToast, /type === "error" \? "!"/);
  assert.match(css, /\.mewmo-toast__inner--error \.mewmo-toast__mark \{\s*color: #d54f45;/);
});

test("toast helper requires every call site to choose a visual state", () => {
  const provider = read("apps/web/src/components/ui/ToastProvider.tsx");
  const sharedToast = read("packages/ui/src/components/Toast.tsx");
  assert.match(provider, /showToast: \(text: string, type: ToastType, options\?: ToastOptions\) => void/);
  assert.doesNotMatch(provider, /type: ToastType = "success"/);
  assert.match(sharedToast, /type: "info" \| "success" \| "error"/);
  assert.doesNotMatch(sharedToast, /type\?: "info" \| "success" \| "error"/);
  assert.doesNotMatch(sharedToast, /type = "info"/);

  const failures = [];
  for (const file of sourceFiles("apps/web/src")) {
    const source = read(file);
    for (const call of extractShowToastCalls(source)) {
      if (argumentCount(call.text) < 2) {
        const line = source.slice(0, call.start).split("\n").length;
        failures.push(`${file}:${line}: ${call.text.replace(/\s+/g, " ")}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("notes page reports create-note failures with the error toast state", () => {
  const notesPage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(notesPage, /showToast\("新建笔记失败",\s*"error"\)/);
});

test("toast grows with content but wraps long messages at the viewport cap", () => {
  const provider = read("apps/web/src/components/ui/ToastProvider.tsx");
  const css = read("apps/web/src/app/globals.css");
  const toastCss = css.slice(css.indexOf(".mewmo-toast"), css.indexOf(".mewmo-confirm"));

  assert.match(provider, /<span className="mewmo-toast__message">\{toast\.text\}<\/span>/);
  assert.match(toastCss, /\.mewmo-toast__inner\s*\{[\s\S]*width:\s*max-content/);
  assert.match(toastCss, /\.mewmo-toast__inner\s*\{[\s\S]*max-width:\s*80vw/);
  assert.match(toastCss, /\.mewmo-toast__inner\s*\{[\s\S]*white-space:\s*normal/);
  assert.match(toastCss, /\.mewmo-toast__message\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(toastCss, /\.mewmo-toast__inner\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(toastCss, /\.mewmo-toast__inner--actions \.mewmo-toast__message\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(toastCss, /\.mewmo-toast__inner--actions \.mewmo-toast__message\s*\{[^}]*mask-image:\s*linear-gradient/);
});

test("failure and blocked-action toast call sites explicitly request the error state", () => {
  const failures = [];
  for (const file of sourceFiles("apps/web/src")) {
    const source = read(file);
    for (const call of extractShowToastCalls(source)) {
      if (/失败|无法|未找到|请先|没有发现|还在路上|暂未|未配置/.test(call.text) && !/,\s*"error"\s*,?\s*\)/.test(call.text)) {
        const line = source.slice(0, call.start).split("\n").length;
        failures.push(`${file}:${line}: ${call.text.replace(/\s+/g, " ")}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
