local wezterm = require("wezterm")
local keybinds = require("keybinds")

local c = wezterm.config_builder()

c.font_size = 13.0
c.window_close_confirmation = "NeverPrompt"
c.check_for_updates = false

c.animation_fps = 1
c.cursor_blink_ease_in = "Constant"
c.cursor_blink_ease_out = "Constant"
c.cursor_blink_rate = 0

c.disable_default_key_bindings = true
c.enable_csi_u_key_encoding = true
c.leader = { key = "Space", mods = "CTRL|SHIFT" }
c.keys = keybinds.create_keybinds()
c.key_tables = keybinds.key_tables
c.mouse_bindings = keybinds.mouse_bindings

c.unix_domains = { { name = "unix" } }
c.default_gui_startup_args = { 'connect', 'unix' }

return c

