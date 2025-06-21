export const extractDomain = (email: string): string | null => {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1]) {
    return null;
  }
  return parts[1].trim().toLowerCase();
};
