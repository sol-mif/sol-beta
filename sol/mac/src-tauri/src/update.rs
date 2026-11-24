// The app updates itself, shell and face together (#1824, row 4 of #1820; J1 of the shared terms,
// docs/br1-backend-sort-2026-11-22/J/CONTRACT.md). Until now the engine and the face's files moved by themselves
// (#1566, #1615) while Sol.app, with the face packed inside it, was downloaded again by hand.
//
//   the feed     sol-beta's latest release carries latest.json, Sol-mac.app.tar.gz and its .sig (release.yml). The address
//                and the public key are fixed in tauri.conf.json, compiled in; nothing the engine, the face or the feed
//                says changes them. Tauri's updater (tauri-plugin-updater) is used from Rust only: no window may call it.
//   the checks   30 s after start and every ten minutes (the engine's rhythm, ship.ts ASK_EVERY_MS): the engine is asked
//                first (POST /shell/update, engine team/shell.ts): paused, or no answer, and nothing is downloaded. A newer
//                version than this app's (never equal or older: no comparator is set) whose bundle comes from sol-beta's
//                releases is downloaded and checked: its signature by our key, naming the version the feed announces
//                (requireSignedVersion), and the version inside the bundle's Info.plist. Only then is it kept, in memory.
//   the press    the face shows "restart Sol to use it" (ShellUpdate.tsx, from the engine's team.shell word). Nothing is
//                swapped and Sol never restarts by itself. The press asks the engine again (paused, or a swap of its own
//                under way: no), keeps a copy of the app as it is (<app config dir>/previous/Sol.app), then the updater
//                swaps the bundles in one step (APFS); the engine is asked once more, and Sol restarts on its yes only
//                (a swap of its own begun meanwhile: asked again every 3 s, ten minutes at most, then left for the next
//                start). A swap that fails leaves the old app in place and no restart; the face is told why.
//   not updated  a build of the repository's own version (0.1.0: made by hand, a developer's), an app in a folder this
//                user cannot write (an /Applications owned by root: never a password prompt nobody explained).
// The cost accepted until Apple signing: macOS ties Full Disk Access to an ad-hoc signed app's own hash, so after each
// shell update it asks for it again (the face says so beside the button); an engine-only release does not. No keeper
// brings back a shell that does not start: the copy kept under previous/ is the way back by hand.
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// the only place an update's bundle may come from (CONTRACT.md §1)
pub const FROM: &str = "https://github.com/sol-mif/sol-beta/releases/download/";
/// the version the repository carries; a release stamps its own (CONTRACT.md §2)
pub const HAND_BUILT: &str = "0.1.0";
pub const FIRST_ASK: Duration = Duration::from_secs(30);
pub const ASK_EVERY: Duration = Duration::from_secs(10 * 60);
pub const FEED_TIMEOUT: Duration = Duration::from_secs(30);
pub const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// What the engine answered (team/shell.ts): pause updates, and whether Sol may restart now (no swap of its own under way).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ask { pub paused: bool, pub relaunch: bool }
/// no answer is the same as paused (the threat model's T5)
pub const NO_ANSWER: Ask = Ask { paused: true, relaunch: false };

/// The engine's whole HTTP answer, read: its JSON body's paused and relaunch, both needed as booleans; else NO_ANSWER.
pub fn answer_of(out: &str) -> Ask {
    let read = || -> Option<Ask> {
        if !out.starts_with("HTTP/1.1 200") && !out.starts_with("HTTP/1.0 200") { return None; }
        let body = &out[out.find("\r\n\r\n")? + 4..];
        let (from, to) = (body.find('{')?, body.rfind('}')?);
        if to < from { return None; }
        let v: serde_json::Value = serde_json::from_str(&body[from..=to]).ok()?;
        Some(Ask { paused: v.get("paused")?.as_bool()?, relaunch: v.get("relaunch")?.as_bool()? })
    };
    read().unwrap_or(NO_ANSWER)
}

/// The body the shell says to the engine: what its updater did (team/shell.ts's events), the version, why.
pub fn body_of(event: &str, version: Option<&str>, why: Option<&str>) -> String {
    let mut o = serde_json::Map::new();
    o.insert("event".into(), event.into());
    if let Some(v) = version { o.insert("version".into(), v.into()); }
    if let Some(w) = why { o.insert("why".into(), why_cut(w).into()); }
    serde_json::Value::Object(o).to_string()
}

