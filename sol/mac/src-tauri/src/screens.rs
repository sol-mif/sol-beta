// One Jelly, several windows onto it (#1090, behind the face's switch `screens.two`): the shell's half. The engine keeps
// the one record (which window shows which block, each window's role); the face draws a window's share; here the shell
// makes the windows and knows the displays. Built on #888's screens.rs (the monitors, the 2 s watch).
//   screens                 every display (its name, logical rect, scale, whether it holds the main window); the first
//                           ask starts the watch. Tauri 2 has no monitor event, so a thread asks every 2 s and emits
//                           `screens:changed` to the main window only when the answer changes.
//   screen_window_open      window `win` (label screen-<win>) on the face's own page told its window and role
//                           (index.html?screen=<win>&role=<role>&screens.two=on), filling the display that is not the
//                           main window's; the display it was on last in this arrangement of displays wins. Remembered
//                           per arrangement (screens-kept.json in the app's data folder).
//   screen_window_close     closed; its face's socket closes, the engine marks it gone, its blocks fold home.
//   the unplug fold         the watch sees a window's display go: the window is closed (its blocks fold home, the face
//                           draws them coming in). The same arrangement back: the window opens again where it was, in the
//                           role it had, with no press; the engine gives it back its blocks (their lines were kept).
// Nothing here reads or writes a block or a session.
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const FACE: &str = "main";
pub const PREFIX: &str = "screen-";
const EVERY: Duration = Duration::from_secs(2);
static WATCHING: AtomicBool = AtomicBool::new(false);
static GEN: AtomicU64 = AtomicU64::new(0);   // the current watch (screens): an older thread stops at its next turn
/// windows the watch closed because their display went: only these open again on their own
static FOLDED: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Screen { pub name: String, pub x: f64, pub y: f64, pub w: f64, pub h: f64, pub scale: f64, pub main: bool }

/// a display as the face reads it: logical px, its name or "screen <n>" when the platform gives none (pure)
pub fn screen_of(i: usize, name: Option<&str>, size: (u32, u32), pos: (i32, i32), scale: f64, main: bool) -> Screen {
    let s = if scale > 0.0 { scale } else { 1.0 };
    let name = name.map(str::trim).filter(|n| !n.is_empty()).map(String::from).unwrap_or_else(|| format!("screen {}", i + 1));
    Screen { name, x: (pos.0 as f64 / s).round(), y: (pos.1 as f64 / s).round(), w: (size.0 as f64 / s).round(), h: (size.1 as f64 / s).round(), scale: s, main }
}
/// an arrangement of displays: the same displays in the same places is the same desk (pure; order does not matter)
pub fn arrangement(screens: &[Screen]) -> String {
    let mut parts: Vec<String> = screens.iter().map(|s| format!("{}@{},{} {}x{}", s.name, s.x, s.y, s.w, s.h)).collect();
    parts.sort();
    parts.join(" | ")
}
/// a window's name as the engine's record takes it (screens.ts WIN): never a path, never a query (pure)
pub fn win_ok(win: &str) -> bool {
    let b = win.as_bytes();
    !b.is_empty() && b.len() <= 32 && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-') && win != "main"
}
pub fn role_ok(role: &str) -> bool { matches!(role, "whole" | "anchor" | "stage" | "wall" | "watch") }
pub fn screen_label(win: &str) -> Option<String> { win_ok(win).then(|| format!("{PREFIX}{win}")) }
pub fn is_screen(label: &str) -> bool { label.strip_prefix(PREFIX).is_some_and(win_ok) }
/// the face's page for window `win` in `role` (pure)
pub fn screen_url(win: &str, role: &str) -> Option<String> {
    (win_ok(win) && role_ok(role)).then(|| format!("index.html?screen={win}&role={role}&screens.two=on"))
}
/// which display a window opens on: where it was last in this arrangement if that display is here, else the first that
/// does not hold the main window; one display alone: none (the face draws no ghost then) (pure)
pub fn pick(screens: &[Screen], last: Option<&str>) -> Option<usize> {
    if screens.len() < 2 { return None; }
    if let Some(n) = last { if let Some(i) = screens.iter().position(|s| s.name == n) { return Some(i); } }
    screens.iter().position(|s| !s.main)
}

