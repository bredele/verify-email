export class EmailVerificationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EmailVerificationError';
  }
}

export class DNSError extends EmailVerificationError {
  constructor(message: string, domain: string, originalError?: Error) {
    super(message, 'DNS_ERROR', { domain, originalError: originalError?.message });
  }
}