/// the longest why the engine passes on (team/shell.ts WHY_MAX); a longer one (a network error naming a signed URL)
/// would make the whole body too long to be heard
pub const WHY_MAX: usize = 140;
/// A why cut to WHY_MAX characters, on a character boundary.
pub fn why_cut(why: &str) -> String { why.chars().take(WHY_MAX).collect() }

/// Whether a bundle's address is sol-beta's releases over https.
pub fn url_ok(url: &str) -> bool {
    url.strip_prefix(FROM).is_some_and(|rest| !rest.is_empty() && !rest.split('/').any(|p| p.is_empty() || p == "." || p == ".."))
}

/// CFBundleShortVersionString from an Info.plist (XML, as the bundler writes it).
pub fn plist_version(xml: &str) -> Option<String> {
    let after = &xml[xml.find("<key>CFBundleShortVersionString</key>")? + "<key>CFBundleShortVersionString</key>".len()..];
    let after = after.trim_start();
    let v = after.strip_prefix("<string>")?;
    Some(v[..v.find("</string>")?].trim().to_string())
}

/// The version inside a downloaded bundle: <x>.app/Contents/Info.plist in the tar.gz.
pub fn bundle_version(tar_gz: &[u8]) -> Option<String> {
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(tar_gz));
    for entry in archive.entries().ok()? {
        let mut entry = entry.ok()?;
        let path = entry.path().ok()?.into_owned();
        let parts: Vec<_> = path.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
        if parts.len() == 3 && parts[0].ends_with(".app") && parts[1] == "Contents" && parts[2] == "Info.plist" {
            let mut xml = String::new();
            entry.by_ref().take(1 << 20).read_to_string(&mut xml).ok()?;
            return plist_version(&xml);
        }
    }
    None
}

/// The .app this executable runs from (…/Sol.app/Contents/MacOS/face), or None outside a bundle (cargo run, tests).
pub fn app_bundle(exe: &Path) -> Option<PathBuf> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let app = contents.parent()?;
    (macos.file_name()? == "MacOS" && contents.file_name()? == "Contents" && app.extension()? == "app").then(|| app.to_path_buf())
}

/// Whether this user can swap bundles in `dir` (create and remove a file there). For the bundle itself, `owned` too: a
/// folder moved to another parent needs write access to itself, and one owned by root or another user would bring up
/// the updater's administrator prompt.
pub fn owned(path: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    std::fs::symlink_metadata(path).is_ok_and(|m| m.uid() == unsafe { libc::getuid() })
}
pub fn writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".sol-update-probe-{}", std::process::id()));
    let ok = std::fs::OpenOptions::new().write(true).create_new(true).open(&probe).is_ok();
    if ok { let _ = std::fs::remove_file(&probe); }
    ok
}

/// Whether a press may swap now.
pub fn may_apply(ask: Ask) -> Result<(), &'static str> {
    if ask.paused { return Err("paused"); }
    if !ask.relaunch { return Err("the engine is updating; try again in a moment"); }
    Ok(())
}

/// After the swap the restart asks again this often, for ten minutes at most (the engine's own swap holds a relaunch for
/// up to its minute, team/shell.ts SWAP_HOLD_MS ten)
pub const RESTART_ASK_EVERY: Duration = Duration::from_secs(3);
pub const RESTART_TRIES: usize = 200;
/// the face's words while the restart waits, and when it stops waiting (the new app is on disk either way)
pub const WAITING: &str = "the new Sol.app is in place; Sol restarts once the engine has finished updating";
pub const IN_PLACE: &str = "the new Sol.app is in place; quit Sol and open it again to use it";

/// Whether the restart may go ahead: the engine asked again (REVIEW-J1 #1: it may have started a swap of its own while
/// the press copied and unpacked, and a shell that starts then finds no engine and starts a second one). `ask` at most
/// `tries` times, `wait` between; a yes is may_apply's. Err: never a yes, so no restart.
pub fn restart_when(mut ask: impl FnMut() -> Ask, mut wait: impl FnMut(), tries: usize) -> Result<(), &'static str> {
    for i in 0..tries {
        if i > 0 { wait(); }
        if may_apply(ask()).is_ok() { return Ok(()); }
    }
    Err(IN_PLACE)
}

