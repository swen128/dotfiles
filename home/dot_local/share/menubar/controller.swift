import AppKit
import Foundation

let refreshInterval: TimeInterval = 300
let warnThreshold = 70.0
let critThreshold = 90.0

func severityColor(_ pct: Double) -> NSColor {
    if pct >= critThreshold { return NSColor.systemRed }
    if pct >= warnThreshold { return NSColor.systemOrange }
    return NSColor.systemGreen
}

func parseDate(_ iso: String?) -> Date? {
    guard let iso = iso else { return nil }
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFraction.date(from: iso) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: iso)
}

func remainingText(_ iso: String?) -> String {
    guard let date = parseDate(iso) else { return "" }
    let secs = Int(date.timeIntervalSinceNow)
    if secs <= 0 { return "resetting" }
    let d = secs / 86400
    let h = (secs % 86400) / 3600
    let m = (secs % 3600) / 60
    if d > 0 { return "\(d)d\(h)h" }
    if h > 0 { return "\(h)h\(m)m" }
    return "\(m)m"
}

func clockText(_ iso: String?) -> String {
    guard let date = parseDate(iso) else { return "" }
    let fmt = DateFormatter()
    fmt.dateFormat = "EEE HH:mm"
    return fmt.string(from: date)
}

func truncate(_ s: String, _ max: Int) -> String {
    s.count <= max ? s : String(s.prefix(max - 1)) + "…"
}

let iconDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(".local/share/menubar")

func prIcon(height: CGFloat) -> NSImage {
    let s = height / 24.0
    let image = NSImage(size: NSSize(width: 24 * s, height: 24 * s))
    image.lockFocus()
    NSColor.black.setStroke()
    let lw: CGFloat = 2.3 * s
    func ring(_ cx: CGFloat, _ cy: CGFloat) {
        let r: CGFloat = 3.3 * s
        let p = NSBezierPath(ovalIn: NSRect(x: cx * s - r, y: cy * s - r, width: 2 * r, height: 2 * r))
        p.lineWidth = lw
        p.stroke()
    }
    func line(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat) {
        let p = NSBezierPath()
        p.lineWidth = lw
        p.lineCapStyle = .round
        p.move(to: NSPoint(x: x1 * s, y: y1 * s))
        p.line(to: NSPoint(x: x2 * s, y: y2 * s))
        p.stroke()
    }
    ring(5.5, 18.5)
    ring(5.5, 5.5)
    line(5.5, 9.3, 5.5, 14.7)
    ring(18.5, 5.5)
    line(18.5, 9.3, 18.5, 15)
    line(18.5, 15, 13, 20.5)
    line(13, 20.5, 18, 20.5)
    line(13, 20.5, 13, 15.5)
    image.unlockFocus()
    image.isTemplate = true
    return image
}

func loadIcon(_ name: String, height: CGFloat, template: Bool) -> NSImage? {
    guard let src = NSImage(contentsOf: iconDir.appendingPathComponent(name)) else { return nil }

    let render = 192
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: render, pixelsHigh: render,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
    rep.size = NSSize(width: render, height: render)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    src.draw(in: NSRect(x: 0, y: 0, width: render, height: render))
    NSGraphicsContext.restoreGraphicsState()

    let w = rep.pixelsWide, h = rep.pixelsHigh
    var minX = w, minY = h, maxX = 0, maxY = 0
    for y in 0..<h {
        for x in 0..<w where (rep.colorAt(x: x, y: y)?.alphaComponent ?? 0) > 0.1 {
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, y); maxY = max(maxY, y)
        }
    }
    guard maxX >= minX else { return nil }
    let cw = maxX - minX + 1, ch = maxY - minY + 1
    let outW = (height * CGFloat(cw) / CGFloat(ch)).rounded()

    let out = NSImage(size: NSSize(width: outW, height: height))
    out.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    let crop = NSRect(x: minX, y: h - maxY - 1, width: cw, height: ch)
    rep.draw(in: NSRect(x: 0, y: 0, width: outW, height: height),
             from: crop, operation: .sourceOver, fraction: 1,
             respectFlipped: false, hints: [.interpolation: NSImageInterpolation.high])
    out.unlockFocus()
    out.isTemplate = template
    return out
}

final class StatusBarController: NSObject {
    let usageStatusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let usageMenu = NSMenu()
    let prStatusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let prMenu = NSMenu()
    var timer: Timer?

