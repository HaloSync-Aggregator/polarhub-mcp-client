# Contributing

Thanks for helping improve `polarhub-mcp-client`.

This repository is a public AI chatbot client for PolarHub NDC API integration via MCP (Model Context Protocol).

## Scope

- Code in this repository is released under the MIT License.
- Access to the PolarHub MCP Gateway is governed separately through PolarHub onboarding and API key issuance.
- If you have completed onboarding and received API credentials, you may use this project to run the AI flight booking chatbot with your provisioned access.

## How To Report Issues

Issues are welcome for:

- Reproducible bugs in the chatbot or MCP integration
- Documentation gaps or incorrect setup instructions
- LLM provider integration issues

When opening an issue, please include:

- What you were trying to do
- Exact steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots or logs when safe to share
- Never post secrets, API keys, or LLM provider credentials

## Pull Requests

Pull request policy is still being finalized.

Until that policy is published:

- Please open an issue first for non-trivial code changes
- Small documentation fixes are welcome
- Maintainers may request changes, re-scope a PR, or close it if it does not fit the current roadmap

## Local Validation

Before submitting a code change, run:

```bash
npm run build
npm run start
curl http://localhost:3000/health
```