/// where each window stood, per arrangement of displays, and the role it had
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Placed { pub display: String, pub role: String }
pub type Kept = BTreeMap<String, BTreeMap<String, Placed>>;

/// what the watch does when the displays change (pure): close the open windows whose display went; open again the
/// windows it closed whose display is back in a kept arrangement, in the role they had
pub fn plan(now: &[Screen], open: &[(String, String)], kept: &Kept, folded: &BTreeSet<String>) -> (Vec<String>, Vec<(String, Placed)>) {
    let here: BTreeSet<&str> = now.iter().map(|s| s.name.as_str()).collect();
    let close = open.iter().filter(|(_, d)| !here.contains(d.as_str())).map(|(w, _)| w.clone()).collect();
    let opened: BTreeSet<&str> = open.iter().map(|(w, _)| w.as_str()).collect();
    let back = kept.get(&arrangement(now)).map(|m| m.iter()
        .filter(|(w, p)| folded.contains(*w) && !opened.contains(w.as_str()) && here.contains(p.display.as_str()) && now.iter().any(|s| s.name == p.display && !s.main))
        .map(|(w, p)| (w.clone(), p.clone())).collect()).unwrap_or_default();
    (close, back)
}

fn same(a: &Monitor, b: &Monitor) -> bool { a.name() == b.name() && a.position() == b.position() && a.size() == b.size() }
fn monitors(app: &AppHandle) -> Vec<(Screen, Monitor)> {
    let all = app.available_monitors().unwrap_or_default();
    let mine = app.get_webview_window(FACE).and_then(|w| w.current_monitor().ok().flatten());
    all.into_iter().enumerate().map(|(i, m)| {
        let (s, p) = (m.size(), m.position());
        (screen_of(i, m.name().map(String::as_str), (s.width, s.height), (p.x, p.y), m.scale_factor(), mine.as_ref().is_some_and(|w| same(w, &m))), m)
    }).collect()
}
fn list(app: &AppHandle) -> Vec<Screen> { monitors(app).into_iter().map(|(s, _)| s).collect() }

