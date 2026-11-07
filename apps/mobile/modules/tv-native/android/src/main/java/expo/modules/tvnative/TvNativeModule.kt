package expo.modules.tvnative

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * LAN transport primitives the JS layer cannot do itself:
 *  - WebSockets to TVs with self-signed certificates, using trust-on-first-use
 *    certificate pinning (never a blanket "trust all").
 *  - SSDP M-SEARCH with a Wi-Fi multicast lock held.
 *  - Wake-on-LAN magic packets.
 *
 * Protocol logic lives in TypeScript (packages/samsung-protocol); this module
 * only moves bytes.
 */
class TvNativeModule : Module() {
  private val sockets = ConcurrentHashMap<String, WebSocket>()

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("No React context")

  private val pins
    get() = context.getSharedPreferences("tv_native_cert_pins", Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("TvNative")

    Events("onSocketMessage", "onSocketClose")

    AsyncFunction("openSocket") { url: String, pinKey: String?, timeoutMs: Int, promise: Promise ->
      val id = UUID.randomUUID().toString()
      val settled = AtomicBoolean(false)
      val client = buildClient(pinKey, timeoutMs.toLong())
      val request = Request.Builder().url(url).build()

      client.newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          sockets[id] = webSocket
          if (settled.compareAndSet(false, true)) promise.resolve(id)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          sendEvent("onSocketMessage", Bundle().apply {
            putString("socketId", id)
            putString("data", text)
          })
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          sockets.remove(id)
          sendEvent("onSocketClose", Bundle().apply {
            putString("socketId", id)
            putInt("code", code)
            putString("reason", reason)
          })
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          sockets.remove(id)
          if (settled.compareAndSet(false, true)) {
            promise.reject("ERR_SOCKET_OPEN", t.message ?: "WebSocket failed", t)
          } else {
            sendEvent("onSocketClose", Bundle().apply {
              putString("socketId", id)
              putString("error", t.message ?: t.javaClass.simpleName)
            })
          }
        }
      })
    }

    Function("sendSocket") { socketId: String, data: String ->
      sockets[socketId]?.send(data) ?: false
    }

    Function("closeSocket") { socketId: String ->
      sockets.remove(socketId)?.close(1000, "client closed")
      Unit
    }

    /** Forget a pinned certificate (used when the user removes a device). */
    Function("forgetPin") { pinKey: String ->
      pins.edit().remove(pinKey).apply()
      Unit
    }

    AsyncFunction("ssdpSearch") { searchTarget: String, timeoutMs: Int, promise: Promise ->
      Thread {
        try {
          promise.resolve(ssdpSearch(searchTarget, timeoutMs))
        } catch (e: Exception) {
          promise.reject("ERR_SSDP", e.message ?: "SSDP failed", e)
        }
      }.start()
    }

    AsyncFunction("wakeOnLan") { mac: String, promise: Promise ->
      Thread {
        try {
          wakeOnLan(mac)
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("ERR_WOL", e.message ?: "Wake-on-LAN failed", e)
        }
      }.start()
    }
  }

  private fun buildClient(pinKey: String?, timeoutMs: Long): OkHttpClient {
    val builder = OkHttpClient.Builder()
      .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS) // long-lived socket
      .pingInterval(20, TimeUnit.SECONDS)

    if (pinKey != null) {
      val tm = TofuTrustManager(pinKey)
      val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), SecureRandom()) }
      builder.sslSocketFactory(ssl.socketFactory, tm)
      // TV certificates are issued for a name, not the LAN IP. The certificate
      // itself is pinned by TofuTrustManager, so hostname matching adds nothing here.
      builder.hostnameVerifier { _, _ -> true }
    }
    return builder.build()
  }

  /** Pin the leaf certificate on first use; reject any different certificate afterwards. */
  private inner class TofuTrustManager(private val pinKey: String) : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) =
      throw CertificateException("Client certificates not supported")

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
      val leaf = chain.firstOrNull() ?: throw CertificateException("Empty certificate chain")
      leaf.checkValidity()
      val fp = MessageDigest.getInstance("SHA-256").digest(leaf.encoded).joinToString("") { "%02x".format(it) }
      val known = pins.getString(pinKey, null)
      when {
        known == null -> pins.edit().putString(pinKey, fp).apply()
        known != fp -> throw CertificateException("TV certificate changed (pin mismatch for $pinKey)")
      }
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  private fun ssdpSearch(searchTarget: String, timeoutMs: Int): List<Bundle> {
    val wifi = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wifi.createMulticastLock("tv-controller-ssdp").apply { setReferenceCounted(false); acquire() }
    val results = LinkedHashMap<String, Bundle>()
    try {
      DatagramSocket(null).use { socket ->
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(0))
        val msg = "M-SEARCH * HTTP/1.1\r\n" +
          "HOST: 239.255.255.250:1900\r\n" +
          "MAN: \"ssdp:discover\"\r\n" +
          "MX: 2\r\n" +
          "ST: $searchTarget\r\n\r\n"
        val bytes = msg.toByteArray(Charsets.US_ASCII)
        val group = InetAddress.getByName("239.255.255.250")
        // Send twice: UDP is lossy.
        repeat(2) { socket.send(DatagramPacket(bytes, bytes.size, group, 1900)) }

        val deadline = System.currentTimeMillis() + timeoutMs
        val buf = ByteArray(4096)
        while (true) {
          val remaining = deadline - System.currentTimeMillis()
          if (remaining <= 0) break
          socket.soTimeout = remaining.toInt().coerceAtLeast(1)
          val packet = DatagramPacket(buf, buf.size)
          try {
            socket.receive(packet)
          } catch (_: SocketTimeoutException) {
            break
          }
          val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
          val headers = Bundle()
          text.split("\r\n").drop(1).forEach { line ->
            val i = line.indexOf(':')
            if (i > 0) headers.putString(line.substring(0, i).trim().lowercase(), line.substring(i + 1).trim())
          }
          val address = packet.address.hostAddress ?: continue
          val key = address + "|" + (headers.getString("usn") ?: "")
          results[key] = Bundle().apply {
            putString("address", address)
            putBundle("headers", headers)
          }
        }
      }
    } finally {
      lock.release()
    }
    return results.values.toList()
  }

  private fun wakeOnLan(mac: String) {
    val hex = mac.replace(Regex("[^0-9A-Fa-f]"), "")
    require(hex.length == 12) { "Invalid MAC address: $mac" }
    val macBytes = ByteArray(6) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
    val packet = ByteArray(6 + 16 * 6)
    for (i in 0 until 6) packet[i] = 0xFF.toByte()
    for (i in 1..16) System.arraycopy(macBytes, 0, packet, i * 6, 6)
    DatagramSocket().use { socket ->
      socket.broadcast = true
      val target = InetAddress.getByName("255.255.255.255")
      // Port 9 is the common choice; some TVs listen on 7.
      for (port in intArrayOf(9, 7)) socket.send(DatagramPacket(packet, packet.size, target, port))
    }
  }
}
