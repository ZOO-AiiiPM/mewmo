# ZOO-20 Feed UI Polish Design

## Goal

Fix feed titles that expose encoded HTML entities, keep long subscription names on one line, and add article actions to the left article-list header without changing subscription-source management.

## Confirmed Behavior

### Feed title normalization

Feed discovery must decode named, decimal, and hexadecimal HTML entities before showing or persisting a candidate title. For example, `&#8211;` becomes `–` and `&hellip;` becomes `…`. The fix belongs in the discovery text-cleaning boundary so new records do not store the encoded form. Use the standard `entities` decoder for the complete HTML named-entity set and keep explicit numeric code-point validation for invalid values.

Existing persisted titles are not bulk-migrated in this issue. They remain editable through existing source-management actions.

### Single-line subscription title

The title shown in the left article-list header must stay on one line. Its layout reserves stable space for header actions and truncates overflow with an ellipsis while retaining the complete title for accessibility and hover inspection. The underlying feed title is not destructively shortened.

### Left article-list actions

Add a three-dot article menu to the left article-list header, alongside the existing add and search controls. It operates on the currently selected article, not on the subscription source.

The menu matches the right reader toolbar:

- `收藏` or `已收藏`, using the selected article's real favorite state and existing favorite API.
- `复制链接`, copying the selected article's original URL and using the existing success feedback.

Both locations reuse one feed-article menu implementation so labels, icons, disabled behavior, and favorite state cannot drift. When no article is selected, the menu trigger keeps its layout position but is disabled.

## Scope Boundaries

- Do not add rename, refresh, or delete source actions to the article-list header.
- Do not change the existing source actions in the navigation drawer.
- Do not alter batch subscription behavior beyond title normalization.
- Do not migrate existing database rows or add dependencies unrelated to entity decoding.

## Error Handling

Favorite failures continue to use the current error toast. Copy is available only when the selected article has a URL. Invalid numeric entities remain unchanged instead of throwing during discovery.

## Verification

- Unit-test decimal and hexadecimal entity decoding during direct RSS and website discovery.
- Add static UI contracts for single-line ellipsis, stable action layout, and shared left/right article menu behavior.
- Run feed-focused tests, theme validation, lint/build checks appropriate to the changed surface, and browser verification on the Issue reproduction.
