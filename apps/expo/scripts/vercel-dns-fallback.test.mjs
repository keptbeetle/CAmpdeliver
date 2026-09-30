import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  injectVercelDnsFallback,
} = require("../plugins/with-vercel-dns-fallback.cjs");

const mainApplicationFixture = `package com.campdeliver.app

import android.app.Application
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

test("injects the CAmpDeliver Vercel DNS fallback before React Native starts", () => {
  const result = injectVercelDnsFallback(mainApplicationFixture);

  assert.match(
    result,
    /import com\.facebook\.react\.modules\.network\.NetworkingModule/,
  );
  assert.match(result, /import okhttp3\.Dns/);
  assert.match(result, /VERCEL_EDGE_DISCOVERY_HOST = "cname\.vercel-dns\.com"/);
  assert.match(result, /Dns\.SYSTEM\.lookup\(VERCEL_EDGE_DISCOVERY_HOST\)/);
  assert.match(result, /normalized\.startsWith\("c-ampdeliver-nextjs-"\)/);
  assert.match(
    result,
    /NetworkingModule\.setCustomClientBuilder[\s\S]*builder\.dns\(CampDeliverVercelDns\)/,
  );
  assert.ok(
    result.indexOf("NetworkingModule.setCustomClientBuilder") <
      result.indexOf("loadReactNative(this)"),
  );
});

test("injection is idempotent", () => {
  const once = injectVercelDnsFallback(mainApplicationFixture);
  assert.equal(injectVercelDnsFallback(once), once);
});

test("updates an existing fallback to the canonical Vercel DNS edge", () => {
  const current = injectVercelDnsFallback(mainApplicationFixture);
  const stale = current.replace(
    'VERCEL_EDGE_DISCOVERY_HOST = "cname.vercel-dns.com"',
    'VERCEL_EDGE_DISCOVERY_HOST = "vercel.com"',
  );

  const updated = injectVercelDnsFallback(stale);
  assert.match(
    updated,
    /VERCEL_EDGE_DISCOVERY_HOST = "cname\.vercel-dns\.com"/,
  );
  assert.doesNotMatch(updated, /VERCEL_EDGE_DISCOVERY_HOST = "vercel\.com"/);
});

test("fails closed if the Expo MainApplication template changes", () => {
  assert.throws(
    () =>
      injectVercelDnsFallback(
        mainApplicationFixture.replace(
          "import com.facebook.react.defaults.DefaultReactNativeHost\n",
          "",
        ),
      ),
    /import anchor changed/,
  );
});
