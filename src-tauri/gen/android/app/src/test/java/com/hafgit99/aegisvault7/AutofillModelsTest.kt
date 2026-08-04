package com.hafgit99.aegisvault7

import com.hafgit99.aegisvault7.model.AutofillLaunchRequest
import com.hafgit99.aegisvault7.model.AutofillSaveCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutofillModelsTest {

    @Test
    fun testAutofillLaunchRequestFreshness() {
        val now = System.currentTimeMillis()
        val freshRequest = AutofillLaunchRequest(
            requestId = "req-1",
            createdAt = now - 30_000L, // 30s ago
            appPackage = "com.example.app",
            webDomain = "example.com",
            usernameIds = arrayListOf(),
            passwordIds = arrayListOf()
        )

        assertTrue(freshRequest.isFresh(now))

        val staleRequest = AutofillLaunchRequest(
            requestId = "req-2",
            createdAt = now - (3 * 60 * 1000L), // 3 mins ago (> 2m limit)
            appPackage = "com.example.app",
            webDomain = "example.com",
            usernameIds = arrayListOf(),
            passwordIds = arrayListOf()
        )

        assertFalse(staleRequest.isFresh(now))
    }

    @Test
    fun testAutofillSaveCandidateRequiresUriResolution() {
        val candidateWithUri = AutofillSaveCandidate(
            requestId = "save-1",
            createdAt = System.currentTimeMillis(),
            title = "Test",
            username = "user",
            password = "",
            url = "https://example.com",
            appPackage = "com.example",
            webDomain = "example.com",
            payloadUri = "content://aegis/tmp/123",
            payloadToken = "token-123"
        )

        assertTrue(candidateWithUri.requiresUriResolution())

        val legacyCandidate = AutofillSaveCandidate(
            requestId = "save-2",
            createdAt = System.currentTimeMillis(),
            title = "Test 2",
            username = "user2",
            password = "secretpassword",
            url = "https://example.com",
            appPackage = "com.example",
            webDomain = "example.com"
        )

        assertFalse(legacyCandidate.requiresUriResolution())
    }
}
