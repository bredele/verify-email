import { randomUUID } from "crypto";
import { VerifyResult, VerifyOptions } from "./types";
import { DNSError, EmailVerificationError } from "./errors";
import { hasARecord } from "./dns";
import { extractDomain } from "./validation";
import getMailServer from "@bredele/get-mail-server";
import smtpVerify from "@bredele/smtp-verify-email";

/**
 * Verifies if an email address truly exists using SMTP-based verification
 * @param email - The email address to verify
 * @param options - Configuration options including debug mode
 * @returns Promise resolving to verification result with confidence score
 */

const verify = async (
  email: string,
  options: VerifyOptions = {}
): Promise<VerifyResult> => {
  const debugMode = options.debug ?? false;
  const domain = extractDomain(email);
  if (!domain) {
    throw new EmailVerificationError("Invalid email format", "INVALID_EMAIL");
  }
  try {
    const mxRecord = await getMailServer(domain);
    // Test if the specific email is accepted by SMTP server
    const isAccepted = await smtpVerify(mxRecord, email);
    // Test for catch-all behavior by trying a fake email
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
        debug: debugMode ? { mxRecord } : undefined,
      };
    } else {
      return {
        valid: false,
        confidence: "invalid",
        reason: "Email rejected by mail server",
        isCatchAll: false,
        debug: debugMode ? { mxRecord } : undefined,
      };
    }
  } catch (error) {
    switch (classifyError(error)) {
      case "timeout":
        return createTimeoutResult(debugMode);
      case "dns_not_found":
        // No MX record found - check if domain has A record as fallback
        const hasA = await hasARecord(domain);
        if (hasA) {
          return createDNSFallbackResult(debugMode);
        }
        throw new DNSError("No MX or A records found for domain", domain);
      default:
        throw new DNSError("No MX or A records found for domain", domain);
    }
  }
};

/**
 * Classifies errors to determine appropriate handling strategy
 * Different error types require different confidence levels and responses
 */

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

/**
 * Creates result for SMTP timeout scenarios
 * Timeouts often indicate valid domains with restrictive servers
 */

const createTimeoutResult = (debugMode: boolean): VerifyResult => ({
  valid: true,
  confidence: "medium",
  reason: "SMTP server timeout (domain likely valid)",
  isCatchAll: false,
  debug: debugMode ? { mxRecord: "timeout" } : undefined,
});

/**
 * Creates result for domains with A records but no MX records
 * These domains exist but may not have proper email setup
 */

const createDNSFallbackResult = (debugMode: boolean): VerifyResult => ({
  valid: true,
  confidence: "low",
  reason: "No MX record, domain exists",
  isCatchAll: false,
  debug: debugMode ? { mxRecord: "none" } : undefined,
});

/**
 * Tests if a domain accepts all emails (catch-all behavior)
 * Uses a fake email address to see if the server accepts it
 */

const testCatchAll = async (
  mxRecord: string,
  domain: string
): Promise<boolean> => {
  // Generate a fake email using UUID to ensure uniqueness and avoid collisions
  const fakeEmail = `nonexistent-${randomUUID()}@${domain}`;
  try {
    return await smtpVerify(mxRecord, fakeEmail);
  } catch {
    return false;
  }
};

// Re-export types and errors
export { EmailVerificationError, DNSError } from "./errors";
export type { VerifyResult, VerifyOptions } from "./types";

export default verify;
