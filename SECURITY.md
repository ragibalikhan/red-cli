# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please open an issue or contact the maintainers. All security vulnerabilities will be promptly addressed.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Security Best Practices

- Never commit API keys to the repository
- Use environment variables for sensitive configuration
- Review commands before confirming destructive operations
- Keep dependencies updated (`npm audit`)
- Use `npm run lint` before committing

## Built-in Security Features

### Command Safety

- **Destructive command confirmation**: Commands like `rm -rf /` require explicit confirmation
- **Blocked commands list**: Configurable in `~/.red/config.json`
- **HTTP request restrictions**: Localhost blocking enabled by default

### Git Operations

- **Git push requires confirmation**: No accidental pushes
- **Checkpoint before auto-mode**: Creates backup before autonomous operations

### Auto Mode Guardrails

- Pauses before: npm installs, git push, external HTTP requests
- Tool call limits to prevent infinite loops
- Configurable max iterations

## Environment Variables

Never store sensitive data in config files:

```bash
# DO: Use environment variables
export OPENAI_API_KEY="sk-..."

# DON'T: Store in ~/.red/config.json
# "apiKeys": { "openai": "sk-..." } // Only if you trust your machine
```

## Reporting Security Issues

For security vulnerabilities, DO NOT open a public issue. Contact maintainers directly through:

1. GitHub Security Advisories
2. Email (if available in repo)

Response time: Within 48 hours for critical issues.