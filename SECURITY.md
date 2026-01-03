# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Whatseerr seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **GitHub Security Advisories** (preferred): Use the [Security tab](https://github.com/sufxgit/whatseerr/security/advisories) to privately report vulnerabilities
2. **GitHub Issues**: For non-critical security concerns, you may create a private issue

Please include the following information:
- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Updates**: We will provide regular updates on our progress
- **Timeline**: We aim to patch critical vulnerabilities within 7 days
- **Credit**: We will credit you in the security advisory unless you prefer to remain anonymous

## Security Best Practices for Deployment

### Configuration Security

1. **API Keys**: Never commit API keys to version control
   - Store API keys in `config.json` (already in `.gitignore`)
   - Use environment variables for sensitive data when possible
   - Rotate API keys regularly

2. **File Permissions**:
   ```bash
   chmod 600 config/config.json  # Readable only by owner
   ```

3. **Network Security**:
   - Run Whatseerr behind a reverse proxy (nginx, Traefik)
   - Use HTTPS for webhook endpoints when exposed to internet
   - Restrict webhook access to WAHA and Seerr IPs if possible

### Docker Security

1. **Run as Non-Root User**: The container runs as root by default. For production, consider creating a non-root user:
   ```dockerfile
   USER node
   ```

2. **Read-Only Root Filesystem**:
   ```bash
   docker run --read-only -v /path/to/config:/config:rw whatseerr
   ```

3. **Resource Limits**:
   ```yaml
   # docker-compose.yml
   services:
     whatseerr:
       deploy:
         resources:
           limits:
             cpus: '0.5'
             memory: 512M
   ```

4. **Network Isolation**:
   - Use Docker networks to isolate services
   - Only expose necessary ports

### Seerr Configuration

1. **Dedicated User**: Create a dedicated user in Seerr for Whatseerr
   - Limit permissions to only what's needed
   - Use a separate API key per integration

2. **Admin Users**: Carefully manage `admin: true` flag in `userIdMappings`
   - Admin users can approve/decline requests
   - Review admin list regularly

### WAHA Security

1. **API Key**: Use a strong, unique API key for WAHA
2. **Session Management**: Use dedicated session names
3. **Webhook Validation**: Verify webhook requests come from WAHA

### Regular Maintenance

1. **Updates**: Keep Whatseerr and dependencies up to date
   ```bash
   docker pull ghcr.io/sufxgit/whatseerr:latest
   ```

2. **Audit Logs**: Regularly review logs for suspicious activity
   ```bash
   docker logs whatseerr-bot | grep -i "error\|warn"
   ```

3. **Dependency Scanning**: Use tools like `npm audit` to check for vulnerabilities
   ```bash
   npm audit
   npm audit fix
   ```

## Known Security Considerations

### LID Resolution
- LID (Linked ID) cannot be resolved until users initiate a chat with the bot
- This is a WhatsApp limitation, not a security issue
- Admins will be notified when LID resolution fails

### Rate Limiting
- Built-in rate limiting protects against abuse (100 requests/minute by default)
- Configurable via `config.json`: `rateLimit.maxRequests`

### User Authentication
- Users must be configured in `userIdMappings` to interact with the bot
- Messages from unknown users are ignored (logged but not processed)

## Disclosure Policy

When we receive a security vulnerability report, we will:

1. Confirm the vulnerability and determine its impact
2. Develop and test a fix
3. Release a security advisory and new version
4. Credit the reporter (unless anonymity requested)

We follow the principle of responsible disclosure and request that security researchers:
- Allow reasonable time to respond before public disclosure
- Make a good faith effort to avoid privacy violations and service disruption
- Do not access or modify other users' data

## Contact

For security-related questions or concerns, please use GitHub Security Advisories or contact the maintainers through GitHub issues.

## Additional Resources

- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [WhatsApp Security](https://faq.whatsapp.com/820124435853543)
