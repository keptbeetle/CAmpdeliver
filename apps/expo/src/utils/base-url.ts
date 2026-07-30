const FALLBACK_BACKEND_URL =
  "https://c-ampdeliver-nextjs-git-feature-web-d0b84f-keptbeetles-projects.vercel.app";

export const getBaseUrl = () =>
  (process.env.EXPO_PUBLIC_API_URL ?? FALLBACK_BACKEND_URL).replace(/\/$/, "");
