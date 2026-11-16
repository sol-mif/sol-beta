// Pop out (#701, the stage's sitting 7; the face's stage/pop.ts): a block's head dragged out of Sol's window opens the
// block as its own window over the desktop, still the same block. The window is a web view window labelled pop-<id>
// on the face's own page, index.html?block=<id>&session=<sid> (App.tsx draws that block alone, stage/Popped.tsx); its
// body is the engine's, as on the stage. Dragged back over Sol's window (its middle inside the main window), it closes
// and the main window hears `block-back`; closed any other way, it hears the same. The stage keeps the block's slot as
// a chip all along. The face asks for both (block_pop, block_pop_close); nothing here reads or writes a block.
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LABEL: &str = "pop-";
const FACE: &str = "main";
/** the smallest a popped block's window gets (the stage's MIN, model.ts) */
const MIN_W: f64 = 200.0;
const MIN_H: f64 = 120.0;

/// a block's id as the engine names it (blocks.ts validId): a lowercase letter or digit, then letters, digits and
/// dashes, 64 at most. Never a path, never a query (pure)
fn id_ok(id: &str) -> bool {
    let b = id.as_bytes();
    !b.is_empty() && b.len() <= 64 && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}
/// a session's id as the engine takes it (blocks.ts SID) (pure)
fn sid_ok(s: &str) -> bool { !s.is_empty() && s.len() <= 80 && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') }

/// the window a popped block lives in: pop-<id>, or none for a name that is not a block's (pure)
pub fn pop_label(id: &str) -> Option<String> { id_ok(id).then(|| format!("{LABEL}{id}")) }
/// is this window a popped block's (pure)
pub fn is_pop(label: &str) -> bool { label.strip_prefix(LABEL).is_some_and(id_ok) }
/// the face's page for a popped block (pure)
pub fn pop_url(id: &str, session: &str) -> Option<String> {
    (id_ok(id) && sid_ok(session)).then(|| format!("index.html?block={id}&session={session}"))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Box2 { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }
/// a popped window dragged back: its middle is inside Sol's window (pure; both in the same pixels)
pub fn over(main: Box2, pop: Box2) -> bool {
    let (cx, cy) = (pop.x + pop.w / 2.0, pop.y + pop.h / 2.0);
    main.w > 0.0 && main.h > 0.0 && cx > main.x && cx < main.x + main.w && cy > main.y && cy < main.y + main.h
}
fn box_of(p: PhysicalPosition<i32>, s: PhysicalSize<u32>) -> Box2 { Box2 { x: p.x as f64, y: p.y as f64, w: s.width as f64, h: s.height as f64 } }

/// Open a block in its own window at x, y (screen, logical px), w × h; an open one comes forward
#[tauri::command]
pub fn block_pop(app: AppHandle, id: String, session: String, title: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let (Some(label), Some(url)) = (pop_label(&id), pop_url(&id, &session)) else { return Err("not a block".into()) };
    if let Some(old) = app.get_webview_window(&label) {
        let _ = old.show();
        return old.set_focus().map_err(|e| e.to_string());
    }
    let title: String = title.chars().filter(|c| !c.is_control()).take(80).collect();
    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(if title.is_empty() { "Sol".to_string() } else { title })
        .inner_size(w.max(MIN_W), h.max(MIN_H))
        .min_inner_size(MIN_W, MIN_H)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_position(LogicalPosition::new(x, y));
    let _ = win.set_size(LogicalSize::new(w.max(MIN_W), h.max(MIN_H)));
    let (a, me, id2) = (app.clone(), win.clone(), id.clone());
    win.on_window_event(move |ev| match ev {
        // dragged back over Sol: it goes back on the stage
        WindowEvent::Moved(p) => {
            let Some(main) = a.get_webview_window(FACE) else { return };
            let (Ok(mp), Ok(ms), Ok(ps)) = (main.outer_position(), main.outer_size(), me.outer_size()) else { return };
            if main.is_visible().unwrap_or(false) && over(box_of(mp, ms), box_of(*p, ps)) { let _ = me.close(); }
        }
        WindowEvent::Destroyed => { let _ = a.emit_to(FACE, "block-back", serde_json::json!({ "id": id2 })); }
        _ => {}
    });
    Ok(())
}

/// Take a popped block back from the stage (its chip clicked): its window closes; none open is fine
#[tauri::command]
pub fn block_pop_close(app: AppHandle, id: String) -> Result<(), String> {
    let Some(label) = pop_label(&id) else { return Err("not a block".into()) };
    if let Some(w) = app.get_webview_window(&label) { w.close().map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_popped_window_is_bound_to_its_block() {
        assert_eq!(pop_label("week-1a2b").as_deref(), Some("pop-week-1a2b"));
        assert_eq!(pop_url("week-1a2b", "sess-aaaa1111").as_deref(), Some("index.html?block=week-1a2b&session=sess-aaaa1111"));
        assert!(is_pop("pop-week-1a2b") && !is_pop("pop-") && !is_pop("main") && !is_pop("work-abc") && !is_pop("pop-../x"));
        for bad in ["", "-x", "Week", "a b", "../main", "a?b=1", "a&session=x", &"x".repeat(65)] { assert!(pop_label(bad).is_none(), "{bad}"); }
        for bad in ["", "a b", "x&block=y", "../s", &"s".repeat(81)] { assert!(pop_url("week", bad).is_none(), "{bad}"); }
    }
    #[test]
    fn dragged_back_when_its_middle_is_over_sol() {
        let main = Box2 { x: 100.0, y: 100.0, w: 1280.0, h: 800.0 };
        assert!(over(main, Box2 { x: 600.0, y: 300.0, w: 440.0, h: 300.0 }), "inside: back");
        assert!(over(main, Box2 { x: 1100.0, y: 300.0, w: 440.0, h: 300.0 }), "half over the right edge, its middle inside: back");
        assert!(!over(main, Box2 { x: 1300.0, y: 300.0, w: 440.0, h: 300.0 }), "its middle past the edge: still out");
        assert!(!over(main, Box2 { x: 2000.0, y: 100.0, w: 440.0, h: 300.0 }), "another screen: out");
        assert!(!over(Box2 { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }, Box2 { x: 0.0, y: 0.0, w: 10.0, h: 10.0 }), "no main window: out");
    }
    #[test]
    fn a_popped_block_matches_the_face_capability_and_never_a_child_view() {
        let v: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let w: Vec<&str> = v["webviews"].as_array().unwrap().iter().map(|x| x.as_str().unwrap()).collect();
        assert!(w.contains(&"pop-*"), "the popped page is the face: it talks to the engine the same way");
        assert!(!LABEL.starts_with("block") && !LABEL.starts_with("thing"), "a popped block is a window, never a block view or a thing");
    }
}
