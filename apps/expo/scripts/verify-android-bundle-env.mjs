import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundlePath = resolve(
  process.cwd(),
  process.argv[2] ??
    "android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle",
);
const requiredVariables = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]);
if (missingVariables.length > 0) {
  console.error(
    `Cannot verify Android bundle; missing environment variables: ${missingVariables.join(", ")}`,
  );
  process.exit(1);
}

const bundle = readFileSync(bundlePath);
const omittedVariables = requiredVariables.filter((name) => {
  const value = process.env[name];
  return value === undefined || !bundle.includes(Buffer.from(value, "utf8"));
});

if (omittedVariables.length > 0) {
  console.error(
    `Android bundle omitted required Expo public variables: ${omittedVariables.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `Verified ${requiredVariables.length} required Expo public variables in the Android bundle.`,
);
