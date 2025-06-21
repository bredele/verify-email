import { promises as dns } from "dns";

export const hasARecord = async (domain: string): Promise<boolean> => {
  try {
    await dns.resolve4(domain);
    return true;
  } catch {
    return false;
  }
};