    override init() {
        super.init()
        usageStatusItem.menu = usageMenu
        usageStatusItem.button?.image = loadIcon("claudecode-color.svg", height: 13, template: false)
        usageStatusItem.button?.imagePosition = .imageLeading
        usageStatusItem.button?.title = " …"
        prStatusItem.menu = prMenu
        prStatusItem.button?.image = prIcon(height: 13)
        prStatusItem.button?.imagePosition = .imageLeading
        prStatusItem.button?.title = " …"
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    @objc func refresh() {
        DispatchQueue.global(qos: .utility).async {
            let snap = fetchUsage()
            let prs = fetchPRs()
            DispatchQueue.main.async {
                self.renderUsage(snap)
                self.renderPRs(prs)
            }
        }
    }

    func detailItem(_ text: String, color: NSColor?) -> NSMenuItem {
        let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
        let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        var attrs: [NSAttributedString.Key: Any] = [.font: font]
        if let color = color { attrs[.foregroundColor] = color }
        item.attributedTitle = NSAttributedString(string: text, attributes: attrs)
        return item
    }

    func appendFooter(_ menu: NSMenu, withQuit: Bool) {
        menu.addItem(NSMenuItem.separator())
        let stamp = DateFormatter()
        stamp.dateFormat = "HH:mm:ss"
        menu.addItem(detailItem("Updated \(stamp.string(from: Date()))", color: .secondaryLabelColor))
        let refreshItem = NSMenuItem(title: "Refresh now", action: #selector(refresh), keyEquivalent: "r")
        refreshItem.target = self
        menu.addItem(refreshItem)
        if withQuit {
            let quitItem = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
            quitItem.target = self
            menu.addItem(quitItem)
        }
    }

    func renderUsage(_ snap: UsageSnapshot) {
        usageMenu.removeAllItems()

        if let err = snap.error {
            usageStatusItem.button?.title = " ⚠"
            usageMenu.addItem(detailItem("⚠️  \(err)", color: .secondaryLabelColor))
            usageMenu.addItem(detailItem("Open Claude Code and run /usage to re-auth", color: .secondaryLabelColor))
        } else {
            let p7 = snap.seven.pct ?? 0
            let suffix7 = remainingText(snap.seven.resetsAt).isEmpty ? "" : " (\(remainingText(snap.seven.resetsAt)))"
            let title = String(format: " %.0f%%%@", p7, suffix7)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium),
                .foregroundColor: severityColor(p7),
            ]
            usageStatusItem.button?.attributedTitle = NSAttributedString(string: title, attributes: attrs)

            let p5 = snap.five.pct ?? 0
            usageMenu.addItem(detailItem(String(format: "5-hour      %3.0f%%   resets in %@", p5, remainingText(snap.five.resetsAt)), color: severityColor(p5)))
            usageMenu.addItem(detailItem(String(format: "7-day (all) %3.0f%%   resets in %@  (%@)", p7, remainingText(snap.seven.resetsAt), clockText(snap.seven.resetsAt)), color: severityColor(p7)))
            if let ps = snap.sonnet.pct {
                usageMenu.addItem(detailItem(String(format: "  7-day Sonnet %3.0f%%", ps), color: .secondaryLabelColor))
            }
            if let po = snap.opus.pct {
                usageMenu.addItem(detailItem(String(format: "  7-day Opus   %3.0f%%", po), color: .secondaryLabelColor))
            }
            if let extra = snap.extra {
                usageMenu.addItem(detailItem(extra, color: .secondaryLabelColor))
            }
            let dashItem = NSMenuItem(title: "Usage dashboard", action: #selector(openDashboard), keyEquivalent: "")
            dashItem.target = self
            usageMenu.addItem(NSMenuItem.separator())
            usageMenu.addItem(dashItem)
        }
        appendFooter(usageMenu, withQuit: true)
    }

    func renderPRs(_ result: PRResult) {
        prMenu.removeAllItems()

        if let err = result.error {
            prStatusItem.button?.title = " ⚠"
            prMenu.addItem(detailItem("⚠️  \(err)", color: .secondaryLabelColor))
        } else {
            let n = result.prs.count
            prStatusItem.button?.title = " \(n)"
            if n == 0 {
                prMenu.addItem(detailItem("No PRs awaiting your review 🎉", color: .secondaryLabelColor))
            } else {
                prMenu.addItem(detailItem("\(n) PR\(n == 1 ? "" : "s") awaiting your review", color: .labelColor))
                prMenu.addItem(NSMenuItem.separator())
                for pr in result.prs {
                    let item = NSMenuItem(title: "", action: #selector(openPR(_:)), keyEquivalent: "")
                    let label = "\(pr.repo) #\(pr.number)  \(truncate(pr.title, 70))"
                    item.attributedTitle = NSAttributedString(
                        string: label,
                        attributes: [.font: NSFont.menuFont(ofSize: 13)])
                    item.representedObject = pr.url
                    item.target = self
                    prMenu.addItem(item)
                }
            }
        }
        appendFooter(prMenu, withQuit: false)
    }

    @objc func openPR(_ sender: NSMenuItem) {
        if let urlStr = sender.representedObject as? String, let url = URL(string: urlStr) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func openDashboard() {
        NSWorkspace.shared.open(URL(string: "https://claude.ai/settings/usage")!)
    }

    @objc func quit() {
        NSApp.terminate(nil)
    }
}
