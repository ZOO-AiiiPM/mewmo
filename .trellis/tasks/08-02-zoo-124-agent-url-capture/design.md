# ZOO-124 Technical Design

## Boundary

URL capture becomes an application service with two operations: create a clip and discover/create a feed for an actor. The Web API route and Agent adapter call the same service, so URL normalization, ownership filtering, duplicate recovery and failure cleanup remain single-path behavior.

The service accepts fetch/discovery dependencies at the composition root. This preserves the Web integration-fixture network policy while allowing the Agent process to use the same public-source behavior. It returns a small domain result; the Agent tool maps that result to a sanitized public summary.

## Agent Contract

- `clip_url_save` directly invokes clip creation only when the model has identified an explicit save/bookmark/clip request. Its description and system prompt state that URL-only, reading and summarizing are not authorization.
- `feed_url_subscribe` discovers exactly one public addable source, then creates it through the existing feed path. Ambiguous or unrecognized discovery returns a no-write failure asking for a public RSS/Atom URL.
- These tools are direct writes, not `AiAction` proposals. Existing proposal tools retain their confirmation behavior.
- SSE tool lifecycle events retain only tool name, action and sanitized result status. No raw URL, parameters, fetched content or provider error is projected.

## Compatibility And Rollback

No schema, shared type, Workflow or runtime protocol changes. Web route responses remain unchanged. Rollback is limited to removing the tools and returning the existing Web routes to their direct service invocation; persisted records use existing tables and constraints.
