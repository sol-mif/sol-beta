// The tour's places finder, through Sol's own Full Disk Access (#1069). Home's tour runs a read-only finder
// (src/home/folders/places/find.mjs) through the engine, and the engine is launchd > bash > node: macOS judges the
// process that reads, so the engine never gets Sol.app's grant, and Safari's history and the calendar store stay
// closed to it however the person sets the switch. So Sol.app, which holds the grant, copies just those closed
// sources into a private folder, and the finder (`--from <dir>`) reads the copies. Two commands:
//
//   places_copy → { dir, safari, calendar, files, stores }: a fresh sol-places-<random> folder under the temp dir, mode 0700,
//   holding copies of the closed sources at their paths relative to the home:
//     Library/Safari/History.db (+ -wal, -shm), Library/Safari/Bookmarks.plist,
//     Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb (+ -wal, -shm),
//     Library/Calendars/Calendar.sqlitedb (+ -wal, -shm; older macOS).
//   `files` is whether ~/Library/Safari could be listed, i.e. Sol has Full Disk Access; when it could, the copy's
//   Library/Safari folder exists even if Safari kept nothing, so the finder knows Safari was read through Sol.
//   A copy that fails (permission denied, or not there) is false. Nothing else is read, and nothing is sent anywhere.
//   Other systems: all false, dir None.
//   places_copy { which: ["notes", …] } (#1071) does the same and also copies each named app store (with -wal, -shm),
//   for the store reader (places/read.mjs): "notes" Library/Group Containers/group.com.apple.notes/NoteStore.sqlite,
//   "messages" Library/Messages/chat.db, "whatsapp" Library/Group Containers/group.net.whatsapp.WhatsApp.shared/
//   ChatStorage.sqlite (and ContactsV2.sqlite beside it, for the names of chats that carry none), "calendar" the
//   calendar store as above. `stores` says, for each name asked, whether its store came. An unknown name is false.
//   places_drop { dir }: deletes that folder, but only a sol-places-* folder directly under the temp dir.
//
// Sol.app is signed with an Apple Development identity (tauri.conf.json signingIdentity), so macOS keeps its Full Disk
// Access row across rebuilds. A build signed ad hoc would be a new app each time: its old row stays on but no longer
// counts until it is switched off and on (the places screen says so when the switch "has not reached" Sol). permit_open "files" opens that pane; there is no prompt for Full Disk Access.
// the copying is called on the Mac only (and in the tests below)
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Default)]
pub struct PlacesCopy {
    pub dir: Option<String>,
    pub safari: bool,
    pub calendar: bool,
    pub files: bool,
    /// each store named in `which`: whether it was copied
    pub stores: BTreeMap<String, bool>,
}

const WA: &str = "Library/Group Containers/group.net.whatsapp.WhatsApp.shared";

const PREFIX: &str = "sol-places-";

#[tauri::command]
pub async fn places_copy(which: Option<Vec<String>>) -> Result<PlacesCopy, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("no home")?;
        copy_from(&home, which.as_deref().unwrap_or(&[]))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(PlacesCopy { stores: which.unwrap_or_default().into_iter().map(|w| (w, false)).collect(), ..Default::default() })
    }
}

#[tauri::command]
pub async fn places_drop(dir: String) -> Result<(), String> {
    let d = ours(Path::new(&dir)).ok_or_else(|| format!("Sol will not delete \"{dir}\""))?;
    std::fs::remove_dir_all(&d).map_err(|e| e.to_string())
}

/// the folder, if it is a sol-places-* folder directly under the temp dir (not a link), else None
fn ours(dir: &Path) -> Option<PathBuf> {
    let tmp = std::env::temp_dir().canonicalize().ok()?;
    let name = dir.file_name()?.to_str()?;
    if !name.starts_with(PREFIX) || name.len() <= PREFIX.len() || name.contains('/') { return None; }
    let meta = std::fs::symlink_metadata(dir).ok()?;
    if !meta.is_dir() { return None; }
    let real = dir.canonicalize().ok()?;
    (real.parent()? == tmp && real.file_name()?.to_str()? == name).then_some(real)
}

