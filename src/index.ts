import { promises as dns } from "dns";
import { Socket } from "net";
import { setTimeout as delay } from "node:timers/promises";

export interface VerifyResult {
  valid: boolean;
  confidence: "high" | "medium" | "low" | "invalid";
  reason: string;
  isCatchAll: boolean;
}

const DNS_TIMEOUT = 5000;
const SMTP_TIMEOUT = 30000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMsg: string
): Promise<T> {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw new Error(errorMsg);
    }),
  ]);
}

function createResult(
  valid: boolean,
  confidence: "high" | "medium" | "low" | "invalid",
  reason: string,
  isCatchAll = false
): VerifyResult {
  return { valid, confidence, reason, isCatchAll };
}

async function resolveDNS(domain: string): Promise<VerifyResult | { mxRecords: any[] }> {
  try {
    const mxRecords = await withTimeout(
      dns.resolveMx(domain),
      DNS_TIMEOUT,
      "DNS timeout"
    );

    if (!mxRecords || mxRecords.length === 0) {
      return createResult(false, "invalid", "No mail servers found");
    }

    // Sort by priority (lower number = higher priority)
    mxRecords.sort((a, b) => a.priority - b.priority);
    return { mxRecords };
  } catch {
    // Fallback to A record
    try {
      await dns.resolve4(domain);
      return createResult(true, "low", "No MX record, domain exists");
    } catch {
      return createResult(false, "invalid", "Domain does not exist");
    }
  }
}

export default async function verify(email: string): Promise<VerifyResult> {
  const domain = email.split("@")[1];
  if (!domain) {
    return createResult(false, "invalid", "Invalid email format");
  }

  try {
    const dnsResult = await resolveDNS(domain);
    if ("valid" in dnsResult) return dnsResult;

    const primaryMx = dnsResult.mxRecords[0].exchange;
    const smtpResult = await testSMTP(primaryMx, email);
    
    const isCatchAll = smtpResult.accepted 
      ? await testCatchAll(primaryMx, domain)
      : false;

    return determineResult(smtpResult, isCatchAll);
  } catch (error) {
    return createResult(
      false,
      "invalid",
      `Verification failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

interface SMTPResult {
  accepted: boolean;
  responseCode: number;
  responseText: string;
  isTemporary: boolean;
}

async function testSMTP(mxHost: string, email: string): Promise<SMTPResult> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let responseBuffer = "";
    let stage = "connect";

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({
        accepted: false,
        responseCode: 0,
        responseText: "Connection timeout",
        isTemporary: true,
      });
    }, SMTP_TIMEOUT);

    socket.connect(25, mxHost);

    socket.on("data", (data) => {
      responseBuffer += data.toString();

      if (responseBuffer.includes("\n")) {
        const lines = responseBuffer.split("\n");
        const lastLine = lines[lines.length - 2] || lines[lines.length - 1];
        const code = parseInt(lastLine.substring(0, 3));

        if (stage === "connect" && code === 220) {
          stage = "helo";
          socket.write("HELO verify.local\r\n");
        } else if (stage === "helo" && code === 250) {
          stage = "mail";
          socket.write("MAIL FROM:<test@verify.local>\r\n");
        } else if (stage === "mail" && code === 250) {
          stage = "rcpt";
          socket.write(`RCPT TO:<${email}>\r\n`);
        } else if (stage === "rcpt") {
          clearTimeout(timeout);
          socket.write("QUIT\r\n");
          socket.destroy();

          const isTemporary = code >= 400 && code < 500;
          const accepted = code === 250;

          resolve({
            accepted,
            responseCode: code,
            responseText: lastLine,
            isTemporary,
          });
        } else if (code >= 400) {
          clearTimeout(timeout);
          socket.write("QUIT\r\n");
          socket.destroy();

          const isTemporary = code >= 400 && code < 500;
          resolve({
            accepted: false,
            responseCode: code,
            responseText: lastLine,
            isTemporary,
          });
        }

        responseBuffer = "";
      }
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve({
        accepted: false,
        responseCode: 0,
        responseText: "Connection failed",
        isTemporary: true,
      });
    });
  });
}

async function testCatchAll(mxHost: string, domain: string): Promise<boolean> {
  const fakeEmail = `nonexistent${Date.now()}@${domain}`;
  const result = await testSMTP(mxHost, fakeEmail);
  return result.accepted;
}

function determineResult(
  smtpResult: SMTPResult,
  isCatchAll: boolean
): VerifyResult {
  if (smtpResult.accepted) {
    if (isCatchAll) {
      return {
        valid: true,
        confidence: "medium",
        reason: "Email accepted but domain is catch-all",
        isCatchAll: true,
      };
    } else {
      return {
        valid: true,
        confidence: "high",
        reason: "Email accepted by mail server",
        isCatchAll: false,
      };
    }
  } else if (smtpResult.isTemporary) {
    return {
      valid: true,
      confidence: "medium",
      reason: `Temporary rejection (${smtpResult.responseCode}): ${smtpResult.responseText}`,
      isCatchAll: false,
    };
  } else if (smtpResult.responseCode === 0) {
    return {
      valid: false,
      confidence: "low",
      reason: smtpResult.responseText,
      isCatchAll: false,
    };
  } else {
    return {
      valid: false,
      confidence: "invalid",
      reason: `Permanently rejected (${smtpResult.responseCode}): ${smtpResult.responseText}`,
      isCatchAll: false,
    };
  }
}
