---
name: deepwiki
description: Query DeepWiki for public GitHub repository documentation, wiki structure, architecture, and grounded codebase questions. Use when the user mentions DeepWiki, asks to explain or explore a public GitHub repository, or needs repository-level research before implementation.
homepage: https://docs.devin.ai/work-with-devin/deepwiki-mcp
---

# DeepWiki

Use this skill to access documentation for public GitHub repositories via the DeepWiki MCP server. You can search repository wikis, get structure, and ask complex questions grounded in the repository's documentation.

## Commands

### Ask Question
Ask any question about a GitHub repository and get an AI-powered, context-grounded response.
```bash
SKILL_DIR="<absolute path to this skill directory>"
node "$SKILL_DIR/scripts/deepwiki.js" ask <owner/repo> "your question"
```

### Read Wiki Structure
Get a list of documentation topics for a GitHub repository.
```bash
SKILL_DIR="<absolute path to this skill directory>"
node "$SKILL_DIR/scripts/deepwiki.js" structure <owner/repo>
```

### Read Wiki Contents
View documentation about a specific path in a GitHub repository's wiki.
```bash
SKILL_DIR="<absolute path to this skill directory>"
node "$SKILL_DIR/scripts/deepwiki.js" contents <owner/repo>
```

## Examples

**Ask about Devin's MCP usage:**
```bash
SKILL_DIR="<absolute path to this skill directory>"
node "$SKILL_DIR/scripts/deepwiki.js" ask cognitionlabs/devin "How do I use MCP?"
```

**Get the structure for the React docs:**
```bash
SKILL_DIR="<absolute path to this skill directory>"
node "$SKILL_DIR/scripts/deepwiki.js" structure facebook/react
```

## Notes
- Resolve `SKILL_DIR` from the directory containing the `SKILL.md` you read. Do not assume the current working directory is the skill directory.
- Base server: `https://mcp.deepwiki.com/mcp` using Streamable HTTP.
- Works for public repositories only.
- No authentication required.
- Treat generated explanations as a research aid. Verify decisive claims against source code or official documentation before changing code.
