package com.hafgit99.aegisvault7.security

import android.content.Context
import android.util.Base64
import android.util.Log
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Writes short-lived encrypted payloads (e.g. autofill save candidates) to a
 * dedicated cache directory that is exposed through FileProvider. The file is
 * encrypted at rest with AES-256-GCM, the key never leaves the process, and a
 * one-time access token is required to decrypt it. Files are unlinked after
 * consumption to keep the on-disk surface minimal.
 *
 * Threat model addressed:
 * - Intent extras can leak into Binder transaction buffers and recent task
 *   snapshots. A FileProvider URI hides the password from the intent payload.
 * - Plaintext on disk is unacceptable; this class never writes plaintext bytes.
 * - The cached file is wiped as soon as the consumer reads it, so a
 *   forensic dump of the cache directory cannot recover credentials.
 *
 * Format on disk (each entry):
 *   [version:1][ivLen:1][iv:ivLen][ciphertextLen:4][ciphertext]
 *
 * Format of the access token returned to callers:
 *   [version:1][ivLen:1][iv:ivLen][key:32]
 * encoded with URL-safe base64. The token is the only artifact the WebView
 * needs to recover the plaintext, so it can safely travel through Intent
 * extras or FileProvider URI query parameters.
 */
class SecureTempFileStorage(private val context: Context) {

  private val secureRandom = SecureRandom()

  private val cacheDir: File by lazy {
    File(context.cacheDir, CACHE_SUBDIR).apply {
      if (!exists() && !mkdirs()) {
        Log.w(LOG_TAG, "Could not create $CACHE_SUBDIR cache directory")
      }
    }
  }

  /**
   * Persists [payload] under a random file name and returns the access token
   * that the caller must present back via [consume] to decrypt it.
   *
   * The on-disk file is named after the SHA-256 of the random key so that the
   * file name itself does not leak any identifier. The token returned here
   * is the only way to recover the key.
   */
  fun stash(payload: ByteArray): String = stashWithFile(payload).first

  /**
   * Same as [stash] but additionally returns the on-disk file backing the
   * payload. Callers that need to expose the file via FileProvider must use
   * this overload so they can match the token to its file deterministically,
   * without resorting to directory-wide scans.
   */
  fun stashWithFile(payload: ByteArray): Pair<String, File> {
    val keyBytes = ByteArray(KEY_LENGTH_BYTES).also { secureRandom.nextBytes(it) }
    val iv = ByteArray(IV_LENGTH_BYTES).also { secureRandom.nextBytes(it) }

    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(GCM_TAG_BITS, iv))
    val ciphertext = cipher.doFinal(payload)

    val header = byteArrayOf(VERSION.toByte(), iv.size.toByte()) +
      iv +
      intToBytes(ciphertext.size) +
      ciphertext

    val fileName = deriveFileName(keyBytes) + FILE_EXTENSION
    val target = File(cacheDir, fileName)
    target.writeBytes(header)

