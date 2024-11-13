local wezterm = require("wezterm")
local keybinds = require("keybinds")

local c = wezterm.config_builder()

c.font_size = 13.0
c.window_decorations = "RESIZE" -- Hide the title bar.
c.hide_tab_bar_if_only_one_tab = true
c.show_new_tab_button_in_tab_bar = false
c.show_close_tab_button_in_tabs = false

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

return c

