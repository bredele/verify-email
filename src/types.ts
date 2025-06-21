export interface VerifyResult {
  valid: boolean;
  confidence: "high" | "medium" | "low" | "invalid";
  reason: string;
  isCatchAll: boolean;
  debug?: {
    mxRecord?: string;
  };
}

export interface VerifyOptions {
  debug?: boolean;
}