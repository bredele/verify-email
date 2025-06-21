# verify-email

Check if an email address truly exists using SMTP based verification:

- DNS MX lookup with 5s timeout + A record fallback
- SMTP connection test with proper HELO/MAIL/RCPT sequence
- Proper SMTP etiquette (QUIT command, connection cleanup)
- Catch-all detection
- Confidence scoring based on server response

This module handles greylisting (4xx responses), catch-all domains, connection failures and DNS issues.

## Installation

```sh
$ npm install @bredele/verify-email
```

## Usage

```ts
import verify from "@bredele/verify-email";

await verify("test@gmail.com");
// => { valid: true, confidence: 'high' }

// With debug information
await verify("test@gmail.com", { debug: true });
// => { valid: true, confidence: 'high', debug: { mxRecord: 'gmail-smtp-in.l.google.com' } }
```

# Notes

Most residential internet providers block outbound connections to port 25 and there's no reliable way to bypass it. This results in SMTP verification timeouts which lower the confidence score (you might be a medium confidence for emails that truly exists).

## Confidence Scoring

- HIGH: Email accepted, not catch-all → Very likely deliverable
- MEDIUM: Accepted but catch-all OR temporary rejection (4xx) → Probably deliverable
- LOW: Connection issues, no MX record → Questionable
- INVALID: Domain doesn't exist OR permanent rejection (5xx) → Very unlikely
