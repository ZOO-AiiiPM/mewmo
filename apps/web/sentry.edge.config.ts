import * as Sentry from "@sentry/nextjs";

import { createSentryOptions } from "./src/lib/observability/sentry";

const options = createSentryOptions({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV,
  release:
    process.env.SENTRY_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA,
});

if (options) Sentry.init(options);
