// Indian numbers to international format (+91…), as Cal.com and HubSpot expect.
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}
