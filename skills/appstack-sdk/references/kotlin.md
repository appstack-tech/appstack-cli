# Appstack Android SDK (Kotlin)

Read `SKILL.md` first for the cross-cutting rules (event taxonomy, EACs,
environments, limitations). This file covers Android-specific setup, real-world
usage, and partner integrations.

## Requirements

- Min SDK: Android 5.0 (API 21); Target SDK 35+
- Java 17+
- Gradle 8.13 / AGP 8.12 for building the SDK
- Artifact on [Maven Central](https://central.sonatype.com/artifact/tech.appstack.android-sdk/appstack-android-sdk)

## Install (Gradle)

```kotlin
dependencies {
    // Resolve the latest from Maven Central, then pin an explicit version for release builds.
    implementation("tech.appstack.android-sdk:appstack-android-sdk:+")
}
```

Prefer a specific version (not `+`) for reproducible release builds. No extra
Gradle config is required, but the `Application` class must be registered in
`AndroidManifest.xml`.

## Initialize (Application.onCreate, once)

The type is `AppstackAttributionSdk` (object, static-style calls).

```kotlin
import android.app.Application
import com.appstack.attribution.AppstackAttributionSdk
import com.appstack.attribution.EventType
import com.appstack.attribution.LogLevel

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppstackAttributionSdk.configure(
            context = this,
            apiKey = "your-android-api-key",
            logLevel = LogLevel.INFO
        )
    }
}
```

Register it in `AndroidManifest.xml`:

```xml
<application android:name=".MyApplication" ... >
```

### configure parameters

- `context` (Application context, required)
- `apiKey` (String, required)
- `logLevel` (`LogLevel`, default `INFO`)
- `listener` (optional `InitListener`) — observe asynchronous initialization
- `customerUserId` (optional) — your stable signed-in-user identifier

`isDebug` and `endpointBaseUrl` remain only as deprecated compatibility overloads
and are ignored. The API key selects the Appstack environment. Use
`LogLevel.DEBUG` for diagnostics; the old debug overlay is no longer part of the
public SDK.

### Customer user ID

```kotlin
AppstackAttributionSdk.setCustomerUserId("user-123") // login
AppstackAttributionSdk.setCustomerUserId(null)       // logout
```

The setter is safe before or after `configure`; make sure an event follows a
newly set ID so Appstack can form the install-to-user mapping.

## Sending events

`EventType` enum (uppercase). `parameters` is `Map<String, Any>`. `name` is
required only when `event = CUSTOM`.

`EventType` values: `LOGIN`, `SIGN_UP`, `REGISTER`, `PURCHASE`, `SUBSCRIBE`,
`ADD_TO_CART`, `ADD_TO_WISHLIST`, `INITIATE_CHECKOUT`, `START_TRIAL`,
`LEVEL_START`, `LEVEL_COMPLETE`, `TUTORIAL_COMPLETE`, `SEARCH`, `VIEW_ITEM`,
`VIEW_CONTENT`, `SHARE`, `CUSTOM`. (`INSTALL` is automatic — never send it.)

### Real-world examples

```kotlin
// Auth
AppstackAttributionSdk.sendEvent(EventType.SIGN_UP)
AppstackAttributionSdk.sendEvent(EventType.LOGIN)

// Purchase with revenue + (consented) matching params for EAC/Meta
AppstackAttributionSdk.sendEvent(
    EventType.PURCHASE,
    parameters = mapOf(
        "revenue" to 29.99,
        "currency" to "USD",
        "email" to user.email,
        "name" to "${user.firstName} ${user.lastName}",
        "phone_number" to user.phone,
        "date_of_birth" to user.dob   // "YYYY-MM-DD"
    )
)

// Subscription / trial
AppstackAttributionSdk.sendEvent(EventType.START_TRIAL, parameters = mapOf("revenue" to 0, "currency" to "USD"))
AppstackAttributionSdk.sendEvent(EventType.SUBSCRIBE, parameters = mapOf("revenue" to 9.99, "currency" to "USD"))

// E-commerce funnel
AppstackAttributionSdk.sendEvent(EventType.VIEW_ITEM, parameters = mapOf("item_id" to sku))
AppstackAttributionSdk.sendEvent(EventType.ADD_TO_CART, parameters = mapOf("item_id" to sku))
AppstackAttributionSdk.sendEvent(EventType.INITIATE_CHECKOUT)

// Games
AppstackAttributionSdk.sendEvent(EventType.LEVEL_COMPLETE, parameters = mapOf("level" to 3))

// Custom — only when nothing standard fits; descriptive snake_case name
AppstackAttributionSdk.sendEvent(
    EventType.CUSTOM,
    name = "wallet_connected",
    parameters = mapOf("chain" to "ethereum")
)
```

## Partner integrations

Read the Appstack ID / attribution params only **after `configure`**, and pass
them to the partner **before** the first paywall/offerings load.

### Superwall (Superwall-Android ≥ 2.7.5)

```kotlin
Superwall.instance.setIntegrationAttributes(
    mapOf(IntegrationAttribute.appstackId to AppstackAttributionSdk.getAppstackId())
)

fun prepareSuperwallPlacement() {
    Superwall.instance.setUserAttributes(AppstackAttributionSdk.getAttributionParams())
    Superwall.instance.register("onboarding_paywall")
}
// Call after Appstack init and before this placement can be shown.
```

### RevenueCat (purchases-android ≥ 9.23.0)

```kotlin
Purchases.configure(this, "public_sdk_key")

fun syncRevenueCatAttribution() {
    val params = AppstackAttributionSdk.getAttributionParams().toMutableMap()
    AppstackAttributionSdk.getAppstackId()?.let { params["appstack_id"] = it }

    Purchases.sharedInstance.setAppstackAttributionParams(
        params,
        object : SyncAttributesAndOfferingsCallback {
            override fun onSuccess(offerings: Offerings) { /* present paywall */ }
            override fun onError(error: PurchasesError) { /* handle error */ }
        }
    )
}
// Call after Appstack init and before loading offerings/paywalls.
```

## Development environment

Use the Development key with `logLevel = LogLevel.DEBUG`. The API key selects the
environment; `isDebug` is deprecated and ignored.

```kotlin
AppstackAttributionSdk.configure(
    context = this, apiKey = "your_development_api_key",
    logLevel = LogLevel.DEBUG
)
```

## Android-specific troubleshooting

- **Configuration fails:** confirm the correct key, Maven Central resolves, and
  the `Application` class is registered in
  `AndroidManifest.xml`.
- **Events missing:** `configure` must run in `onCreate` before the first
  `sendEvent`; device has network; test attribution with a **Play Store**
  install; revenue events include numeric `revenue`/`price` + valid `currency`.
- **Unexpected diagnostics:** use `LogLevel.DEBUG`; there is no public debug
  overlay in the current SDK.

## Verification checklist

- [ ] Dependency `tech.appstack.android-sdk:appstack-android-sdk`, latest version.
- [ ] Min SDK 21, target 35+, Java 17+, Gradle 8.13 / AGP 8.12 for SDK builds;
      Maven Central available.
- [ ] `Application` class registered in `AndroidManifest.xml`.
- [ ] Correct production or development key is selected; `isDebug` is not used
      as an environment switch.
- [ ] `configure` runs once from `Application.onCreate()` before any event.
- [ ] `INSTALL` never sent manually.
- [ ] Key flows use standard `EventType`s; custom events few and clean.
- [ ] Revenue events include `revenue`/`price` + `currency` (+ matching params).
- [ ] Partner IDs/attributes set after `configure`, before first paywall.
- [ ] Events visible on the Appstack SDK page before launch.
