// Another Sol on this Mac's port (#1852). A downloaded Sol.app that finds an engine already answering on 7777 used to
// dial it and run its first run against it: on a Mac that also runs a team engine from a checkout, the install saw
// that engine's login job and stopped ("Sol is already here"), and the face quietly used the other Sol. Now the app
// asks the engine where it runs from (`/health`'s root, sol/engine/src/index.ts) and, when it is not this app's own,
// the window shows one plain line (another.html, sol/mac/src/another) and dials nothing. The other Sol is never
// stopped. Only a downloaded app asks: one built from a checkout (its build folder holds Sol, root.rs) shares the
// team's engines as it always has.
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// `/health`'s body from the engine on this Mac's port, or None when nothing answers in time.
fn health() -> Option<String> {
    let addr = format!("127.0.0.1:{}", crate::ENGINE_PORT).parse().ok()?;
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    s.set_write_timeout(Some(Duration::from_secs(1))).ok()?;
    // no Origin: a program of this Mac's, which the engine's door lets read /health (door.ts)
    s.write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").ok()?;
    let mut raw = Vec::new();
    let _ = s.take(4 << 20).read_to_end(&mut raw);
    let text = String::from_utf8_lossy(&raw);
    let (head, body) = text.split_once("\r\n\r\n")?;
    head.starts_with("HTTP/1.").then(|| body.to_string())
}

fn same(a: &Path, b: &Path) -> bool {
    let c = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    c(a) == c(b)
}

/// Is the engine that answered with `body` someone else's? `own` is this app's root (None before its install). Not
/// Sol at all, or no answer: None, nothing to say (the port is someone else's, and the engine will not start; the
/// creature says so). Sol from this root: None. Sol from anywhere else, or one too old to say where: Some(its root,
/// "" when it did not say).
pub fn foreign(own: Option<&Path>, body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if v.get("engine").and_then(|e| e.as_str()) != Some("sol") { return None; }
    let theirs = v.get("root").and_then(|r| r.as_str()).filter(|r| !r.is_empty());
    match (own, theirs) {
        (None, t) => Some(t.unwrap_or("").to_string()),
        (Some(_), None) => None,
        (Some(o), Some(t)) => (!same(o, Path::new(t))).then(|| t.to_string()),
    }
}

/// What the launch found: the other Sol's root ("" when it did not say), None when the engine is this app's own.
pub static OTHER: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// The line's page asks where the other Sol runs from, to name it under the line.
#[tauri::command]
pub fn another_sol() -> Option<String> { OTHER.lock().unwrap().clone() }

/// At launch, for a downloaded app only: the other Sol's root when the engine on the port is not this app's own.
pub fn check(own: Option<PathBuf>, team_build: bool) -> Option<String> {
    if team_build { return None; }
    foreign(own.as_deref(), &health()?)
}

#[cfg(test)]
mod tests {
    use super::foreign;
    use std::path::Path;

    fn body(root: Option<&str>) -> String {
        match root {
            Some(r) => serde_json::json!({ "ok": true, "engine": "sol", "port": 7777, "root": r }).to_string(),
            None => serde_json::json!({ "ok": true, "engine": "sol", "port": 7777 }).to_string(),
        }
    }

    #[test]
    fn a_download_with_no_install_finds_any_sol_foreign() {
        // the case seen on 24 Nov: no root yet, a team engine on the port
        assert_eq!(foreign(None, &body(Some("/Users/f/projects/sol/wt/main"))), Some("/Users/f/projects/sol/wt/main".into()));
        // an engine too old to say where it runs is still not this app's: it has nothing installed
        assert_eq!(foreign(None, &body(None)), Some(String::new()));
    }

    #[test]
    fn its_own_engine_is_its_own() {
        let d = std::env::temp_dir().join(format!("sol-other-{}", std::process::id()));
        let own = d.join("Sol");
        std::fs::create_dir_all(&own).unwrap();
        assert_eq!(foreign(Some(&own), &body(Some(own.to_str().unwrap()))), None);
        // the same folder spelled through a link or with a trailing part is the same folder
        assert_eq!(foreign(Some(&own), &body(Some(&format!("{}/.", own.display())))), None);
        // another checkout on the port is not
        assert_eq!(foreign(Some(&own), &body(Some("/Users/f/projects/sol/wt/main"))), Some("/Users/f/projects/sol/wt/main".into()));
        // installed, and an engine too old to say: left alone (it may well be this one; the app ran as before #1852)
        assert_eq!(foreign(Some(&own), &body(None)), None);
    }

    #[test]
    fn not_sol_or_no_answer_says_nothing() {
        assert_eq!(foreign(None, ""), None);
        assert_eq!(foreign(None, "<html>hello</html>"), None);
        assert_eq!(foreign(None, &serde_json::json!({ "ok": true }).to_string()), None);
        assert_eq!(foreign(Some(Path::new("/x")), "not json"), None);
    }
}