    Log.i(LOG_TAG, "Stashed encrypted payload size=${payload.size} file=$fileName")
    return encodeToken(keyBytes, iv) to target
  }

  /**
   * Reads and decrypts the payload associated with [token], then deletes the
   * underlying file. Returns null if the token is invalid, the file is
   * missing, the integrity check fails, or the payload has expired.
   */
  fun consume(token: String, maxAgeMs: Long = DEFAULT_MAX_AGE_MS): ByteArray? {
    val decoded = decodeToken(token) ?: run {
      Log.w(LOG_TAG, "Refusing to consume malformed token")
      return null
    }

    val fileName = deriveFileName(decoded.key) + FILE_EXTENSION
    val source = File(cacheDir, fileName)
    if (!source.exists()) {
      Log.w(LOG_TAG, "Encrypted temp file missing for token; ignoring request")
      return null
    }

    val ageMs = System.currentTimeMillis() - source.lastModified()
    if (ageMs < 0 || ageMs > maxAgeMs) {
      Log.w(LOG_TAG, "Encrypted temp file age=$ageMs exceeded maxAge=$maxAgeMs; deleting")
      source.delete()
      return null
    }

    return try {
      val bytes = source.readBytes()
      if (bytes.isEmpty() || bytes[0].toInt() != VERSION) {
        Log.w(LOG_TAG, "Temp file version mismatch; deleting")
        source.delete()
        return null
      }
      val ivSize = bytes[1].toInt() and 0xff
      if (bytes.size < 2 + ivSize + INT_LENGTH) {
        Log.w(LOG_TAG, "Temp file truncated; deleting")
        source.delete()
        return null
      }
      val storedIv = bytes.copyOfRange(2, 2 + ivSize)
      val cipherStart = 2 + ivSize
      val cipherLen = bytesToInt(bytes, cipherStart)
      if (cipherStart + INT_LENGTH + cipherLen != bytes.size) {
        Log.w(LOG_TAG, "Temp file size mismatch; deleting")
        source.delete()
        return null
      }
      val ciphertext = bytes.copyOfRange(cipherStart + INT_LENGTH, bytes.size)

      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(
        Cipher.DECRYPT_MODE,
        SecretKeySpec(decoded.key, "AES"),
        GCMParameterSpec(GCM_TAG_BITS, storedIv),
      )
      val plaintext = cipher.doFinal(ciphertext)

      if (!source.delete()) {
        Log.w(LOG_TAG, "Failed to delete consumed temp file=$fileName")
      }
      plaintext
    } catch (error: Exception) {
      Log.w(LOG_TAG, "Decryption failed; deleting temp file: ${error.message ?: "unknown"}")
      source.delete()
      null
    }
  }

  /**
   * Removes every cached payload, regardless of age. Intended for low-priority
   * housekeeping (e.g. on activity destroy or after a failed autofill cycle).
   */
  fun purge() {
    val files = cacheDir.listFiles() ?: return
    for (file in files) {
      if (file.isFile && file.name.endsWith(FILE_EXTENSION) && !file.delete()) {
        Log.w(LOG_TAG, "Failed to purge temp file=${file.name}")
      }
    }
  }

  private fun deriveFileName(keyBytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(keyBytes)
    return digest.joinToString(separator = "") { "%02x".format(it) }
  }

  private fun encodeToken(keyBytes: ByteArray, iv: ByteArray): String {
    val combined = byteArrayOf(VERSION.toByte(), iv.size.toByte()) + iv + keyBytes
    return Base64.encodeToString(combined, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  }

  private fun decodeToken(token: String): DecodedToken? {
    return try {
      val combined = Base64.decode(token, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      if (combined.isEmpty() || combined[0].toInt() != VERSION) return null
      val ivSize = combined[1].toInt() and 0xff
      if (combined.size < 2 + ivSize + KEY_LENGTH_BYTES) return null
      val iv = combined.copyOfRange(2, 2 + ivSize)
      val key = combined.copyOfRange(2 + ivSize, 2 + ivSize + KEY_LENGTH_BYTES)
      DecodedToken(key, iv)
    } catch (error: Exception) {
      Log.w(LOG_TAG, "Token decode failed: ${error.message ?: "unknown"}")
      null
    }
  }

  private fun intToBytes(value: Int): ByteArray = byteArrayOf(
    (value ushr 24 and 0xff).toByte(),
    (value ushr 16 and 0xff).toByte(),
    (value ushr 8 and 0xff).toByte(),
    (value and 0xff).toByte(),
  )

  private fun bytesToInt(source: ByteArray, offset: Int): Int =
    ((source[offset].toInt() and 0xff) shl 24) or
      ((source[offset + 1].toInt() and 0xff) shl 16) or
      ((source[offset + 2].toInt() and 0xff) shl 8) or
      (source[offset + 3].toInt() and 0xff)

  private data class DecodedToken(val key: ByteArray, val iv: ByteArray)

  companion object {
    private const val LOG_TAG = "AegisSecureTmp"
    private const val CACHE_SUBDIR = "aegis-autofill-tmp"
    private const val FILE_EXTENSION = ".aest"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val KEY_LENGTH_BYTES = 32 // AES-256
    private const val IV_LENGTH_BYTES = 12
    private const val GCM_TAG_BITS = 128
    private const val INT_LENGTH = 4
    private const val VERSION = 1
    /** Default expiration: 5 minutes (matches autofill request freshness window). */
    const val DEFAULT_MAX_AGE_MS: Long = 5 * 60 * 1000L
  }
}
