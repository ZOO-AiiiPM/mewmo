# ZOO-24 Account Password Design

## Goal

Turn the placeholder account settings into a real authenticated password-management flow. Users who already have a password can change it, while authenticated Google or email-link users without a password can create one and keep their existing login method.

## Entry and Page

Add an `账户管理` entry to the sidebar account menu and route it to a focused account settings page. The page displays the current user's name, email, and available login methods from real session/account data. Do not expose the unrelated placeholder AI model or data-export controls as part of this issue.

## Password Modes

The server determines the mode from the current user's stored password; the client does not choose it.

For an account with an existing password, show `当前密码`, `新密码`, and `确认新密码`. The current password must be verified before updating the stored hash.

For an authenticated account without a password, show `新密码` and `确认新密码`. This applies to both Google and email-link accounts. A valid authenticated session authorizes the initial password setup because Resend verification is unavailable in the current environment.

Creating a password does not remove or rewrite existing Google or email-provider account records. The user can continue using the original provider and can additionally sign in with email and password.

## Validation and Security

The endpoint only operates on the authenticated user. Password values are never returned or logged, and only a bcrypt hash is stored.

The new password must:

- contain at least 8 characters;
- match the confirmation value;
- differ from the existing password when one exists.

Reject unauthenticated requests, an incorrect current password, invalid confirmation, short passwords, and unchanged passwords with specific but non-sensitive errors. Do not reveal password hashes or account-internal provider identifiers.

A successful update keeps the current session active. Revoking other sessions, requiring recent Google reauthentication, rate limiting, and password-strength scoring are outside this issue.

## API and Data Flow

Add an authenticated account-password API beneath the existing Web API surface.

1. Read and validate the request body.
2. Load the current user by the authenticated session ID.
3. If the user has a password, require and verify `currentPassword`.
4. Reject a new password that matches the existing password.
5. Hash the new password through the shared `@mewmo/auth` helper.
6. Update only the current user's password field.
7. Return a success response without user password data.

No Prisma schema migration is required because `User.password` already exists and is nullable.

## UI States

The account page must distinguish loading, ready, submitting, success, and failure states. Disable duplicate submission while saving. On success, clear all password inputs and show the existing success toast. Validation and API failures use the existing error toast plus field-level guidance where the affected field is known.

## Scope Boundaries

This issue does not implement forgotten-password recovery, reset emails, email verification, changing the account email, unlinking providers, or deleting the account. Those depend on a working domain and Resend configuration and should be separate issues.

## Verification

Tests must cover:

- unauthenticated access;
- an existing-password user changing the password;
- incorrect current password;
- unchanged password rejection;
- a passwordless Google user creating a password while keeping the Google account link;
- a passwordless email-link user creating a password;
- minimum length and confirmation validation;
- password hashes and provider records never appearing in responses;
- the account-menu entry, real account data, both form modes, duplicate-submit protection, and success/error feedback.

Run the account-focused tests, Web lint and type checks, theme checks, an appropriate production build, and browser verification for both password modes before completion.