/// Whether this app updates itself at all: a released build (not the repository's own version), in a bundle whose folder
/// this user can write. Err says why not, in a word the face shows.
pub fn may_update(version: &str, bundle: Option<&Path>, writable: impl Fn(&Path) -> bool) -> Result<(), &'static str> {
    if version == HAND_BUILT { return Err("built by hand"); }
    let bundle = bundle.ok_or("not in a bundle")?;
    let dir = bundle.parent().ok_or("not in a bundle")?;
    if !writable(dir) || !writable(bundle) { return Err("Sol.app or its folder is not this user's to change"); }
    Ok(())
}

/// one verified bundle, waiting for the press
struct Ready { update: tauri_plugin_updater::Update, bytes: Vec<u8> }
static READY: Mutex<Option<Ready>> = Mutex::new(None);
/// the version whose bundle was refused (signature, version inside): not downloaded again every ten minutes
static REFUSED: Mutex<Option<String>> = Mutex::new(None);
static SAID_WHY: AtomicBool = AtomicBool::new(false);
/// a lock that a panic elsewhere never makes unusable
fn locked<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }
/// the version waiting for the press, if any (the face's button follows this, never the engine's word)
pub fn ready_version() -> Option<String> { locked(&READY).as_ref().map(|r| r.update.version.clone()) }

/// One POST /shell/update to the engine; NO_ANSWER when it does not answer.
fn tell(body: &str) -> Ask {
    let ask = || -> Option<String> {
        let addr = format!("127.0.0.1:{}", crate::ENGINE_PORT).parse().ok()?;
        let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok()?;
        s.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
        s.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
        let req = format!("POST /shell/update HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        s.write_all(req.as_bytes()).ok()?;
        let mut out = String::new();
        s.take(4096).read_to_string(&mut out).ok()?;
        Some(out)
    };
    ask().map(|o| answer_of(&o)).unwrap_or(NO_ANSWER)
}
fn say(event: &str, version: Option<&str>, why: Option<&str>) -> Ask {
    eprintln!("update: {event} {} {}", version.unwrap_or(""), why.unwrap_or(""));
    tell(&body_of(event, version, why))
}

fn this_bundle() -> Option<PathBuf> { std::env::current_exe().ok().and_then(|e| app_bundle(&e)) }

/// One check: ask the engine, ask the feed, download and verify a newer app, keep it for the press.
async fn check(app: &AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    // a bundle already waits: say it again (the engine keeps words in memory only), nothing downloaded twice
    let waiting = ready_version();   // the lock is let go before the engine is asked
    if let Some(v) = waiting {
        let a = say("ready", Some(&v), None);
        if a.paused { say("downloaded", Some(&v), Some("paused")); }
        return;
    }
    let own = app.package_info().version.to_string();
    match may_update(&own, this_bundle().as_deref(), |d| writable(d) && (d.extension().is_none_or(|e| e != "app") || owned(d))) {
        Err("built by hand") | Err("not in a bundle") => return,   // a developer's build: nothing said
        Err(why) => { if !SAID_WHY.swap(true, Ordering::Relaxed) { say("failed", None, Some(why)); } return }   // said once per launch
        Ok(()) => {}
    }
    if tell(&body_of("idle", None, None)).paused { return; }   // paused, or no engine: nothing is downloaded
    let updater = match app.updater_builder().timeout(FEED_TIMEOUT).build() { Ok(u) => u, Err(e) => { say("failed", None, Some(&e.to_string())); return } };
    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return,   // nothing newer
        Err(e) => { eprintln!("update: the feed: {e}"); return }   // offline, or no latest.json yet: the next check
    };
    let version = update.version.clone();
    if locked(&REFUSED).as_deref() == Some(version.as_str()) { return; }   // refused before: a newer one is tried
    if !url_ok(update.download_url.as_str()) { say("failed", Some(&version), Some("the bundle is not from sol-beta's releases")); return; }
    say("found", Some(&version), None);
    let mut update = update;
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    let bytes = match update.download(|_, _| {}, || {}).await {
        Ok(b) => b,   // its signature checked against our key, and the version it names against the feed's
        Err(e) => {
            // a signature that does not hold is refused for good; a network error is tried again at the next check
            if matches!(e, tauri_plugin_updater::Error::Minisign(_) | tauri_plugin_updater::Error::SignedVersionMismatch { .. } | tauri_plugin_updater::Error::MissingSignedVersion) { *locked(&REFUSED) = Some(version.clone()); }
            say("failed", Some(&version), Some(&e.to_string()));
            return
        }
    };
    if bundle_version(&bytes).as_deref() != Some(version.as_str()) {
        *locked(&REFUSED) = Some(version.clone());
        say("failed", Some(&version), Some("the app inside is not the version the feed announced"));
        return;
    }
    *locked(&READY) = Some(Ready { update, bytes });
    let a = say("ready", Some(&version), None);
    if a.paused { say("downloaded", Some(&version), Some("paused")); }
}

