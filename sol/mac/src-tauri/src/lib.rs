mod feedback;
mod haptic;
mod hot;
mod link;
mod pause;
mod permit;
mod places;
mod pop;
mod root;
mod screens;
mod thing;
mod update;
mod welcome;

use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

/// The engine's port, 7777 unless the build sets SOL_ENGINE_PORT: a second app (a test build of a try) then talks
/// to its own engine and never to the person's Sol.
pub const ENGINE_PORT: u16 = port_of(option_env!("SOL_ENGINE_PORT"));

const fn port_of(s: Option<&str>) -> u16 {
    let b = match s { Some(s) => s.as_bytes(), None => return 7777 };
    let (mut i, mut n) = (0, 0u32);
    while i < b.len() {
        assert!(b[i].is_ascii_digit(), "SOL_ENGINE_PORT must be digits");
        n = n * 10 + (b[i] - b'0') as u32;
        i += 1;
    }
    assert!(n > 0 && n < 65536, "SOL_ENGINE_PORT out of range");
    n as u16
}

fn engine_is_up() -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{ENGINE_PORT}").parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_ok()
}

/// Start the engine (a Node process) if nothing answers on its port: the root's sol/engine/dist/index.js (root.rs),
/// with the node the root resolution found and a PATH that holds it. No root: nothing to start (the welcome page).
/// On a Mac with the install's launchd job the engine is there before the face, and this does nothing.
pub fn start_engine_if_needed(app: &AppHandle) {
    if engine_is_up() {
        return;
    }
    let Some(root) = root::root(app) else { return };
    *SPAWNED.lock().unwrap() = Some(std::time::Instant::now());
    let eng = root.join("sol").join("engine");
    let _ = Command::new(root::node())
        .arg(eng.join("dist").join("index.js"))
        .current_dir(&eng)
        .env("PATH", root::path_env())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

/// When this app last started the engine itself (None: it never had to).
static SPAWNED: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
const START_GRACE: Duration = Duration::from_secs(20);

/// The engine's lifecycle as the app sees it, for a page whose socket is down (creature/state.ts): up when the port
/// answers; starting for 20 s after this app spawned it; failed after that; down when nobody is starting it.
#[tauri::command]
fn engine_phase() -> &'static str {
    if engine_is_up() { return "up"; }
    match *SPAWNED.lock().unwrap() {
        Some(t) if t.elapsed() < START_GRACE => "starting",
        Some(_) => "failed",
        None => "down",
    }
}

/// The creature's click when it is unplugged: start the engine unless it is up or already starting. Returns the phase.
#[tauri::command]
fn engine_start(app: AppHandle) -> &'static str {
    if engine_phase() != "starting" {
        start_engine_if_needed(&app);
    }
    engine_phase()
}

/// Seconds since the last key or mouse event anywhere on the Mac (Quartz). Keeps growing while the screen is locked
/// or the Mac sleeps, so those count as Away. None when the source is not there: the engine then never says Away.
#[tauri::command]
fn idle_seconds() -> Option<f64> {
    system_idle()
}
#[cfg(target_os = "macos")]
pub(crate) fn system_idle() -> Option<f64> {
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    // kCGEventSourceStateCombinedSessionState = 0, kCGAnyInputEventType = !0
    let s = unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) };
    if s.is_finite() && s >= 0.0 { Some(s) } else { None }
}
#[cfg(not(target_os = "macos"))]
pub(crate) fn system_idle() -> Option<f64> { None }

/// Is the main window on the screen Marco is looking at (#845, the one notification's gate)? Tauri's is_visible says
/// shown, not seen; NSWindow's occlusionState carries the Visible bit only while some part of the window can be seen, so
/// it is off when minimized, hidden, under a full-screen app or another window, on another space, or with the display
/// asleep. Read twice a second on the main thread (the read is one property) and told to the window as `sol-occluded`
/// (true while covered) only when it turns; the face (notify/visible.ts) folds it into presence.visible. Polled rather
/// than observed: occlusionState already reflects a space change and a screen sleep, so the poll catches every case the
/// notifications would, with no observer to keep alive. Written on Linux, unrun on a Mac when it landed.
static OCCLUDED: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);   // 0 unsaid, 1 seen, 2 covered
fn occlusion_check(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let Some(covered) = window_covered(&w) else { return };
    let now = if covered { 2 } else { 1 };
    if OCCLUDED.swap(now, std::sync::atomic::Ordering::Relaxed) != now {
        let _ = w.emit("sol-occluded", covered);
    }
}
#[cfg(target_os = "macos")]
fn window_covered(w: &tauri::WebviewWindow) -> Option<bool> {
    use objc2_app_kit::{NSWindow, NSWindowOcclusionState};
    let p = w.ns_window().ok()?;
    let ns: &NSWindow = unsafe { &*(p as *const NSWindow) };
    Some(!ns.occlusionState().contains(NSWindowOcclusionState::Visible))
}
#[cfg(not(target_os = "macos"))]
fn window_covered(_w: &tauri::WebviewWindow) -> Option<bool> { None }