fn kept_file(app: &AppHandle) -> Option<PathBuf> { app.path().app_data_dir().ok().map(|d| d.join("screens-kept.json")) }
fn kept_read(app: &AppHandle) -> Kept {
    kept_file(app).and_then(|f| std::fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}
fn kept_write(app: &AppHandle, k: &Kept) {
    let Some(f) = kept_file(app) else { return };
    if let Some(d) = f.parent() { let _ = std::fs::create_dir_all(d); }
    let tmp = f.with_extension("json.tmp");
    if std::fs::write(&tmp, serde_json::to_string_pretty(k).unwrap_or_default()).is_ok() { let _ = std::fs::rename(tmp, f); }
}
/// the screen windows open now and the display each was put on (as kept for this arrangement)
fn open_now(app: &AppHandle, now: &[Screen], kept: &Kept) -> Vec<(String, String)> {
    let m = kept.get(&arrangement(now));
    app.webview_windows().keys().filter(|l| is_screen(l)).filter_map(|l| {
        let win = l.trim_start_matches(PREFIX).to_string();
        m.and_then(|m| m.get(&win)).map(|p| (win, p.display.clone()))
    }).collect()
}

/// every display, and which holds the main window; the first ask starts the watch
#[tauri::command]
pub fn screens(app: AppHandle) -> Vec<Screen> {
    if !WATCHING.swap(true, Ordering::SeqCst) {
        let a = app.clone();
        // this watch's generation: off and on within one turn starts a new one, and the old one sees it is not current
        let mine = GEN.fetch_add(1, Ordering::SeqCst) + 1;
        std::thread::spawn(move || {
            let mut last = list(&a);
            loop {
                std::thread::sleep(EVERY);
                if !WATCHING.load(Ordering::SeqCst) || GEN.load(Ordering::SeqCst) != mine { break; }   // screens_off, or a newer watch
                let now = list(&a);
                if now == last { continue; }
                let _ = a.emit_to(FACE, "screens:changed", &now);
                // the fold and the return: the windows on a display that went close; those come back with their display
                let kept = kept_read(&a);
                let folded = FOLDED.lock().map(|f| f.clone()).unwrap_or_default();
                // the windows open before the change stood on the old arrangement's displays
                let (close, back) = plan(&now, &open_now(&a, &last, &kept), &kept, &folded);
                for win in close {
                    if let Ok(mut f) = FOLDED.lock() { f.insert(win.clone()); }
                    if let Some(w) = screen_label(&win).and_then(|l| a.get_webview_window(&l)) { let _ = w.close(); }
                }
                for (win, p) in back {
                    if let Ok(mut f) = FOLDED.lock() { f.remove(&win); }
                    let _ = open_on(&a, &win, &p.role, Some(&p.display));
                }
                last = now;
            }
        });
    }
    list(&app)
}

fn open_on(app: &AppHandle, win: &str, role: &str, display: Option<&str>) -> Result<(), String> {
    let (Some(label), Some(url)) = (screen_label(win), screen_url(win, role)) else { return Err("not a window Sol opens".into()) };
    let all = monitors(app);
    let screens: Vec<Screen> = all.iter().map(|(s, _)| s.clone()).collect();
    let mut kept = kept_read(app);
    let key = arrangement(&screens);
    let last = display.map(String::from).or_else(|| kept.get(&key).and_then(|m| m.get(win)).map(|p| p.display.clone()));
    let at = pick(&screens, last.as_deref());
    let w = match app.get_webview_window(&label) {
        Some(w) => w,
        None => {
            let w = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
                .title("Jelly")
                .inner_size(1280.0, 800.0)
                .disable_drag_drop_handler()
                .build()
                .map_err(|e| e.to_string())?;
            let (a, name) = (app.clone(), win.to_string());
            w.on_window_event(move |ev| if let WindowEvent::Destroyed = ev { let _ = a.emit_to(FACE, "screen-window-gone", &name); });
            w
        }
    };
    match at {
        Some(i) => {
            // the whole display, in its own logical px (a Retina laptop beside a 1x monitor: each its own scale)
            let (s, m) = (&all[i].0, &all[i].1);
            let _ = w.unmaximize();
            let _ = w.set_position(LogicalPosition::new(s.x, s.y));
            let _ = w.set_size(LogicalSize::new(s.w, s.h));
            let _ = m;   // the display itself, kept for a Mac build that wants its work area (menu bar, dock) instead
            let _ = w.maximize();
            kept.entry(key).or_default().insert(win.to_string(), Placed { display: s.name.clone(), role: role.to_string() });
            kept_write(app, &kept);
        }
        // one display: beside the main window on the same screen (an ultrawide split by hand)
        None => if let Some(main) = app.get_webview_window(FACE) {
            if let (Ok(p), Ok(sz), Ok(f)) = (main.outer_position(), main.outer_size(), main.scale_factor()) {
                let _ = w.set_position(LogicalPosition::new((p.x as f64 + sz.width as f64) / f, p.y as f64 / f));
            }
        },
    }
    let _ = w.show();
    w.set_focus().map_err(|e| e.to_string())
}

/// open window `win` (screen-<win>) in `role` on the other display; an open one is moved there and comes forward
#[tauri::command]
pub fn screen_window_open(app: AppHandle, win: String, role: String) -> Result<(), String> {
    if let Ok(mut f) = FOLDED.lock() { f.remove(&win); }
    open_on(&app, &win, &role, None)
}

/// the switch turned off: every screen window closes and the watch stops (it exits at its next turn)
#[tauri::command]
pub fn screens_off(app: AppHandle) -> Result<(), String> {
    WATCHING.store(false, Ordering::SeqCst);
    if let Ok(mut f) = FOLDED.lock() { f.clear(); }
    for (label, w) in app.webview_windows() { if is_screen(&label) { let _ = w.close(); } }
    Ok(())
}

/// close window `win`; none open is fine. Closed by hand it stays closed (only an unplug brings it back on its own)
#[tauri::command]
pub fn screen_window_close(app: AppHandle, win: String) -> Result<(), String> {
    if let Ok(mut f) = FOLDED.lock() { f.remove(&win); }
    if let Some(w) = screen_label(&win).and_then(|l| app.get_webview_window(&l)) { w.close().map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn s(name: &str, x: f64, w: f64, main: bool) -> Screen { Screen { name: name.into(), x, y: 0.0, w, h: 900.0, scale: 1.0, main } }

    #[test]
    fn a_display_is_read_in_logical_px_and_always_named() {
        let a = screen_of(0, Some("Built-in Retina Display"), (3024, 1964), (0, 0), 2.0, true);
        assert_eq!((a.name.as_str(), a.w, a.h, a.main), ("Built-in Retina Display", 1512.0, 982.0, true));
        assert_eq!(screen_of(1, None, (2560, 1440), (3024, -200), 1.0, false).name, "screen 2");
        assert_eq!(screen_of(2, Some("  "), (10, 10), (0, 0), 0.0, false).scale, 1.0);
    }
    #[test]
    fn an_arrangement_is_the_same_desk_in_any_order() {
        let (a, b) = (s("Built-in", 0.0, 1512.0, true), s("DELL", 1512.0, 2560.0, false));
        assert_eq!(arrangement(&[a.clone(), b.clone()]), arrangement(&[b.clone(), a.clone()]));
        assert_ne!(arrangement(&[a.clone(), b.clone()]), arrangement(&[a, s("DELL", -2560.0, 2560.0, false)]));
    }
    #[test]
    fn a_window_opens_where_it_was_else_on_the_display_without_the_main_window() {
        let desk = [s("Built-in", 0.0, 1512.0, true), s("DELL", 1512.0, 2560.0, false), s("LG", 4072.0, 1920.0, false)];
        assert_eq!(pick(&desk, None), Some(1));
        assert_eq!(pick(&desk, Some("LG")), Some(2));
        assert_eq!(pick(&desk, Some("gone")), Some(1));
        assert_eq!(pick(&desk[..1], None), None);
    }
    #[test]
    fn only_a_window_name_and_a_role_reach_the_page() {
        assert_eq!(screen_url("two", "wall").as_deref(), Some("index.html?screen=two&role=wall&screens.two=on"));
        for (w, r) in [("main", "stage"), ("../x", "stage"), ("Two", "stage"), ("two", "boss"), ("a&b", "wall"), ("", "wall")] {
            assert!(screen_url(w, r).is_none(), "{w} {r}");
        }
        assert!(is_screen("screen-two") && !is_screen("screen-") && !is_screen("pop-two"));
    }
    #[test]
    fn unplugged_folds_and_plugged_back_returns() {
        let (lap, mon) = (s("Built-in", 0.0, 1512.0, true), s("DELL", 1512.0, 2560.0, false));
        let both = [lap.clone(), mon.clone()];
        let mut kept = Kept::new();
        kept.entry(arrangement(&both)).or_default().insert("two".into(), Placed { display: "DELL".into(), role: "wall".into() });
        // the monitor goes: window two closes
        let (close, back) = plan(&[lap.clone()], &[("two".into(), "DELL".into())], &kept, &BTreeSet::new());
        assert_eq!((close, back.len()), (vec!["two".to_string()], 0));
        // it comes back: window two opens there again, a wall, only because the unplug closed it
        let folded: BTreeSet<String> = ["two".to_string()].into();
        let (close, back) = plan(&both, &[], &kept, &folded);
        assert!(close.is_empty());
        assert_eq!(back, vec![("two".to_string(), Placed { display: "DELL".into(), role: "wall".into() })]);
        assert!(plan(&both, &[], &kept, &BTreeSet::new()).1.is_empty(), "closed by hand: it stays closed");
    }
    #[test]
    fn the_screen_windows_are_the_face() {
        for f in [include_str!("../capabilities/default.json"), include_str!("../capabilities/default-hot.json")] {
            let v: serde_json::Value = serde_json::from_str(f).unwrap();
            let w: Vec<&str> = v["webviews"].as_array().unwrap().iter().map(|x| x.as_str().unwrap()).collect();
            assert!(w.contains(&"screen-*"), "the second window's page is the face: it speaks to the engine the same way");
        }
    }
}
