import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = StatusBarController()
app.run()
