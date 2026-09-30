const { withMainApplication } = require("expo/config-plugins");

const IMPORT_ANCHOR =
  "import com.facebook.react.defaults.DefaultReactNativeHost\n";
const CLASS_ANCHOR =
  "class MainApplication : Application(), ReactApplication {\n";
const ON_CREATE_ANCHOR = `  override fun onCreate() {
    super.onCreate()
`;

const IMPORTS = `import com.facebook.react.modules.network.NetworkingModule
import okhttp3.Dns
import java.net.InetAddress
`;

const DNS_OBJECT = `private object CampDeliverVercelDns : Dns {
  private const val VERCEL_EDGE_DISCOVERY_HOST = "cname.vercel-dns.com"

  private fun isCampDeliverVercelHost(hostname: String): Boolean {
    val normalized = hostname.lowercase()
    return normalized == "c-ampdeliver-nextjs.vercel.app" ||
        (normalized.startsWith("c-ampdeliver-nextjs-") &&
            normalized.endsWith(".vercel.app"))
  }

  override fun lookup(hostname: String): List<InetAddress> {
    if (!isCampDeliverVercelHost(hostname)) {
      return Dns.SYSTEM.lookup(hostname)
    }

    // Keep the real request hostname for TLS/SNI, but try Vercel's reachable
    // public edge address first on networks whose vercel.app route is broken.
    val edgeAddresses =
        runCatching { Dns.SYSTEM.lookup(VERCEL_EDGE_DISCOVERY_HOST) }
            .getOrDefault(emptyList())
    val directAddresses =
        runCatching { Dns.SYSTEM.lookup(hostname) }.getOrDefault(emptyList())

    val addresses = (edgeAddresses + directAddresses)
        .distinctBy { it.hostAddress }
    if (addresses.isEmpty()) {
      throw java.net.UnknownHostException(hostname)
    }
    return addresses
  }
}

`;

const SETUP = `    NetworkingModule.setCustomClientBuilder { builder ->
      builder.dns(CampDeliverVercelDns)
    }
`;

function injectVercelDnsFallback(contents) {
  if (
    contents.includes("private object CampDeliverVercelDns") &&
    contents.includes("NetworkingModule.setCustomClientBuilder")
  ) {
    return contents.replace(
      /private const val VERCEL_EDGE_DISCOVERY_HOST = "[^"]+"/,
      'private const val VERCEL_EDGE_DISCOVERY_HOST = "cname.vercel-dns.com"',
    );
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
