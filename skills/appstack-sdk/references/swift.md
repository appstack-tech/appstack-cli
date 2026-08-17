# Appstack Swift SDK (iOS)

Read `SKILL.md` first for the cross-cutting rules (event taxonomy, EACs,
environments, limitations). This file covers iOS-specific setup, real-world
usage, and partner integrations.

## Requirements

- iOS 15.0+
- Xcode 16.0+
- Swift 6-compatible toolchain (the distributed framework is built with Swift 6)

## Install (Swift Package Manager)

Package URL: `https://github.com/appstack-tech/ios-appstack-sdk.git`

- **Xcode:** File → Add Package Dependencies… → paste URL → pick the **latest**
  stable version.
- **Package.swift:**
  ```swift
  dependencies: [
      // Use the latest stable semver from the repo's releases — do not leave a stale pin.
      .package(url: "https://github.com/appstack-tech/ios-appstack-sdk.git", from: "X.Y.Z")
  ]
  ```

## Initialize (app startup, once)

The type is `AppstackAttributionSdk.shared`. Configure in `AppDelegate`
`didFinishLaunchingWithOptions` **or** SwiftUI `@main` `init()` — pick whichever
your app uses, never both.

```swift
import UIKit
import AppstackSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        AppstackAttributionSdk.shared.configure(
            apiKey: "your_api_key",
            logLevel: .info
        )

        // Call after configure when Apple Ads attribution is needed (iOS 15+).
        AppstackASAAttribution.shared.enableAppleAdsAttribution()
        return true
    }
}
```

SwiftUI:

```swift
@main
struct MyApp: App {
    init() {
        AppstackAttributionSdk.shared.configure(
            apiKey: "your_api_key", logLevel: .info
        )
    }
    var body: some Scene { WindowGroup { ContentView() } }
}
```

### configure parameters

- `apiKey` (String, required)
- `logLevel` (`LogLevel`, default `.info`) — use `.debug` in development
- `customerUserId` (optional) — your stable signed-in-user identifier

`isDebug` and `endpointBaseUrl` still exist on deprecated compatibility overloads
but are ignored. The API key selects the Appstack environment.

### Customer user ID

Pass the identifier at startup when known, or set it after login and clear it on
logout. The setter is safe before or after `configure`; make sure an event
follows a newly set ID so Appstack can form the install-to-user mapping.

```swift
AppstackAttributionSdk.shared.setCustomerUserId("user-123") // login
AppstackAttributionSdk.shared.setCustomerUserId(nil)         // logout
```

## Sending events

Events use the `EventType` enum (uppercase cases). `parameters` is
`[String: Any]`; revenue values auto-convert (Double/Int/Float/String).

`EventType` cases: `LOGIN`, `SIGN_UP`, `REGISTER`, `PURCHASE`, `ADD_TO_CART`,
`ADD_TO_WISHLIST`, `INITIATE_CHECKOUT`, `START_TRIAL`, `SUBSCRIBE`,
`LEVEL_START`, `LEVEL_COMPLETE`, `TUTORIAL_COMPLETE`, `SEARCH`, `VIEW_ITEM`,
`VIEW_CONTENT`, `SHARE`, `CUSTOM`. (`INSTALL` is automatic — never send it.)

### Real-world examples

