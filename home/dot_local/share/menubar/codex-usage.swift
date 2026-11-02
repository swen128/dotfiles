import Foundation

let codexRateLimitLogName = "dinii-kpi-events"

struct CodexWindow {
    let label: String
    let minutes: Int?
    let limit: Limit
}

struct CodexSnapshot {
    let five: Limit?
    let seven: Limit?
    let others: [CodexWindow]
    let plan: String?
    let error: String?
}

func emptyCodexUsage(_ error: String) -> CodexSnapshot {
    CodexSnapshot(five: nil, seven: nil, others: [], plan: nil, error: error)
}

func codexExecutable() -> String? {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let candidates = [
        "\(home)/.local/bin/codex",
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
        "/Applications/Codex.app/Contents/Resources/codex",
        "\(home)/.local/share/mise/shims/codex",
    ]
    return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
}

func readCodexLimits(_ executable: String, timeout: TimeInterval = 20) -> Result<[String: Any], CodexError> {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: executable)
    task.arguments = ["app-server"]
    task.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    task.environment = env
    let stdin = Pipe()
    let stdout = Pipe()
    task.standardInput = stdin
    task.standardOutput = stdout
    task.standardError = FileHandle.nullDevice

    let lock = NSLock()
    let done = DispatchSemaphore(value: 0)
    var buffer = Data()
    var outcome: Result<[String: Any], CodexError>?

    func finish(_ result: Result<[String: Any], CodexError>) {
        lock.lock()
        defer { lock.unlock() }
        guard outcome == nil else { return }
        outcome = result
        done.signal()
    }

    func send(_ message: [String: Any]) {
        guard var data = try? JSONSerialization.data(withJSONObject: message) else { return }
        data.append(0x0A)
        try? stdin.fileHandleForWriting.write(contentsOf: data)
    }

    stdout.fileHandleForReading.readabilityHandler = { handle in
        let chunk = handle.availableData
        if chunk.isEmpty {
            finish(.failure(.message("codex exited early")))
            return
        }
        buffer.append(chunk)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = buffer.subdata(in: buffer.startIndex..<newline)
            buffer.removeSubrange(buffer.startIndex...newline)
            guard let message = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
                  let id = message["id"] as? Int else { continue }
            if message["error"] != nil {
                finish(.failure(.message("codex login required")))
                return
            }
            if id == 1 {
                send(["method": "initialized"])
                send(["id": 2, "method": "account/rateLimits/read"])
            } else if id == 2 {
                finish(.success(message["result"] as? [String: Any] ?? [:]))
                return
            }
        }
    }

    do {
        try task.run()
    } catch {
        return .failure(.message("cannot start codex"))
    }
    send(["id": 1, "method": "initialize",
          "params": ["clientInfo": ["name": "menubar", "version": "1.0.0"]]])

    if done.wait(timeout: .now() + timeout) == .timedOut {
        finish(.failure(.message("codex timed out")))
    }
    stdout.fileHandleForReading.readabilityHandler = nil
    try? stdin.fileHandleForWriting.close()
    if task.isRunning { task.terminate() }
    DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
        if task.isRunning { kill(task.processIdentifier, SIGKILL) }
    }
    lock.lock()
    defer { lock.unlock() }
    return outcome ?? .failure(.message("codex timed out"))
}

enum CodexError: Error {
    case message(String)
}

func codexWindowLabel(_ minutes: Int?, fallback: String) -> String {
    switch minutes {
    case 300: return "5-hour"
    case 10080: return "7-day"
    case let m?: return m % 1440 == 0 ? "\(m / 1440)-day" : "\(m / 60)-hour"
    default: return fallback
    }
}

