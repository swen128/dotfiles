import Foundation

let usageURL = "https://api.anthropic.com/api/oauth/usage"
let keychainService = "Claude Code-credentials"
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

let oauthTokenURL = "https://platform.claude.com/v1/oauth/token"
let oauthClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
let refreshMargin: TimeInterval = 300
let loginHint = "Run `claude` and /login to sign in again"

struct Credential {
    let raw: String
    let account: String
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
}

func runSecurity(_ args: [String], stdin: String? = nil) -> (status: Int32, out: String) {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    task.arguments = args
    let out = Pipe()
    task.standardOutput = out
    task.standardError = Pipe()
    let input = Pipe()
    if stdin != nil { task.standardInput = input }
    do {
        try task.run()
    } catch {
        return (-1, "")
    }
    if let stdin = stdin {
        input.fileHandleForWriting.write(stdin.data(using: .utf8)!)
        try? input.fileHandleForWriting.close()
    }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    return (task.terminationStatus, String(data: data, encoding: .utf8) ?? "")
}

func keychainAccount() -> String? {
    let result = runSecurity(["find-generic-password", "-s", keychainService])
    guard result.status == 0 else { return nil }
    for line in result.out.split(separator: "\n") where line.contains("\"acct\"<blob>=") {
        guard let eq = line.range(of: "<blob>=") else { continue }
        let value = line[eq.upperBound...]
        if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
            return String(value.dropFirst().dropLast())
        }
    }
    return nil
}

func readCredential() -> Credential? {
    let result = runSecurity(["find-generic-password", "-s", keychainService, "-w"])
    let raw = result.out.hasSuffix("\n") ? String(result.out.dropLast()) : result.out
    guard result.status == 0,
          let obj = try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any],
          let oauth = obj["claudeAiOauth"] as? [String: Any],
          let token = oauth["accessToken"] as? String else {
        return nil
    }
    let expires = (oauth["expiresAt"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) }
    return Credential(raw: raw,
                      account: keychainAccount() ?? NSUserName(),
                      accessToken: token,
                      refreshToken: oauth["refreshToken"] as? String,
                      expiresAt: expires)
}

func writeCredential(_ raw: String, account: String) -> Bool {
    let hex = Data(raw.utf8).map { String(format: "%02x", $0) }.joined()
    let quote = { (s: String) in "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
    // Pass the secret on stdin so it never appears in the process list.
    let command = "add-generic-password -U -a \(quote(account)) -s \(quote(keychainService)) -X \(hex)\n"
    return runSecurity(["-i"], stdin: command).status == 0
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

enum RefreshOutcome {
    case refreshed(Credential)
    case rejected
    case failed
}

/// Exchange the refresh token for a new access token, the way Claude Code does,
/// and write it back to Claude Code's keychain item. Refresh tokens rotate, so the
/// write only happens if nobody else (e.g. a running Claude Code) has replaced the
/// credential since we read it; otherwise we adopt theirs.
func refreshCredential(_ cred: Credential) -> RefreshOutcome {
    guard let refreshToken = cred.refreshToken else { return .rejected }
    var request = URLRequest(url: URL(string: oauthTokenURL)!)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("claude-usage-bar/1.0", forHTTPHeaderField: "User-Agent")
    request.httpBody = try? JSONSerialization.data(withJSONObject: [
        "grant_type": "refresh_token",
        "refresh_token": refreshToken,
        "client_id": oauthClientID,
    ])
    let (response, data) = syncRequest(request)
    guard let http = response else { return .failed }
    guard http.statusCode == 200,
          let data = data,
          let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let access = result["access_token"] as? String else {
        if let latest = readCredential(), latest.raw != cred.raw { return .refreshed(latest) }
        return (400..<500).contains(http.statusCode) && http.statusCode != 429 ? .rejected : .failed
    }

    guard var obj = try? JSONSerialization.jsonObject(with: Data(cred.raw.utf8)) as? [String: Any],
          var oauth = obj["claudeAiOauth"] as? [String: Any] else { return .failed }
    let expiresIn = (result["expires_in"] as? Double) ?? 3600
    let expiresAt = Date().addingTimeInterval(expiresIn)
    oauth["accessToken"] = access
    oauth["expiresAt"] = Int64(expiresAt.timeIntervalSince1970 * 1000)
    if let rotated = result["refresh_token"] as? String { oauth["refreshToken"] = rotated }
    if let scope = result["scope"] as? String { oauth["scopes"] = scope.split(separator: " ").map(String.init) }
    obj["claudeAiOauth"] = oauth
    guard let newData = try? JSONSerialization.data(withJSONObject: obj),
          let newRaw = String(data: newData, encoding: .utf8) else { return .failed }

    if let latest = readCredential(), latest.raw != cred.raw { return .refreshed(latest) }
    _ = writeCredential(newRaw, account: cred.account)
    return .refreshed(Credential(raw: newRaw, account: cred.account, accessToken: access,
                                 refreshToken: oauth["refreshToken"] as? String, expiresAt: expiresAt))
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

/// The usage endpoint rate-limits per account and answers 429 with Retry-After.
/// Polling during that window gains nothing, so remember it and stay quiet.
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

/// Call only from one serial queue: it reads and writes `usageBlockedUntil`
/// and may rotate the shared refresh token.
func fetchUsage() -> UsageSnapshot {
    if let until = usageBlockedUntil, until > Date() {
        return emptyUsage("rate limited", retryAt: until)
    }
    guard var cred = readCredential() else { return emptyUsage("not signed in", hint: loginHint) }

    var refreshed = false
    if let expires = cred.expiresAt, expires < Date().addingTimeInterval(refreshMargin) {
        switch refreshCredential(cred) {
        case .refreshed(let next): cred = next; refreshed = true
        case .rejected: return emptyUsage("sign-in expired", hint: loginHint)
        case .failed: return emptyUsage("token refresh failed", hint: "Will retry on the next refresh")
        }
    }

    var (response, data) = requestUsage(cred.accessToken)
    if response?.statusCode == 401, !refreshed {
        switch refreshCredential(cred) {
        case .refreshed(let next): (response, data) = requestUsage(next.accessToken)
        case .rejected: return emptyUsage("sign-in expired", hint: loginHint)
        case .failed: return emptyUsage("token refresh failed", hint: "Will retry on the next refresh")
        }
    }

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
