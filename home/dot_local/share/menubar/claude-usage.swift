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
}

func readToken() -> String? {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    task.arguments = ["find-generic-password", "-s", keychainService, "-w"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = Pipe()
    do {
        try task.run()
    } catch {
        return nil
    }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    guard task.terminationStatus == 0,
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let oauth = obj["claudeAiOauth"] as? [String: Any],
          let token = oauth["accessToken"] as? String else {
        return nil
    }
    return token
}

func limit(from dict: [String: Any]?) -> Limit {
    guard let d = dict else { return Limit(pct: nil, resetsAt: nil) }
    return Limit(pct: d["utilization"] as? Double, resetsAt: d["resets_at"] as? String)
}

func emptyUsage(_ error: String) -> UsageSnapshot {
    UsageSnapshot(five: Limit(pct: nil, resetsAt: nil),
                  seven: Limit(pct: nil, resetsAt: nil),
                  sonnet: Limit(pct: nil, resetsAt: nil),
                  opus: Limit(pct: nil, resetsAt: nil),
                  extra: nil, error: error)
}

func fetchUsage() -> UsageSnapshot {
    guard let token = readToken() else { return emptyUsage("no login") }

    var request = URLRequest(url: URL(string: usageURL)!)
    request.timeoutInterval = 15
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("oauth-2025-04-20", forHTTPHeaderField: "anthropic-beta")
    request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
    request.setValue("claude-usage-bar/1.0", forHTTPHeaderField: "User-Agent")

    let semaphore = DispatchSemaphore(value: 0)
    var snapshot = emptyUsage("offline")
    let task = URLSession.shared.dataTask(with: request) { data, response, _ in
        defer { semaphore.signal() }
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            snapshot = emptyUsage(http.statusCode == 401 ? "token expired" : "HTTP \(http.statusCode)")
            return
        }
        guard let data = data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
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
        snapshot = UsageSnapshot(five: limit(from: obj["five_hour"] as? [String: Any]),
                                 seven: limit(from: obj["seven_day"] as? [String: Any]),
                                 sonnet: limit(from: obj["seven_day_sonnet"] as? [String: Any]),
                                 opus: limit(from: obj["seven_day_opus"] as? [String: Any]),
                                 extra: extraText, error: nil)
    }
    task.resume()
    _ = semaphore.wait(timeout: .now() + 20)
    if snapshot.error == nil {
        reportRateLimits(snapshot)
    }
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
    guard let payload = rateLimitPayload(snapshot, now: Date()),
          let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
          let json = String(data: data, encoding: .utf8) else {
        return
    }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: gcloudPath)
    task.arguments = [
        "logging", "write", rateLimitLogName, json,
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
