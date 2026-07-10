# New Account Onboarding Design

## Goal

Replace the current prototype-heavy first-login workspace with a quiet, truthful starting point: three editable notes that explain mewmo's product position, core workflow, and AI Agent.

## Current Problem

The knowledge-base list API creates prototype knowledge bases as a side effect of reading data. Those knowledge bases also create folders, clips, and local-asset placeholders. A new account therefore appears to contain a substantial personal library before the user has saved anything, and merely opening the sidebar can mutate the database.

Credentials registration currently creates only a user. Google OAuth account creation follows a separate Auth.js path. Neither path owns a clear, shared onboarding contract.

## New Account Content

Every newly created account receives exactly these three real, editable notes and no other content:

1. `欢迎来到 mewmo：把信息变成可以继续使用的记忆`
   Explains mewmo's cloud-first information-management position, the difference between storing information and making it useful again, and the product's restrained companion character.
2. `开始使用 mewmo：记录、剪藏与整理`
   Introduces notes, web clipping, subscriptions, and knowledge-base organization. It distinguishes current capabilities from areas that are still being developed.
3. `认识 mewmo Agent：和你的内容一起思考`
   Explains page context, summaries, conversations, and the longer-term direction of proactive review without presenting planned behavior as already available.

The product-positioning note is pinned so it is the first note selected when `/notes` loads. The notes use stable slugs and are created through one shared database helper. Repeated initialization skips existing slugs instead of overwriting user edits.

## Account Creation Paths

Credentials registration creates the user and the three notes in one database transaction. A failed note initialization therefore cannot leave a partially initialized credentials account.

Auth.js `createUser` events call the same idempotent helper for OAuth and email-provider accounts. This path cannot share the adapter's internal account-creation transaction, so idempotence is the recovery mechanism.

After credentials registration, the login callback points to the product-positioning note. Normal `/notes` loading also places pinned notes first, so OAuth and later visits have the same default selection behavior.

## Knowledge Base Behavior

`GET /api/knowledge-bases` becomes read-only. It returns the authenticated user's real knowledge bases and never creates knowledge bases, folders, notes, clips, or asset placeholders.

Knowledge-base creation remains an explicit `POST` action. Empty knowledge-base and clip areas use their existing empty states.

## Existing Data Cleanup

Provide a repository script that is dry-run by default and requires `--apply` to mutate data. It operates across the configured development database and reports counts before and after execution.

The cleanup hard-deletes only legacy prototype data identified by fixed fingerprints:

- Knowledge bases named `产品设计` or `技术笔记` that also contain known prototype folder or item fingerprints.
- The two prototype clips matched by their exact title and URL pairs.
- The old prototype note matched by its exact slug `product-position-cat-companionship`.

Deleting the matched knowledge bases cascades their folders and knowledge items. The script then idempotently adds the three new onboarding notes to every existing account. Other notes, clips, feeds, knowledge bases, tags, and user-created content are untouched.

## Non-Goals

- Do not change the current hard-coded tag UI or database tag models.
- Do not redesign the authentication pages.
- Do not remove access to clips, subscriptions, or knowledge bases.
- Do not add a multi-step onboarding wizard, checklist, modal, or virtual front-end-only sample data.
- Do not recreate onboarding notes after a user later deletes them.

## Success Criteria

- New credentials, OAuth, and email-provider accounts receive three onboarding notes and no prototype clips or knowledge bases.
- Opening the sidebar or knowledge-base page does not write to the database.
- The product-positioning note is the initial note shown after first login.
- The cleanup dry run identifies only fixed legacy fingerprints; apply removes them and preserves unrelated content.
- Re-running initialization or cleanup does not duplicate the three onboarding notes.
- Targeted tests, lint, build, and a browser check on port 3000 pass.
