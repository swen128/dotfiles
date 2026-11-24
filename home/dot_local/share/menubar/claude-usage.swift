import Foundation

let usageURL = "https://api.anthropic.com/api/oauth/usage"
let unleashAuthPath = NSString(string: "~/.config/unleash/auth.json").expandingTildeInPath
let gcloudPath = "/opt/homebrew/bin/gcloud"
let rateLimitLogName = "claude-rate-limits"
let rateLimitProject = "dinii-internal-tool"

struct Limit {
    let pct: Double?
    let resetsAt: String?
}

struct UsageSnapshot {
    let five: Limit
    let seven: Limit
    let sonnet: Limit
    let opus: Limit
    let extra: String?
    let error: String?
    var hint: String? = nil
    var retryAt: Date? = nil
}

let loginHint = "Run `unleash login anthropic` to sign in again"
let expiredHint = "Unleash renews it on its next request"

struct Credential {
    let accessToken: String
    let expiresAt: Date?
}

func readCredential() -> Credential? {
    guard let data = FileManager.default.contents(atPath: unleashAuthPath),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let credentials = obj["credentials"] as? [String: Any],
          let anthropic = credentials["anthropic"] as? [String: Any],
          anthropic["kind"] as? String == "oauth",
          let token = anthropic["access"] as? String else {
        return nil
    }
    let expires = (anthropic["expiresAt"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) }
    return Credential(accessToken: token, expiresAt: expires)
}

func syncRequest(_ request: URLRequest) -> (HTTPURLResponse?, Data?) {
    let semaphore = DispatchSemaphore(value: 0)
    var result: (HTTPURLResponse?, Data?) = (nil, nil)
    URLSession.shared.dataTask(with: request) { data, response, _ in
        result = (response as? HTTPURLResponse, data)
        semaphore.signal()
    }.resume()
    _ = semaphore.wait(timeout: .now() + 20)
    return result
}

func limit(from dict: [String: Any]?) -> Limit {
    guard let d = dict else { return Limit(pct: nil, resetsAt: nil) }
    return Limit(pct: d["utilization"] as? Double, resetsAt: d["resets_at"] as? String)
}

func emptyUsage(_ error: String, hint: String? = nil, retryAt: Date? = nil) -> UsageSnapshot {
    UsageSnapshot(five: Limit(pct: nil, resetsAt: nil),
                  seven: Limit(pct: nil, resetsAt: nil),
                  sonnet: Limit(pct: nil, resetsAt: nil),
                  opus: Limit(pct: nil, resetsAt: nil),
                  extra: nil, error: error, hint: hint, retryAt: retryAt)
}

var usageBlockedUntil: Date?

func retryAfter(_ http: HTTPURLResponse) -> Date {
    let header = http.value(forHTTPHeaderField: "Retry-After") ?? ""
    let seconds = Double(header.trimmingCharacters(in: .whitespaces)) ?? 600
    return Date().addingTimeInterval(max(seconds, 60))
}

func requestUsage(_ token: String) -> (HTTPURLResponse?, Data?) {
    var request = URLRequest(url: URL(string: usageURL)!)
    request.timeoutInterval = 15
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("oauth-2025-04-20", forHTTPHeaderField: "anthropic-beta")
    request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
    request.setValue("claude-usage-bar/1.0", forHTTPHeaderField: "User-Agent")
    return syncRequest(request)
}

func fetchUsage() -> UsageSnapshot {
    if let until = usageBlockedUntil, until > Date() {
        return emptyUsage("rate limited", retryAt: until)
    }
    guard let cred = readCredential() else { return emptyUsage("not signed in to unleash", hint: loginHint) }
    if let expires = cred.expiresAt, expires < Date() {
        return emptyUsage("sign-in needs renewing", hint: expiredHint)
    }

    let (response, data) = requestUsage(cred.accessToken)
    if response?.statusCode == 401 { return emptyUsage("sign-in refused", hint: loginHint) }

    guard let http = response else { return emptyUsage("offline") }
    switch http.statusCode {
    case 200: usageBlockedUntil = nil
    case 429:
        let until = retryAfter(http)
        usageBlockedUntil = until
        return emptyUsage("rate limited", retryAt: until)
    case 401: return emptyUsage("sign-in expired", hint: loginHint)
    default: return emptyUsage("HTTP \(http.statusCode)")
    }
    guard let data = data,
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return emptyUsage("bad response")
    }
    var extraText: String? = nil
    if let extra = obj["extra_usage"] as? [String: Any] {
        if (extra["is_enabled"] as? Bool) == true {
            let used = extra["used_credits"] as? Double ?? 0
            let cap = extra["monthly_limit"] as? Double ?? 0
            let cur = extra["currency"] as? String ?? "USD"
            extraText = String(format: "Extra usage  %.2f / %.0f %@", used, cap, cur)
        } else {
            extraText = "Extra usage  off"
        }
    }
    let snapshot = UsageSnapshot(five: limit(from: obj["five_hour"] as? [String: Any]),
                                 seven: limit(from: obj["seven_day"] as? [String: Any]),
                                 sonnet: limit(from: obj["seven_day_sonnet"] as? [String: Any]),
                                 opus: limit(from: obj["seven_day_opus"] as? [String: Any]),
                                 extra: extraText, error: nil)
    reportRateLimits(snapshot)
    return snapshot
}

func parseResetTime(_ raw: String?) -> Date? {
    guard let raw = raw else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) else {
        return nil
    }
    return Date(timeIntervalSince1970: (date.timeIntervalSince1970 / 60).rounded() * 60)
}

func isoString(_ date: Date?, fractional: Bool = false) -> Any {
    guard let date = date else { return NSNull() }
    let formatter = ISO8601DateFormatter()
    if fractional {
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    }
    return formatter.string(from: date)
}

func rateLimitPayload(_ snapshot: UsageSnapshot, now: Date) -> [String: Any]? {
    guard snapshot.five.pct != nil || snapshot.seven.pct != nil else { return nil }
    return [
        "event_name": "rate_limits",
        "source": "menubar",
        "timestamp": isoString(now, fractional: true),
        "user": NSUserName(),
        "session_id": NSNull(),
        "model_id": NSNull(),
        "five_hour_used_percentage": snapshot.five.pct ?? NSNull(),
        "five_hour_resets_at": isoString(parseResetTime(snapshot.five.resetsAt)),
        "seven_day_used_percentage": snapshot.seven.pct ?? NSNull(),
        "seven_day_resets_at": isoString(parseResetTime(snapshot.seven.resetsAt)),
        "version": NSNull(),
    ]
}

func reportRateLimits(_ snapshot: UsageSnapshot) {
    guard let payload = rateLimitPayload(snapshot, now: Date()) else { return }
    writeRateLimitLog(rateLimitLogName, payload)
}

func writeRateLimitLog(_ logName: String, _ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
          let json = String(data: data, encoding: .utf8) else {
        return
    }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: gcloudPath)
    task.arguments = [
        "logging", "write", logName, json,
        "--payload-type=json",
        "--severity=INFO",
        "--project=\(rateLimitProject)",
        "--quiet",
    ]
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    task.environment = env
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    try? task.run()
}
