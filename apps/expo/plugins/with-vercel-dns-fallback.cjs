const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { withMainApplication } = require("expo/config-plugins");

const IMPORT_ANCHOR =
  "import com.facebook.react.defaults.DefaultReactNativeHost\n";
const CLASS_ANCHOR =
  "class MainApplication : Application(), ReactApplication {\n";
const ON_CREATE_ANCHOR = `  override fun onCreate() {
    super.onCreate()
`;

const IMPORTS = `import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.TimeUnit
`;

const DNS_OBJECT = `${readFileSync(join(__dirname, "android/vercel-dns.kt"), "utf8").trim()}\n\n`;

const SETUP = `    // CAMPDELIVER_NETWORK_FACTORY_START
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(applicationContext)
          .dns(CampDeliverVercelDns)
          .connectTimeout(5, TimeUnit.SECONDS)
          .readTimeout(20, TimeUnit.SECONDS)
          .writeTimeout(20, TimeUnit.SECONDS)
          .callTimeout(30, TimeUnit.SECONDS)
          .eventListener(object : okhttp3.EventListener() {
            override fun callFailed(call: okhttp3.Call, ioe: java.io.IOException) {
              CampDeliverVercelDns.invalidate(call.request().url.host)
            }
          })
          .build()
    }
    // CAMPDELIVER_NETWORK_FACTORY_END
`;

function injectVercelDnsFallback(contents) {
  if (contents.includes("private object CampDeliverVercelDns")) {
    // Repeated prebuilds must upgrade both the old per-request hook and the
    // newer base-client factory without duplicating either generated block.
    let next = contents
      .replace(
        /import com.facebook.react.modules.network.(?:NetworkingModule|OkHttpClientProvider)[\s\S]*?import java.net.InetAddress\n(?:import java.util.concurrent.[^\n]+\n)*/,
        IMPORTS,
      )
      .replace(
        /private object CampDeliverVercelDns[\s\S]*?(?=class MainApplication)/,
        DNS_OBJECT,
      );

    next = next.replace(
      /    \/\/ CAMPDELIVER_NETWORK_FACTORY_START[\s\S]*?    \/\/ CAMPDELIVER_NETWORK_FACTORY_END\n/,
      "",
    );
    next = next.replace(
      /(?:    android\.util\.Log\.i\("CampDeliverDns", "installing React Native network hook"\)\n)*    NetworkingModule.setCustomClientBuilder \{ builder ->[\s\S]*?\n    \}\n/,
      "",
    );

    if (!next.includes(ON_CREATE_ANCHOR)) {
      throw new Error(
        "Unable to install CAmpDeliver Vercel DNS fallback: onCreate anchor changed.",
      );
    }
    return next.replace(ON_CREATE_ANCHOR, ON_CREATE_ANCHOR + SETUP);
  }

  if (!contents.includes(IMPORT_ANCHOR)) {
    throw new Error(
      "Unable to install CAmpDeliver Vercel DNS fallback: MainApplication import anchor changed.",
    );
  }
  if (!contents.includes(CLASS_ANCHOR)) {
    throw new Error(
      "Unable to install CAmpDeliver Vercel DNS fallback: MainApplication class anchor changed.",
    );
  }
  if (!contents.includes(ON_CREATE_ANCHOR)) {
    throw new Error(
      "Unable to install CAmpDeliver Vercel DNS fallback: onCreate anchor changed.",
    );
  }

  let next = contents.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORTS);
  next = next.replace(CLASS_ANCHOR, DNS_OBJECT + CLASS_ANCHOR);
  next = next.replace(ON_CREATE_ANCHOR, ON_CREATE_ANCHOR + SETUP);
  return next;
}

function withVercelDnsFallback(config) {
  return withMainApplication(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "kt") {
      throw new Error(
        "CAmpDeliver Vercel DNS fallback requires a Kotlin MainApplication.",
      );
    }

    nextConfig.modResults.contents = injectVercelDnsFallback(
      nextConfig.modResults.contents,
    );
    return nextConfig;
  });
}

module.exports = withVercelDnsFallback;
module.exports.injectVercelDnsFallback = injectVercelDnsFallback;
