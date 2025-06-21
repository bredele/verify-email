import { VerifyResult } from "./types";
import { DNSError, EmailVerificationError } from "./errors";
import { DEBUG_MODE } from "./constants";
import { hasARecord } from "./dns";
import { extractDomain } from "./validation";
import getMailServer from "@bredele/get-mail-server";
import smtpVerify from "@bredele/smtp-verify-email";

const verify = async (email: string): Promise<VerifyResult> => {
  const domain = extractDomain(email);
  if (!domain) {
    throw new EmailVerificationError("Invalid email format", "INVALID_EMAIL");
  }
  try {
    const mxRecord = await getMailServer(domain);
    const isAccepted = await smtpVerify(mxRecord, email);
    // Test for catch-all by trying a fake email
    const isCatchAll = isAccepted
      ? await testCatchAll(mxRecord, domain)
      : false;

    if (isAccepted) {
      const confidence = isCatchAll ? "medium" : "high";
      const reason = isCatchAll
        ? "Email accepted but domain is catch-all"
        : "Email accepted by mail server";

      return {
        valid: true,
        confidence,
        reason,
        isCatchAll,
        debug: DEBUG_MODE ? { mxRecord } : undefined,
      };
    } else {
      return {
        valid: false,
        confidence: "invalid",
        reason: "Email rejected by mail server",
        isCatchAll: false,
        debug: DEBUG_MODE ? { mxRecord } : undefined,
      };
    }
  } catch (error) {
    const errorType = classifyError(error);

    switch (errorType) {
      case "timeout":
        return createTimeoutResult();
      case "dns_not_found":
        const hasA = await hasARecord(domain);
        if (hasA) {
          return createDNSFallbackResult();
        }
        throw new DNSError("No MX or A records found for domain", domain);
      default:
        throw new DNSError("No MX or A records found for domain", domain);
    }
  }
};

// Error classification for better catch block handling
type ErrorType = "timeout" | "dns_not_found" | "other";

const classifyError = (error: any): ErrorType => {
  const isTimeout =
    error.code === "ETIMEDOUT" || error.message?.includes("ETIMEDOUT");
  const isDNSNotFound =
    error.code === "ENOTFOUND" || error.message?.includes("ENOTFOUND");

  if (isTimeout) return "timeout";
  if (isDNSNotFound) return "dns_not_found";
  return "other";
};

// Result builders for consistent response formatting
const createTimeoutResult = (): VerifyResult => ({
  valid: true,
  confidence: "medium",
  reason: "SMTP server timeout (domain likely valid)",
  isCatchAll: false,
  debug: DEBUG_MODE ? { mxRecord: "timeout" } : undefined,
});

const createDNSFallbackResult = (): VerifyResult => ({
  valid: true,
  confidence: "low",
  reason: "No MX record, domain exists",
  isCatchAll: false,
  debug: DEBUG_MODE ? { mxRecord: "none" } : undefined,
});

// Simple catch-all test using the external package
const testCatchAll = async (
  mxRecord: string,
  domain: string
): Promise<boolean> => {
  const fakeEmail = `nonexistent${Date.now()}@${domain}`;
  try {
    return await smtpVerify(mxRecord, fakeEmail);
  } catch {
    return false;
  }
};

// Re-export types and errors
export { EmailVerificationError, DNSError } from "./errors";
export type { VerifyResult } from "./types";

export default verify;