/// The version waiting for the press, for the face's button (None: no button, whatever the engine's word says).
#[tauri::command]
pub fn app_update_state() -> Option<String> { ready_version() }

/// The face's press: swap in the verified app and restart. Err says why nothing changed. Off the main thread: it asks the
/// engine, copies the app and unpacks the new one, seconds.
#[tauri::command]
pub async fn app_update_apply(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || apply(&app)).await.map_err(|e| e.to_string())?
}

fn apply(app: &AppHandle) -> Result<(), String> {
    let ready = locked(&READY).take().ok_or("no update is waiting")?;
    let version = ready.update.version.clone();
    // refused: the bundle stays waiting and the button with it, so a second press a moment later can swap
    let put_back = |why: &str, r: Ready| { *locked(&READY) = Some(r); say("ready", Some(&version), None); why.to_string() };
    if let Err(why) = may_apply(tell(&body_of("ready", Some(&version), None))) { return Err(put_back(why, ready)); }
    // the app as it is, kept as a zip (never a second app Launch Services could open sol:// links with): the way back
    // by hand if the new one does not start, since no keeper brings a shell back. No copy, no swap.
    if let (Some(bundle), Ok(dir)) = (this_bundle(), app.path().app_config_dir()) {
        let prev = dir.join("previous");
        let _ = std::fs::create_dir_all(&prev);
        let (tmp, keep) = (prev.join("Sol.app.zip.part"), prev.join("Sol.app.zip"));
        let copied = Command::new("/usr/bin/ditto").args(["-c", "-k", "--keepParent"]).arg(&bundle).arg(&tmp)
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success());
        if !copied || std::fs::rename(&tmp, &keep).is_err() {
            let _ = std::fs::remove_file(&tmp);
            return Err(put_back("could not keep a copy of this Sol.app first (is the disk full?)", ready));
        }
    }
    if let Err(e) = ready.update.install(&ready.bytes) {
        // nothing restarts. Mostly the old app is where it was; when the updater could not put it back it says where
        // it left it (its PreviousAppNotRestored), and that is the why the face shows
        say("failed", Some(&version), Some(&e.to_string()));
        return Err(why_cut(&e.to_string()));
    }
    // asked again before the restart, not only at the press: the first ask clears the word, the later ones tell every
    // face why the restart waits. No yes in ten minutes: no restart, the new app starts next time Sol is opened
    let mut asked = 0;
    let asks = || { asked += 1; if asked == 1 { tell(&body_of("idle", None, None)) } else { say("downloaded", Some(&version), Some(WAITING)) } };
    if let Err(why) = restart_when(asks, || std::thread::sleep(RESTART_ASK_EVERY), RESTART_TRIES) {
        say("downloaded", Some(&version), Some(why));
        return Err(why.to_string());
    }
    say("idle", None, None);
    let h = app.clone();
    std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(300)); h.restart(); });
    Ok(())
}

