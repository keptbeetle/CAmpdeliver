export class CollegeEmailConfigurationError extends Error {
  constructor(message = "College email verification is not configured.") {
    super(message);
    this.name = "CollegeEmailConfigurationError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

type Environment = Record<string, string | undefined>;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function normalizeIndianPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const subscriber =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : null;

  if (!subscriber || !INDIAN_MOBILE_PATTERN.test(subscriber)) return null;
  return `+91${subscriber}`;
}

export function getCollegeEmailDomains(
  env: Environment = process.env,
): readonly string[] {
  const configured = env.COLLEGE_EMAIL_DOMAINS?.split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  const domains = [...new Set(configured ?? [])].filter((domain) =>
    DOMAIN_PATTERN.test(domain),
  );

  if (domains.length > 0) return domains;
  if (env.NODE_ENV === "test") return ["campus.edu"];
  throw new CollegeEmailConfigurationError();
}

export function isAllowedCollegeEmail(
  value: string,
  domains: readonly string[],
): boolean {
  const email = normalizeEmail(value);
  if (!email) return false;
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1);
  return domains.includes(domain);
}

export function classifyLoginIdentifier(
  value: string,
):
  | { type: "email"; email: string }
  | { type: "phone"; phoneNumber: string }
  | null {
  if (value.includes("@")) {
    const email = normalizeEmail(value);
    return email ? { type: "email", email } : null;
  }

  const phoneNumber = normalizeIndianPhone(value);
  return phoneNumber ? { type: "phone", phoneNumber } : null;
}