```swift
// Auth — no parameters needed
AppstackAttributionSdk.shared.sendEvent(event: .SIGN_UP)
AppstackAttributionSdk.shared.sendEvent(event: .LOGIN)

// Direct path: purchase with revenue + (consented) matching params for EAC/Meta
AppstackAttributionSdk.shared.sendEvent(
    event: .PURCHASE,
    parameters: [
        "revenue": 29.99,
        "currency": "USD",
        "email": user.email,
        "name": "\(user.firstName) \(user.lastName)",
        "phone_number": user.phone,
        "date_of_birth": user.dob   // "YYYY-MM-DD"
    ]
)

// Subscription / trial
AppstackAttributionSdk.shared.sendEvent(
    event: .START_TRIAL,
    parameters: ["revenue": 0, "currency": "USD"]
)
AppstackAttributionSdk.shared.sendEvent(
    event: .SUBSCRIBE,
    parameters: ["revenue": 9.99, "currency": "USD"]
)

// E-commerce funnel — standard events, not custom
AppstackAttributionSdk.shared.sendEvent(event: .VIEW_ITEM, parameters: ["item_id": sku])
AppstackAttributionSdk.shared.sendEvent(event: .ADD_TO_CART, parameters: ["item_id": sku])
AppstackAttributionSdk.shared.sendEvent(event: .INITIATE_CHECKOUT)

// Games
AppstackAttributionSdk.shared.sendEvent(event: .LEVEL_COMPLETE, parameters: ["level": 3])

// Custom — only when nothing standard fits; descriptive snake_case name
AppstackAttributionSdk.shared.sendEvent(
    event: .CUSTOM,
    name: "wallet_connected",
    parameters: ["chain": "ethereum"]
)
```

## Partner integrations

Read the Appstack ID / attribution params only **after `configure`**, and pass
them to the partner **before** the first paywall/offerings load.

### Superwall (Superwall-iOS ≥ 4.12.11)

```swift
// After both Appstack and Superwall are configured
Superwall.shared.setIntegrationAttributes([
    IntegrationAttribute.appstackId: AppstackAttributionSdk.shared.getAppstackId()
])

// Attribution params as user attributes, before the first register
Task {
    Superwall.shared.setUserAttributes(
        await AppstackAttributionSdk.shared.getAttributionParams() ?? [:]
    )
    Superwall.shared.register(placement: "onboarding_paywall")
}
```

### RevenueCat (purchases-ios ≥ 5.61.0)

```swift
Purchases.configure(withAPIKey: "public_sdk_key")

Task {
    let base = await AppstackAttributionSdk.shared.getAttributionParams() ?? [:]
    var params = base
    if let id = AppstackAttributionSdk.shared.getAppstackId() {
        params["appstack_id"] = id
    }
    Purchases.shared.attribution.setAppstackAttributionParams(params) { offerings, error in
        // Use `offerings` to present the correct paywall for this user
    }
}
```

## Development environment

Use the **Development** key with `logLevel: .debug` during development. The API
key selects the environment; `isDebug` is deprecated and ignored.

```swift
AppstackAttributionSdk.shared.configure(
    apiKey: "your_development_api_key", logLevel: .debug
)
```

## iOS-specific troubleshooting

- **Install event missing:** if a StoreKit test configuration is enabled with a
  **production** key, the install won't record. Use the development key for
  StoreKit test runs, or disable the StoreKit test config for prod-key validation.
- **Apple Ads attribution missing:** confirm App Store/TestFlight install, iOS
  15+, `enableAppleAdsAttribution()` called after configuration; allow
  24–48h. Some behavior is unavailable on the simulator.
- **Events missing:** confirm `configure` runs before the first `sendEvent`,
  device has network, revenue events include numeric `revenue`/`price` + valid
  `currency`.
- **Superwall attributes empty:** ensure `setIntegrationAttributes` /
  `setUserAttributes` run after Appstack `configure` and before `register`.

## Verification checklist

- [ ] Package added from the correct URL, latest stable version.
- [ ] Target meets iOS 15.0+ / Xcode 16.0+ / Swift 6-compatible toolchain.
- [ ] Correct production or development key is selected; `isDebug` is not used
      as an environment switch.
- [ ] `configure` runs once at startup before any event.
- [ ] `INSTALL` never sent manually.
- [ ] Key flows use standard `EventType`s; custom events few and clean.
- [ ] Revenue events include `revenue`/`price` + `currency`; consented matching
      params are included there or were persisted by an earlier custom event.
- [ ] Apple Ads attribution enabled only on iOS 15+ after configuration.
- [ ] Partner IDs/attributes set after `configure`, before first paywall.
- [ ] Events visible on the Appstack SDK page before launch.
