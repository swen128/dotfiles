import Foundation

let ghPath = "/opt/homebrew/bin/gh"

struct PullRequest {
    let title: String
    let repo: String
    let number: Int
    let url: String
}

struct PRResult {
    let prs: [PullRequest]
    let error: String?
}

func fetchPRs() -> PRResult {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: ghPath)
    task.arguments = ["search", "prs", "--review-requested=@me", "--state=open",
                      "--limit", "50", "--json", "number,title,url,repository"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = Pipe()
    do {
        try task.run()
    } catch {
        return PRResult(prs: [], error: "gh missing")
    }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    guard task.terminationStatus == 0 else {
        return PRResult(prs: [], error: "gh error")
    }
    guard let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        return PRResult(prs: [], error: "parse error")
    }
    let prs = arr.map { item -> PullRequest in
        let repo = (item["repository"] as? [String: Any])?["nameWithOwner"] as? String ?? ""
        return PullRequest(title: item["title"] as? String ?? "",
                           repo: repo,
                           number: item["number"] as? Int ?? 0,
                           url: item["url"] as? String ?? "")
    }
    return PRResult(prs: prs, error: nil)
}
