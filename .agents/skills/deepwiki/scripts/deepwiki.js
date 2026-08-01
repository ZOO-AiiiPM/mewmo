#!/usr/bin/env node
const https = require('https');

const args = process.argv.slice(2);
const command = args[0];
const repo = args[1];
const extra = args.slice(2).join(' ');

if (!command || !repo) {
  console.error('Usage: deepwiki.js <command> <owner/repo> [question]');
  console.log('Commands: ask, structure, contents');
  process.exit(2);
}

if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
  console.error('Repository must use owner/repo format.');
  process.exit(2);
}

if (!['ask', 'structure', 'contents'].includes(command)) {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

if (command === 'ask' && !extra) {
  console.error('The ask command requires a question.');
  process.exit(2);
}

const toolName = {
  ask: 'ask_question',
  structure: 'read_wiki_structure',
  contents: 'read_wiki_contents',
}[command];

const toolArguments = { repoName: repo };
if (command === 'ask') toolArguments.question = extra;

const body = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: toolName, arguments: toolArguments },
});

const req = https.request('https://mcp.deepwiki.com/mcp', {
  method: 'POST',
  headers: {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let responseBody = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { responseBody += chunk; });
  res.on('end', () => {
    if (res.statusCode !== 200 && res.statusCode !== 202) {
      console.error(`DeepWiki request failed: HTTP ${res.statusCode}`);
      if (responseBody) console.error(responseBody.trim());
      process.exitCode = 1;
      return;
    }

    const payloads = responseBody
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (payloads.length === 0 && responseBody.trim().startsWith('{')) {
      payloads.push(responseBody.trim());
    }

    for (const payload of payloads) {
      let message;
      try {
        message = JSON.parse(payload);
      } catch {
        continue;
      }

      if (message.error) {
        console.error(`DeepWiki error: ${message.error.message || JSON.stringify(message.error)}`);
        process.exitCode = 1;
        return;
      }

      const result = message.result;
      if (!result) continue;
      const text = result.structuredContent?.result
        || result.content?.map((item) => item.text).filter(Boolean).join('\n');
      console.log(text || JSON.stringify(result, null, 2));
      return;
    }

    console.error('DeepWiki returned no parseable MCP response.');
    process.exitCode = 1;
  });
});

req.setTimeout(60000, () => {
  req.destroy(new Error('DeepWiki request timed out after 60 seconds.'));
});
req.on('error', (error) => {
  console.error(`DeepWiki request failed: ${error.message}`);
  process.exitCode = 1;
});
req.end(body);
