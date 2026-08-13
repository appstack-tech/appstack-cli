# Appstack Unity SDK

Read `SKILL.md` first for the cross-cutting rules (event taxonomy, EACs,
environments, limitations). This file covers Unity 6 setup, native dependency
resolution, initialization, and the callback-based attribution API.

## Requirements

- Unity 6 (`6000.0`)+
- iOS 15.0+
- Android API 21+, target API 34+, Java 17+
- Android dependency resolution through EDM4U or the documented manual Gradle
  setup

## Install and native setup

Install `com.appstack.unity-sdk` from OpenUPM or add the repository as a local
Unity package. The package does not install EDM4U automatically.

- iOS: the package resolves the `AppstackSDK` Swift package during the Unity
  build; set the iOS minimum deployment target to 15.0+.
- Android: install EDM4U and resolve dependencies, or add
  `tech.appstack.android-sdk:appstack-android-sdk:1.7.0` to the generated
  `unityLibrary` Gradle project with Maven Central available.
- No manual R8/ProGuard rules are required.

## Initialize

For most projects, use **Edit → Project Settings → Appstack**, create the
settings asset, and configure separate iOS/Android development and production
keys. Automatic initialization selects a development key for Unity Development
Builds and a production key for other builds by default. Platform enablement,
environment pinning, production fallback, log level, and Apple Ads attribution
are controlled by that asset.

For consent or custom startup ordering, omit the settings asset or disable auto
initialization and call `Configure` exactly once:

```csharp
using System.Collections.Generic;
using Appstack;

AppstackSDK.Configure(
    apiKey: "your-platform-api-key",
    logLevel: 1,
    customerUserId: "optional-user-id");

AppstackSDK.SendEvent(
    EventType.PURCHASE,
    parameters: new Dictionary<string, object>
    {
        { "revenue", 29.99 },
        { "currency", "USD" }
    });
```

The first successful automatic or manual configuration wins. A repeated
configuration is a no-op; it cannot change the key, log level, or user ID.

## Customer user ID

Set the ID once it becomes known and clear it on logout. The setter is safe at
any point, but an event must follow a newly set ID for the install-to-user
mapping to be formed:

```csharp
AppstackSDK.SetCustomerUserId("user-123");
AppstackSDK.ClearCustomerUserId();
```

## Events and Apple Ads

Use `EventType` standard values wherever possible. `EventType.CUSTOM` requires a
descriptive `eventName`; `EventType.INSTALL` is automatic and manual sends are
ignored. Event parameters must be JSON-compatible.

```csharp
AppstackSDK.SendEvent(EventType.LOGIN);
AppstackSDK.SendEvent(
    EventType.CUSTOM,
    eventName: "wallet_connected",
    parameters: new Dictionary<string, object> { { "chain", "ethereum" } });
```

Call Apple Ads attribution only on an iOS device build, after configuration:

```csharp
#if UNITY_IOS && !UNITY_EDITOR
AppstackSDK.EnableAppleAdsAttribution();
#endif
```

## Attribution and status

`GetAppstackId()` returns the installation ID. `GetAttributionParams` is
callback-based; callbacks are delivered on the captured synchronization context
when available, so call it from Unity's main thread when updating Unity objects:

```csharp
AppstackSDK.GetAttributionParams(
    parameters => UnityEngine.Debug.Log($"Attribution keys: {parameters.Count}"),
    error => UnityEngine.Debug.LogError(error));

bool disabled = AppstackSDK.IsSdkDisabled();
```

In the Unity Editor and unsupported platforms, native calls are no-ops and
status methods return safe defaults. Verify attribution on a real iOS/Android
device or store build.

## Verification checklist

- [ ] Unity 6+, iOS 15+, Android API 21+/target 34+, Java 17+.
- [ ] iOS minimum deployment target is 15.0+.
- [ ] EDM4U resolved, or the Android 1.7.0 dependency is present in
      `unityLibrary`.
- [ ] Auto-initialization settings or one manual `Configure` call is used, not
      both.
- [ ] Platform-specific environment keys are configured without relying on
      deprecated `isDebug` behavior.
- [ ] Apple Ads is enabled only on iOS device builds.
- [ ] `INSTALL` is never sent manually; revenue events include revenue/price and
      currency; custom events remain few and descriptive.
