export class CollegeEmailConfigurationError extends Error {
  constructor(message = "College email domain configuration is invalid.") {
    super(message);
    this.name = "CollegeEmailConfigurationError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;
const DEFAULT_COLLEGE_EMAIL_DOMAINS = ["iiitdmj.ac.in"] as const;

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
  const rawConfigured = env.COLLEGE_EMAIL_DOMAINS?.trim();
  if (!rawConfigured) {
    return env.NODE_ENV === "test"
      ? ["campus.edu"]
      : DEFAULT_COLLEGE_EMAIL_DOMAINS;
  }

  const configured = rawConfigured
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  if (
    configured.length === 0 ||
    configured.some((domain) => !DOMAIN_PATTERN.test(domain))
  ) {
    throw new CollegeEmailConfigurationError(
      "COLLEGE_EMAIL_DOMAINS contains an invalid email domain.",
    );
  }

  return [...new Set(configured)];
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