fn show_main(app: &AppHandle) {
    // the window, not the "webview window": with a thing open inside (thing.rs) it holds more than one web view, and
    // get_webview_window then answers None
    if let Some(w) = app.get_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Mutable mode: Settings' engine drawer flips the face between the bundled pages and Vite's (hot.rs).
#[tauri::command]
fn face_mode(app: AppHandle, hot: bool) -> hot::FaceState {
    hot::set(&app, hot);
    let h = app.clone();
    let _ = app.run_on_main_thread(move || hot::check(&h));
    hot::state(&app)
}

#[tauri::command]
fn face_state(app: AppHandle) -> hot::FaceState {
    hot::state(&app)
}

#[tauri::command]
fn engine_port() -> u16 {
    ENGINE_PORT
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())   // sol:// links (#327, link.rs)
        .plugin(tauri_plugin_updater::Builder::new().build())   // the app updates itself (#1824, update.rs); no window may call it
        .manage(hot::Hot::default())
        .manage(thing::Tabs::default())
        .manage(link::Waiting::default())
        .invoke_handler(tauri::generate_handler![engine_port, engine_phase, engine_start, idle_seconds, face_mode, face_state,
            welcome::install_run, welcome::claude_login, welcome::claude_status, welcome::codex_login, welcome::codex_status, welcome::claude_install, welcome::welcome_done,
            permit::permit_state, permit::permit_open, permit::permit_back, permit::app_relaunch, places::places_copy, places::places_drop,
            thing::thing_open, thing::thing_show, thing::thing_bounds, thing::thing_close, thing::thing_nav, thing::thing_outside, thing::sites_sign_out, thing::sites_clear, thing::block_view_open, thing::block_view_bounds, thing::block_view_hide_all, thing::block_view_nav, thing::block_view_close, pop::block_pop, pop::block_pop_close, screens::screens, screens::screen_window_open, screens::screen_window_close, screens::screens_off, link::sol_url_take, haptic::haptic, update::app_update_apply, update::app_update_state])
        .setup(|app| {
            start_engine_if_needed(app.handle());
            link::init(app.handle());   // the link that launched Sol, then every sol:// link (#327)

            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            hot::init(app.handle());
            // no checkout to run (a downloaded app, before its install): the face on its first run, which installs (#169, #134)
            if root::root(app.handle()).is_none() { if let Err(e) = welcome::show_page(app.handle(), "/?firstrun=1") { eprintln!("first run: {e}"); } }
            let face_item = MenuItem::with_id(app, "face", hot::tray_text(hot::wanted(app.handle())), true, None::<&str>)?;
            app.state::<hot::Hot>().0.lock().unwrap().tray = Some(face_item.clone());
            // a beta tester says what broke, no GitHub account needed (#294, feedback.rs)
            let tell = MenuItem::with_id(app, "tell", "Tell us…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &face_item, &tell, &quit])?;

            // one menu bar icon, built here (a trayIcon in tauri.conf.json would add a second, menu-less one)
            TrayIconBuilder::with_id("tray")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "face" => {
                        hot::set(app, !hot::wanted(app));
                        hot::check(app);
                    }
                    "tell" => feedback::open(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            update::start(app.handle());   // the app updates itself, restarted only on the person's press (#1824, update.rs)
            pause::start();   // the pause signal's senses (#1597, pause.rs): the engine keeps it off until pause.signal is set
            // the face's pages follow the hot pick: checked every two seconds
            let h = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(2));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || hot::check(&h2));
            });
            // the one notification's gate (#845): is the main window seen? told to the face only when it turns
            let h = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || occlusion_check(&h2));
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it; the menu bar icon stays, the engine keeps running.
            // A popped block's window (pop.rs) really closes: its block goes back on the stage.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if pop::is_pop(window.label()) || screens::is_screen(window.label()) { return; }   // #1090: a screen window really closes: its blocks fold home
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // A click on the Dock icon (or "open" again) shows the hidden window back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main(app);
            }
            // the Vite Sol started goes with it
            if let tauri::RunEvent::Exit = event {
                hot::stop_vite(app);
            }
        });
}