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
    /import com\.facebook\.react\.modules\.network\.OkHttpClientProvider/,
  );
  assert.match(result, /import okhttp3\.Dns/);
  assert.match(result, /VERCEL_EDGE_DISCOVERY_HOST = "cname\.vercel-dns\.com"/);
  assert.match(result, /Dns\.SYSTEM\.lookup\(VERCEL_EDGE_DISCOVERY_HOST\)/);
  assert.match(result, /auth\.getSignupConfig/);
  assert.match(result, /TRPC_HEALTH_PATH/);
  assert.match(result, /android-route-probe/);
  assert.match(result, /\.url\("https:\/\/\$hostname\$TRPC_HEALTH_PATH"\)/);
  assert.match(result, /\.get\(\)/);
  assert.doesNotMatch(result, /\.head\(\)/);
  assert.match(result, /TimeUnit\.SECONDS\.toNanos\(60\)/);
  assert.match(result, /fun invalidate\(hostname: String\)/);
  assert.match(result, /normalized\.startsWith\("c-ampdeliver-nextjs-"\)/);
  assert.match(
    result,
    /OkHttpClientProvider\.setOkHttpClientFactory[\s\S]*\.dns\(CampDeliverVercelDns\)/,
  );
  assert.match(
    result,
    /OkHttpClientProvider\.createClientBuilder\(applicationContext\)/,
  );
  assert.doesNotMatch(result, /\.proxy\(java\.net\.Proxy\.NO_PROXY\)/);
  assert.match(result, /\.connectTimeout\(5, TimeUnit\.SECONDS\)/);
  assert.match(result, /\.callTimeout\(30, TimeUnit\.SECONDS\)/);
  assert.match(result, /CampDeliverVercelDns\.invalidate/);
  assert.doesNotMatch(result, /NetworkingModule\.setCustomClientBuilder/);
  assert.ok(
    result.indexOf("OkHttpClientProvider.setOkHttpClientFactory") <
      result.indexOf("loadReactNative(this)"),
  );
});

test("injection is idempotent", () => {
  const once = injectVercelDnsFallback(mainApplicationFixture);
  assert.equal(injectVercelDnsFallback(once), once);
});

test("upgrades a prebuilt application from the old DNS-only plugin", () => {
  const previous = mainApplicationFixture
    .replace(
      "import com.facebook.react.defaults.DefaultReactNativeHost\n",
      "import com.facebook.react.defaults.DefaultReactNativeHost\n" +
        "import com.facebook.react.modules.network.NetworkingModule\n" +
        "import okhttp3.Dns\n" +
        "import java.net.InetAddress\n",
    )
    .replace(
      "class MainApplication",
      "private object CampDeliverVercelDns : Dns {\n" +
        '  override fun lookup(hostname: String) = Dns.SYSTEM.lookup("cname.vercel-dns.com")\n' +
        "}\n\nclass MainApplication",
    )
    .replace(
      "    super.onCreate()\n",
      "    super.onCreate()\n" +
        "    NetworkingModule.setCustomClientBuilder { builder ->\n" +
        "      builder.dns(CampDeliverVercelDns)\n" +
        "    }\n",
    );

  assert.equal(
    injectVercelDnsFallback(previous),
    injectVercelDnsFallback(mainApplicationFixture),
  );
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
