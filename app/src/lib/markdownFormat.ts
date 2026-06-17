import { EditorSelection, type Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type FormatRange = { from: number; to: number };
type FormatChange = { from: number; to: number; insert: string };

function selectedLines(doc: Text, range: FormatRange) {
  const from = Math.min(range.from, range.to);
  const to = Math.max(range.from, range.to);
  const endPos = to > from ? to - 1 : to;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(Math.max(from, endPos));
  const lines = [];
  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    lines.push(doc.line(lineNum));
  }
  return lines;
}

function dispatchLineFormat(view: EditorView, changes: FormatChange[], anchor?: number) {
  view.dispatch(view.state.update({
    changes,
    selection: typeof anchor === 'number' ? EditorSelection.cursor(anchor) : undefined,
    scrollIntoView: true,
    userEvent: 'input.format',
  }));
  return true;
}

function mappedHeadForSingleLine(
  head: number,
  lineFrom: number,
  oldPrefixLength: number,
  newPrefixLength: number,
) {
  const delta = newPrefixLength - oldPrefixLength;
  if (head <= lineFrom + oldPrefixLength) return lineFrom + newPrefixLength;
  return Math.max(lineFrom + newPrefixLength, head + delta);
}

export function getHeadingToggleChanges(doc: Text, range: FormatRange, level: number) {
  const lines = selectedLines(doc, range);
  const target = '#'.repeat(Math.min(6, Math.max(1, level))) + ' ';
  const headingRe = /^(\s*)(#{1,6})(?:\s+|$)(.*)$/;
  const allSameLevel = lines.every(line => {
    const match = line.text.match(headingRe);
    return match?.[2].length === level;
  });

  return lines.map(line => {
    const match = line.text.match(headingRe);
    if (allSameLevel && match) {
      const [, indent, hashes, body] = match;
      return {
        from: line.from,
        to: line.to,
        insert: `${indent}${body}`,
        oldPrefixLength: indent.length + hashes.length + 1,
        newPrefixLength: indent.length,
        lineFrom: line.from,
      };
    }

    if (match) {
      const [, indent, hashes] = match;
      const prefixLength = indent.length + hashes.length + 1;
      return {
        from: line.from + indent.length,
        to: line.from + prefixLength,
        insert: target,
        oldPrefixLength: prefixLength,
        newPrefixLength: indent.length + target.length,
        lineFrom: line.from,
      };
    }

    const indent = line.text.match(/^(\s*)/)?.[1] ?? '';
    return {
      from: line.from + indent.length,
      to: line.from + indent.length,
      insert: target,
      oldPrefixLength: indent.length,
      newPrefixLength: indent.length + target.length,
      lineFrom: line.from,
    };
  });
}

export function toggleHeading(level: number) {
  return (view: EditorView) => {
    const selection = view.state.selection.main;
    const changes = getHeadingToggleChanges(view.state.doc, selection, level);
    const anchor = changes.length === 1 && selection.empty
      ? mappedHeadForSingleLine(
          selection.head,
          changes[0].lineFrom,
          changes[0].oldPrefixLength,
          changes[0].newPrefixLength,
        )
      : undefined;
    return dispatchLineFormat(view, changes, anchor);
  };
}

type PrefixMode = 'quote' | 'bullet' | 'ordered';

const prefixConfig = {
  quote: {
    test: /^(\s*)>\s?/,
    marker: () => '> ',
  },
  bullet: {
    test: /^(\s*)[-*+]\s+/,
    marker: () => '- ',
  },
  ordered: {
    test: /^(\s*)\d+[.)]\s+/,
    marker: (idx: number) => `${idx + 1}. `,
  },
} satisfies Record<PrefixMode, {
  test: RegExp;
  marker: (idx: number) => string;
}>;

export function getLinePrefixToggleChanges(doc: Text, range: FormatRange, mode: PrefixMode) {
  const lines = selectedLines(doc, range);
  const config = prefixConfig[mode];
  const allPrefixed = lines.every(line => config.test.test(line.text));

  return lines.map((line, idx) => {
    const match = line.text.match(config.test);
    if (allPrefixed && match) {
      return {
        from: line.from,
        to: line.from + match[0].length,
        insert: match[1],
        oldPrefixLength: match[0].length,
        newPrefixLength: match[1].length,
        lineFrom: line.from,
      };
    }

    const indent = line.text.match(/^(\s*)/)?.[1] ?? '';
    const marker = config.marker(idx);
    return {
      from: line.from + indent.length,
      to: line.from + indent.length,
      insert: marker,
      oldPrefixLength: indent.length,
      newPrefixLength: indent.length + marker.length,
      lineFrom: line.from,
    };
  });
}

export function toggleLinePrefix(mode: PrefixMode) {
  return (view: EditorView) => {
    const selection = view.state.selection.main;
    const changes = getLinePrefixToggleChanges(view.state.doc, selection, mode);
    const anchor = changes.length === 1 && selection.empty
      ? mappedHeadForSingleLine(
          selection.head,
          changes[0].lineFrom,
          changes[0].oldPrefixLength,
          changes[0].newPrefixLength,
        )
      : undefined;
    return dispatchLineFormat(view, changes, anchor);
  };
}
