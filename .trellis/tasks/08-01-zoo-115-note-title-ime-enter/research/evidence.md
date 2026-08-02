# Verified Evidence

- `apps/web/src/components/editor/NoteEditor.tsx:322-330` treats every Enter returned by `titleKeyAction` as commit-and-focus, calls `preventDefault`, commits, and focuses the ProseMirror body.
- `apps/web/src/components/editor/title-ui.ts:13-15` only receives the key string, so it cannot distinguish IME candidate confirmation from an intentional title commit.
- `tests/unit/editor-title-ui.test.ts:20-23` covers ordinary Enter and a normal character only.
- `apps/web/src/components/agent/ChatInput.tsx:147-155` already demonstrates that this product treats `nativeEvent.isComposing` and key code 229 as required IME guards. Reuse the behavior contract, not the chat component implementation.
- No API, schema, shared type, or persistence contract is involved.