pub fn start(app: &AppHandle) {
    let h = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_ASK);
        loop {
            tauri::async_runtime::block_on(check(&h));
            std::thread::sleep(ASK_EVERY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("sol-update-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    const PLIST: &str = "<?xml version=\"1.0\"?>\n<plist version=\"1.0\"><dict>\n  <key>CFBundleName</key>\n  <string>Sol</string>\n  <key>CFBundleShortVersionString</key>\n  <string>0.20261124.900</string>\n</dict></plist>\n";
    /// a tar.gz as release.yml makes it: Sol.app at the top
    fn bundle(plist: Option<&str>) -> Vec<u8> {
        let d = tmp("bundle");
        let app = d.join("Sol.app").join("Contents");
        fs::create_dir_all(app.join("MacOS")).unwrap();
        fs::write(app.join("MacOS").join("face"), "x").unwrap();
        if let Some(p) = plist { fs::write(app.join("Info.plist"), p).unwrap(); }
        let out = d.join("b.tar.gz");
        assert!(Command::new("tar").env("COPYFILE_DISABLE", "1").arg("-czf").arg(&out).arg("-C").arg(&d).arg("Sol.app").status().unwrap().success());
        fs::read(out).unwrap()
    }

    #[test]
    fn the_engines_answer_or_paused() {
        assert_eq!(answer_of("HTTP/1.1 200 OK\r\nContent-Length: 32\r\n\r\n{\"paused\":false,\"relaunch\":true}"), Ask { paused: false, relaunch: true });
        assert_eq!(answer_of("HTTP/1.1 200 OK\r\n\r\n{\"paused\":true,\"relaunch\":true}"), Ask { paused: true, relaunch: true });
        assert_eq!(answer_of("HTTP/1.1 200 OK\r\n\r\n{\"paused\":false,\"relaunch\":false,\"why\":\"swapping\"}"), Ask { paused: false, relaunch: false });
        // an engine from before J4 (404), a body missing either, garbage: paused
        assert_eq!(answer_of("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"), NO_ANSWER);
        assert_eq!(answer_of("HTTP/1.1 200 OK\r\n\r\n{\"paused\":false}"), NO_ANSWER);
        assert_eq!(answer_of("HTTP/1.1 200 OK\r\n\r\n{\"paused\":\"no\",\"relaunch\":true}"), NO_ANSWER);
        assert_eq!(answer_of("garbage"), NO_ANSWER);
        // braces the wrong way round (anything squatting the port): no panic, paused
        assert_eq!(answer_of("HTTP/1.1 200 OK\r\n\r\n}x{"), NO_ANSWER);
    }

    #[test]
    fn the_body_says_the_event() {
        let v: serde_json::Value = serde_json::from_str(&body_of("ready", Some("0.20261124.900"), None)).unwrap();
        assert_eq!(v, serde_json::json!({"event": "ready", "version": "0.20261124.900"}));
        let v: serde_json::Value = serde_json::from_str(&body_of("failed", None, Some("a \"quoted\" why"))).unwrap();
        assert_eq!(v, serde_json::json!({"event": "failed", "why": "a \"quoted\" why"}));
        let v: serde_json::Value = serde_json::from_str(&body_of("idle", None, None)).unwrap();
        assert_eq!(v, serde_json::json!({"event": "idle"}));
        // a long why (a network error naming a signed URL) is cut, so the engine still hears the body
        let long = "é".repeat(600);
        let v: serde_json::Value = serde_json::from_str(&body_of("failed", None, Some(&long))).unwrap();
        assert_eq!(v["why"].as_str().unwrap().chars().count(), WHY_MAX);
    }

    #[test]
    fn only_sol_betas_releases_over_https() {
        assert!(url_ok("https://github.com/sol-mif/sol-beta/releases/download/dev-20261124-0900/Sol-mac.app.tar.gz"));
        assert!(!url_ok("http://github.com/sol-mif/sol-beta/releases/download/dev-20261124-0900/Sol-mac.app.tar.gz"));
        assert!(!url_ok("https://github.com/someone/sol-beta/releases/download/x/Sol-mac.app.tar.gz"));
        assert!(!url_ok("https://github.com/sol-mif/sol-beta/releases/download/../../../evil/Sol-mac.app.tar.gz"));
        assert!(!url_ok("https://github.com/sol-mif/sol-beta-x/releases/download/a/b"));
        assert!(!url_ok("https://github.com.evil.com/sol-mif/sol-beta/releases/download/a/b"));
        assert!(!url_ok(""));
    }

    #[test]
    fn the_version_inside_the_bundle() {
        assert_eq!(plist_version(PLIST), Some("0.20261124.900".into()));
        assert_eq!(plist_version("<dict><key>CFBundleName</key><string>Sol</string></dict>"), None);
        assert_eq!(bundle_version(&bundle(Some(PLIST))), Some("0.20261124.900".into()));
        assert_eq!(bundle_version(&bundle(None)), None);
        assert_eq!(bundle_version(b"not a tar.gz"), None);
    }

    #[test]
    fn the_bundle_this_app_runs_from() {
        assert_eq!(app_bundle(Path::new("/Applications/Sol.app/Contents/MacOS/face")), Some(PathBuf::from("/Applications/Sol.app")));
        assert_eq!(app_bundle(Path::new("/Users/you/repo/sol/mac/src-tauri/target/debug/face")), None);
        assert_eq!(app_bundle(Path::new("/x/Contents/MacOS/face")), None);
    }

    #[test]
    fn writable_folders_only() {
        let d = tmp("writable");
        assert!(writable(&d));
        assert!(!writable(&d.join("missing")));
        let ro = d.join("ro");
        fs::create_dir_all(&ro).unwrap();
        fs::set_permissions(&ro, std::os::unix::fs::PermissionsExt::from_mode(0o555)).unwrap();
        assert!(!writable(&ro));
        fs::set_permissions(&ro, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
    }

    #[test]
    fn owned_is_this_users() {
        let d = tmp("owned");
        assert!(owned(&d));
        assert!(!owned(Path::new("/usr/bin")));   // root's
        assert!(!owned(&d.join("missing")));
    }

    #[test]
    fn a_press_swaps_only_when_the_engine_lets_it() {
        assert_eq!(may_apply(Ask { paused: false, relaunch: true }), Ok(()));
        assert_eq!(may_apply(Ask { paused: true, relaunch: true }), Err("paused"));
        assert_eq!(may_apply(Ask { paused: false, relaunch: false }), Err("the engine is updating; try again in a moment"));
        assert_eq!(may_apply(NO_ANSWER), Err("paused"));
    }

    // REVIEW-J1 #1: the engine may start a swap of its own between the press's ask and the restart (the copy and the
    // unpacking take seconds); the restart asks again and waits for its yes, never restarting on a no or on no answer
    #[test]
    fn the_restart_waits_for_the_engines_yes() {
        let yes = Ask { paused: false, relaunch: true };
        let swapping = Ask { paused: false, relaunch: false };
        let run = |answers: Vec<Ask>, tries: usize| {
            let (mut asked, mut waited) = (0, 0);
            let mut it = answers.into_iter();
            let r = restart_when(|| { asked += 1; it.next().unwrap_or(NO_ANSWER) }, || waited += 1, tries);
            (r, asked, waited)
        };
        assert_eq!(run(vec![yes], 5), (Ok(()), 1, 0));
        assert_eq!(run(vec![swapping, NO_ANSWER, yes], 5), (Ok(()), 3, 2));
        // the engine down (mid-swap), a 404, paused: no restart, ever; the new app stays in place for the next start
        assert_eq!(run(vec![], 4), (Err(IN_PLACE), 4, 3));
        assert_eq!(run(vec![swapping; 9], 4), (Err(IN_PLACE), 4, 3));
        assert_eq!(run(vec![Ask { paused: true, relaunch: true }; 9], 2), (Err(IN_PLACE), 2, 1));
        // the face is told why it waits by the asks after the first (a body the engine passes on)
        assert!(why_cut(WAITING) == WAITING && why_cut(IN_PLACE) == IN_PLACE);
    }

    #[test]
    fn which_apps_update_themselves() {
        let app = Path::new("/Applications/Sol.app");
        assert_eq!(may_update("0.20261124.900", Some(app), |_| true), Ok(()));
        assert_eq!(may_update(HAND_BUILT, Some(app), |_| true), Err("built by hand"));
        assert_eq!(may_update("0.20261124.900", None, |_| true), Err("not in a bundle"));
        assert_eq!(may_update("0.20261124.900", Some(app), |_| false), Err("Sol.app or its folder is not this user's to change"));
        // both the folder holding the bundle and the bundle itself are asked about
        assert_eq!(may_update("0.20261124.900", Some(app), |d| d == Path::new("/Applications")), Err("Sol.app or its folder is not this user's to change"));
        assert_eq!(may_update("0.20261124.900", Some(app), |d| d == app), Err("Sol.app or its folder is not this user's to change"));
    }

    // the contract's fixed points: the feed, the key, no downgrade, https, and no window reaches the updater
    #[test]
    fn the_config_points_at_sol_beta_and_requires_a_signed_version() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let u = &conf["plugins"]["updater"];
        assert_eq!(u["endpoints"], serde_json::json!(["https://github.com/sol-mif/sol-beta/releases/latest/download/latest.json"]));
        assert_eq!(u["requireSignedVersion"], serde_json::json!(true));
        assert_ne!(u["allowDowngrades"], serde_json::json!(true));
        assert_ne!(u["dangerousInsecureTransportProtocol"], serde_json::json!(true));
        assert!(u["pubkey"].as_str().is_some_and(|k| !k.is_empty()));
        assert_eq!(conf["version"], serde_json::json!(HAND_BUILT));
        for f in ["default.json", "default-hot.json", "screens.json", "screens-hot.json"] {
            let cap = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities").join(f)).unwrap();
            assert!(!cap.contains("updater"), "{f} lets a window use the updater");
        }
        // the press is the bundled face's only (a Vite page in mutable mode is a developer's, who never updates this way)
        let hot = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities").join("default-hot.json")).unwrap();
        assert!(!hot.contains("allow-app-update-apply"));
    }
}
