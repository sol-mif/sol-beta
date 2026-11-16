// The app's own commands get permissions (an ACL manifest) so the pages may call them when they are served by Vite
// (mutable mode, http://localhost:1420): Tauri refuses custom commands from a non-bundled origin unless a capability
// with a `remote` URL allows them. Once a manifest exists the bundled pages need them listed too (capabilities/).
const COMMANDS: &[&str] = &["engine_port", "notch_expand", "notch_geometry", "notch_regions", "face_log", "face_mode", "face_state", "type_text", "grab_sheet", "page_scroll", "permit_state", "permit_open", "permit_back", "eye_set", "eye_get", "clean_open", "clean_set", "clean_close", "clean_get", "call_mute",
    "thing_open", "thing_show", "thing_bounds", "thing_close", "thing_nav", "thing_outside", "sites_sign_out", "sites_clear", "sol_url_take",
    // the stage's browser block in your hand (#699, thing.rs block_view_*)
    "block_view_open", "block_view_bounds", "block_view_hide_all", "block_view_nav", "block_view_close",
    // a block popped out to its own window (#701, pop.rs)
    "block_pop", "block_pop_close",
    // the first run (welcome.rs) and the engine's plug (lib.rs): missing here, the bundled app refused them all ("not allowed by ACL", the first run of 29 Oct)
    "install_run", "claude_login", "claude_status", "codex_login", "codex_status", "claude_install", "welcome_done", "engine_start", "engine_phase", "idle_seconds"];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("failed to run tauri-build");
}