func parseCodexUsage(_ result: [String: Any]) -> CodexSnapshot {
    var buckets = result["rateLimitsByLimitId"] as? [String: Any] ?? [:]
    if buckets.isEmpty, let single = result["rateLimits"] { buckets["codex"] = single }
    guard !buckets.isEmpty else { return emptyCodexUsage("no ChatGPT login") }

    let accountWide = buckets.filter { $0.key == "codex" }
    let selected = accountWide.isEmpty ? buckets : accountWide
    var five: Limit?
    var seven: Limit?
    var others: [CodexWindow] = []
    var plan: String?

    for id in selected.keys.sorted() {
        guard let bucket = selected[id] as? [String: Any] else { continue }
        plan = plan ?? bucket["planType"] as? String
        let prefix = id == "codex" ? "" : "\(bucket["limitName"] as? String ?? id) "
        for slot in ["primary", "secondary"] {
            guard let item = bucket[slot] as? [String: Any] else { continue }
            let minutes = (item["windowDurationMins"] as? NSNumber)?.intValue
            let pct = (item["usedPercent"] as? NSNumber)?.doubleValue
            let resets = (item["resetsAt"] as? NSNumber).map {
                isoString(Date(timeIntervalSince1970: $0.doubleValue)) as? String
            } ?? nil
            let limit = Limit(pct: pct, resetsAt: resets)
            if id == "codex" && minutes == 300 && five == nil {
                five = limit
            } else if id == "codex" && minutes == 10080 && seven == nil {
                seven = limit
            } else {
                others.append(CodexWindow(label: prefix + codexWindowLabel(minutes, fallback: slot),
                                          minutes: minutes, limit: limit))
            }
        }
    }
    return CodexSnapshot(five: five, seven: seven, others: others, plan: plan, error: nil)
}

func fetchCodexUsage() -> CodexSnapshot {
    guard let executable = codexExecutable() else { return emptyCodexUsage("codex not installed") }
    switch readCodexLimits(executable) {
    case .failure(.message(let text)):
        return emptyCodexUsage(text)
    case .success(let result):
        let snapshot = parseCodexUsage(result)
        if snapshot.error == nil {
            reportCodexRateLimits(snapshot)
        }
        return snapshot
    }
}

func codexUserEmail() -> String? {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    if let cached = try? String(contentsOfFile: "\(home)/.claude/cache/dinii-kpi-user-email.txt", encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines), !cached.isEmpty {
        return cached
    }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: gcloudPath)
    task.arguments = ["config", "get-value", "account"]
    let out = Pipe()
    task.standardOutput = out
    task.standardError = FileHandle.nullDevice
    guard (try? task.run()) != nil else { return nil }
    task.waitUntilExit()
    let email = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return email.isEmpty || email == "(unset)" ? nil : email
}

func codexRateLimitPayload(_ snapshot: CodexSnapshot, email: String) -> [String: Any]? {
    guard snapshot.five?.pct != nil || snapshot.seven?.pct != nil,
          let messageData = try? JSONSerialization.data(withJSONObject: [
              "total_tokens": 0,
              "cached_input_tokens": 0,
              "input_tokens": 0,
              "output_tokens": 0,
              "reasoning_output_tokens": 0,
              "originator": "menubar",
              "rate_limit_used_percent": snapshot.seven?.pct ?? NSNull(),
              "rate_limit_window_minutes": snapshot.seven?.pct == nil ? NSNull() : 10080,
              "rate_limit_plan_type": snapshot.plan ?? NSNull(),
              "rate_limit_resets_at": codexEpoch(snapshot.seven?.resetsAt),
              "rate_limit_secondary_used_percent": snapshot.five?.pct ?? NSNull(),
              "rate_limit_secondary_window_minutes": snapshot.five?.pct == nil ? NSNull() : 300,
              "rate_limit_secondary_resets_at": codexEpoch(snapshot.five?.resetsAt),
          ] as [String: Any], options: [.sortedKeys]),
          let message = String(data: messageData, encoding: .utf8) else { return nil }
    return [
        "event_name": "codex_session",
        "source": "menubar",
        "user_email": email,
        "user_local": NSUserName(),
        "collector_version": "menubar",
        "message": message,
    ]
}

func codexEpoch(_ resetsAt: String?) -> Any {
    guard let date = parseResetTime(resetsAt) else { return NSNull() }
    return Int(date.timeIntervalSince1970)
}

func reportCodexRateLimits(_ snapshot: CodexSnapshot) {
    guard let email = codexUserEmail(),
          let payload = codexRateLimitPayload(snapshot, email: email) else { return }
    writeRateLimitLog(codexRateLimitLogName, payload)
}
