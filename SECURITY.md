# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in AROS, please report it responsibly.

**Do not open a public issue.** Instead, email **security@tzusman.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

You should receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

AROS handles:
- API keys (Anthropic) via environment variables
- Agent-submitted content (files, text) via the review pipeline
- Filesystem access scoped to the `.aros/` project directory

Security issues in any of these areas are in scope.
