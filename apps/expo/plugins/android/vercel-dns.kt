private object CampDeliverVercelDns : Dns {
  private const val VERCEL_EDGE_DISCOVERY_HOST = "cname.vercel-dns.com"
  private const val TRPC_HEALTH_PATH =
      "/api/trpc/auth.getSignupConfig?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
  private data class Route(val address: InetAddress, val expiresAt: Long)
  private val routes = ConcurrentHashMap<String, Route>()
  private val probes = Executors.newFixedThreadPool(4)

  fun invalidate(hostname: String) {
    routes.remove(hostname)
  }

  private fun isCampDeliverVercelHost(hostname: String): Boolean {
    val normalized = hostname.lowercase()
    return normalized == "c-ampdeliver-nextjs.vercel.app" ||
        (normalized.startsWith("c-ampdeliver-nextjs-") &&
            normalized.endsWith(".vercel.app"))
  }

  override fun lookup(hostname: String): List<InetAddress> {
    if (!isCampDeliverVercelHost(hostname)) return Dns.SYSTEM.lookup(hostname)

    val now = System.nanoTime()
    val cached = routes[hostname]
    if (cached != null && cached.expiresAt > now) {
      return listOf(cached.address)
    }
    if (cached != null) {
      routes.remove(hostname, cached)
    }

    val edge =
        runCatching { Dns.SYSTEM.lookup(VERCEL_EDGE_DISCOVERY_HOST) }
            .getOrDefault(emptyList())
    val direct =
        runCatching { Dns.SYSTEM.lookup(hostname) }.getOrDefault(emptyList())
    val addresses = (edge + direct).distinctBy { it.hostAddress }
    if (addresses.isEmpty()) throw java.net.UnknownHostException(hostname)

    // Some Vercel edges can serve static content while their serverless route
    // stalls on this network. Probe a public read-only tRPC function before
    // sending the real request, keeping the original hostname for TLS/SNI.
    val completion = ExecutorCompletionService<InetAddress?>(probes)
    val clients =
        addresses.map { address ->
          OkHttpClient.Builder()
              .dns(
                  object : Dns {
                    override fun lookup(hostname: String): List<InetAddress> =
                        listOf(address)
                  },
              )
              .connectTimeout(3, TimeUnit.SECONDS)
              .readTimeout(3, TimeUnit.SECONDS)
              .callTimeout(4, TimeUnit.SECONDS)
              .followRedirects(false)
              .retryOnConnectionFailure(false)
              .build()
        }
    val calls =
        clients.map { client ->
          client.newCall(
              Request.Builder()
                  .url("https://$hostname$TRPC_HEALTH_PATH")
                  .header("x-trpc-source", "android-route-probe")
                  .get()
                  .build(),
          )
        }
    val futures =
        calls.mapIndexed { index, call ->
          completion.submit(
              java.util.concurrent.Callable {
                runCatching {
                  call.execute().use { response ->
                    if (response.code == 200) addresses[index] else null
                  }
                }.getOrNull()
              },
          )
        }

    try {
      val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
      repeat(calls.size) {
        val remaining = deadline - System.nanoTime()
        if (remaining <= 0) return@repeat
        val completed = completion.poll(remaining, TimeUnit.NANOSECONDS)
        val address = completed?.get()
        if (address != null) {
          routes[hostname] =
              Route(
                  address,
                  System.nanoTime() + TimeUnit.SECONDS.toNanos(60),
              )
          return listOf(address)
        }
      }

      // If no route can prove API reachability, let OkHttp try the discovered
      // addresses under the real request's bounded network timeouts.
      return addresses
    } finally {
      calls.forEach { it.cancel() }
      futures.forEach { it.cancel(true) }
      clients.forEach {
        it.connectionPool.evictAll()
        it.dispatcher.executorService.shutdown()
      }
    }
  }
}
