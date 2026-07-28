import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "apps/web/src/app/api/image-proxy/route.ts",
  "utf8",
);

test("image proxy route requires an authenticated session", () => {
  assert.match(source, /const session = await auth\(\)/);
  assert.match(source, /if \(!session\?\.user\?\.id\)/);
  assert.match(source, /\{ status: 401 \}/);
});

test("image proxy route fetches through the SSRF-safe outbound client", () => {
  assert.match(
    source,
    /import \{ fetchOutbound, UnsafeOutboundUrlError \} from "@mewmo\/content"/,
  );
  assert.match(source, /await fetchOutbound\(target\.href/);
  assert.match(source, /error instanceof UnsafeOutboundUrlError/);
  assert.match(source, /\{ status: 400 \}/);
});

test("image proxy route does not blindly follow redirects with bare fetch", () => {
  assert.doesNotMatch(source, /redirect:\s*"follow"/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test("image proxy responses are not cacheable by shared caches", () => {
  assert.match(source, /"Cache-Control":\s*"private,/);
  assert.doesNotMatch(source, /"Cache-Control":\s*"public/);
});