/// a fresh private folder under the temp dir: sol-places-<random>, mode 0700
fn fresh() -> Result<PathBuf, String> {
    let tmp = std::env::temp_dir();
    for _ in 0..8 {
        let d = tmp.join(format!("{PREFIX}{}", random()));
        let mut b = std::fs::DirBuilder::new();
        #[cfg(unix)]
        { use std::os::unix::fs::DirBuilderExt; b.mode(0o700); }
        match b.create(&d) {
            Ok(()) => return Ok(d),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("no fresh folder".into())
}

fn random() -> String {
    use std::io::Read;
    let mut b = [0u8; 8];
    let got = std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut b)).is_ok();
    if !got {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        b = ((t as u64) ^ ((std::process::id() as u64) << 32)).to_le_bytes();
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// one file copied to the same place under `to`; false when it is not there or macOS keeps it closed
fn copy_one(home: &Path, to: &Path, rel: &str) -> bool {
    let src = home.join(rel);
    let dst = to.join(rel);
    if !std::fs::metadata(&src).map(|m| m.is_file()).unwrap_or(false) { return false; }   // nothing there: no empty folder made
    if let Some(p) = dst.parent() { if std::fs::create_dir_all(p).is_err() { return false; } }
    std::fs::copy(&src, &dst).is_ok()
}

/// a sqlite store and its -wal and -shm (when present); true when the store itself came
fn copy_db(home: &Path, to: &Path, rel: &str) -> bool {
    let ok = copy_one(home, to, rel);
    if ok { for side in ["-wal", "-shm"] { copy_one(home, to, &format!("{rel}{side}")); } }
    ok
}

/// Full Disk Access as macOS shows it to Sol: ~/Library/Safari can be listed. A home with no Safari folder at all
/// asks macOS's own permissions folder, which only Full Disk Access opens.
pub(crate) fn can_list(home: &Path) -> bool {
    match std::fs::read_dir(home.join("Library/Safari")) {
        Ok(_) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => std::fs::read_dir(home.join("Library/Application Support/com.apple.TCC")).is_ok(),
        Err(_) => false,
    }
}

/// one app store, by the name the store reader uses; false for a name Sol does not know
fn copy_store(home: &Path, to: &Path, name: &str, calendar: bool) -> bool {
    match name {
        "notes" => copy_db(home, to, "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite"),
        "messages" => copy_db(home, to, "Library/Messages/chat.db"),
        "whatsapp" => {
            let ok = copy_db(home, to, &format!("{WA}/ChatStorage.sqlite"));
            if ok { copy_db(home, to, &format!("{WA}/ContactsV2.sqlite")); }
            ok
        }
        "calendar" => calendar,
        _ => false,
    }
}

fn copy_from(home: &Path, which: &[String]) -> Result<PlacesCopy, String> {
    let dir = fresh()?;
    let files = can_list(home);
    if files { let _ = std::fs::create_dir_all(dir.join("Library/Safari")); }
    let history = copy_db(home, &dir, "Library/Safari/History.db");
    let marks = copy_one(home, &dir, "Library/Safari/Bookmarks.plist");
    let group = copy_db(home, &dir, "Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb");
    let older = home.join("Library/Calendars/Calendar.sqlitedb").exists() && copy_db(home, &dir, "Library/Calendars/Calendar.sqlitedb");
    let calendar = group || older;
    let stores = which.iter().map(|w| (w.clone(), copy_store(home, &dir, w, calendar))).collect();
    Ok(PlacesCopy { dir: Some(dir.to_string_lossy().into_owned()), safari: history || marks, calendar, files, stores })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drop_refuses_what_is_not_ours() {
        assert!(ours(Path::new("/")).is_none());
        assert!(ours(&std::env::temp_dir()).is_none());
        assert!(ours(&std::env::temp_dir().join("sol-places-")).is_none());
        assert!(ours(&std::env::temp_dir().join("other-thing")).is_none());
        let d = fresh().unwrap();
        let inner = d.join("sol-places-inner");
        std::fs::create_dir(&inner).unwrap();
        assert!(ours(&inner).is_none(), "not directly under the temp dir");
        assert!(ours(&d.join("..").join(d.file_name().unwrap())).is_some());
        assert!(ours(&d).is_some());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn copies_keep_their_paths() {
        let home = fresh().unwrap();
        let safari = home.join("Library/Safari");
        std::fs::create_dir_all(&safari).unwrap();
        std::fs::write(safari.join("History.db"), "h").unwrap();
        std::fs::write(safari.join("History.db-wal"), "w").unwrap();
        let c = copy_from(&home, &[]).unwrap();
        let dir = PathBuf::from(c.dir.unwrap());
        assert!(c.files && c.safari && !c.calendar && c.stores.is_empty());
        assert_eq!(std::fs::read_to_string(dir.join("Library/Safari/History.db-wal")).unwrap(), "w");
        assert!(!dir.join("Library/Safari/History.db-shm").exists());
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700); }
        std::fs::remove_dir_all(&dir).unwrap();
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn named_stores_come_with_their_sides() {
        let home = fresh().unwrap();
        let notes = home.join("Library/Group Containers/group.com.apple.notes");
        std::fs::create_dir_all(&notes).unwrap();
        std::fs::write(notes.join("NoteStore.sqlite"), "n").unwrap();
        std::fs::write(notes.join("NoteStore.sqlite-shm"), "s").unwrap();
        let wa = home.join(WA);
        std::fs::create_dir_all(&wa).unwrap();
        std::fs::write(wa.join("ChatStorage.sqlite"), "c").unwrap();
        std::fs::write(wa.join("ContactsV2.sqlite"), "k").unwrap();
        std::fs::write(wa.join("ChatStorage.sqlite-wal"), "w").unwrap();
        let which: Vec<String> = ["notes", "whatsapp", "messages", "calendar", "photos"].iter().map(|s| s.to_string()).collect();
        let c = copy_from(&home, &which).unwrap();
        let dir = PathBuf::from(c.dir.unwrap());
        assert_eq!(c.stores.get("notes"), Some(&true));
        assert_eq!(c.stores.get("whatsapp"), Some(&true));
        assert_eq!(c.stores.get("messages"), Some(&false));
        assert_eq!(c.stores.get("calendar"), Some(&false));
        assert_eq!(c.stores.get("photos"), Some(&false), "a name Sol does not know copies nothing");
        assert_eq!(std::fs::read_to_string(dir.join("Library/Group Containers/group.com.apple.notes/NoteStore.sqlite-shm")).unwrap(), "s");
        assert_eq!(std::fs::read_to_string(dir.join(WA).join("ChatStorage.sqlite-wal")).unwrap(), "w");
        assert_eq!(std::fs::read_to_string(dir.join(WA).join("ContactsV2.sqlite")).unwrap(), "k");
        assert!(!dir.join("Library/Messages").exists());
        std::fs::remove_dir_all(&dir).unwrap();
        std::fs::remove_dir_all(&home).unwrap();
    }
}
