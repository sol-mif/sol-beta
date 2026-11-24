// macOS permissions for the onboarding (onboard/permissions.ts, OneHome.tsx): three commands.
//
//   permit_state → { accessibility, files }: is Sol trusted for Accessibility right now (AXIsProcessTrusted, below),
//   and does it have Full Disk Access (#1803): Sol.app lists what only that switch opens (places.rs can_list), in its
//   own process, the one macOS judges; the engine is launchd > bash > node and never sees Sol's switch. Nothing copied.
//   app_relaunch: quit and open Sol again. macOS may give a running app a Full Disk Access switched on for it only once
//   it is opened again (System Settings offers "Quit & Reopen"); the move-in's card offers this when the switch is on
//   and Sol still reads off.
//   permit_open { which }: "accessibility" first asks macOS for its own prompt (AXIsProcessTrustedWithOptions), which
//   also puts this very binary in the list; then, for any, opens System Settings at the right pane.
//   permit_back: the card is done: if permit_open opened System Settings, Settings is hidden again.
//
// Why the prompt first: Sol.app is signed ad hoc, so every rebuild is a new app to macOS. The old row in the list stays
// switched on but no longer counts; the prompt adds the current binary so switching it off and on again takes.
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

/// System Settings was opened by the guide (so permit_back may hide it)
static OPENED: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
pub struct PermitState {
    pub accessibility: bool,
    pub files: bool,
}

/// the state for a home (Full Disk Access read under it; pure but for Accessibility, which is the process's)
pub fn state_at(home: Option<&std::path::Path>) -> PermitState {
    PermitState { accessibility: trusted(), files: home.filter(|h| h.is_absolute()).map(crate::places::can_list).unwrap_or(false) }
}

#[tauri::command]
pub fn permit_state() -> PermitState {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    state_at(home.as_deref())
}

#[tauri::command]
pub fn app_relaunch(app: tauri::AppHandle) {
    crate::hot::stop_vite(&app);   // a restart may skip the Exit event, and a Vite left behind would hold 1420 (hot.rs)
    app.restart();
}

#[tauri::command]
pub async fn permit_open(which: String) -> Result<(), String> {
    let pane = match which.as_str() {
        "accessibility" => "Privacy_Accessibility",
        "screen" => "Privacy_ScreenCapture",
        // Full Disk Access, for the tour's places (places.rs): no prompt exists for it, the pane only
        "files" => "Privacy_AllFiles",
        other => return Err(format!("Sol does not know the permission \"{other}\"")),
    };
    #[cfg(target_os = "macos")]
    {
        if which == "accessibility" && !trusted() {
            ask_trust();
        }
        let url = format!("x-apple.systempreferences:com.apple.preference.security?{pane}");
        let ok = std::process::Command::new("/usr/bin/open").arg(&url).status()
            .map_err(|e| format!("System Settings did not open: {e}"))?;
        if !ok.success() { return Err("System Settings did not open".into()); }
        OPENED.store(true, Ordering::SeqCst);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pane;
        Err("this needs the Mac".into())
    }
}

#[tauri::command]
pub async fn permit_back() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if OPENED.swap(false, Ordering::SeqCst) {
        use objc2_app_kit::NSRunningApplication;
        use objc2_foundation::NSString;
        let apps = NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str("com.apple.systempreferences"));
        for a in apps.iter() { a.hide(); }
    }
    Ok(())
}

// ---- Accessibility: the check and macOS's own prompt (raw FFI, no crate for these few calls) ----
/// Accessibility granted: Sol may post events into the system.
#[cfg(target_os = "macos")]
pub fn trusted() -> bool { ax::trusted() }
#[cfg(not(target_os = "macos"))]
pub fn trusted() -> bool { false }

/// Ask macOS to show its own Accessibility prompt; it also puts this very binary in the list, so a rebuilt Sol gets a
/// fresh row.
#[cfg(target_os = "macos")]
pub fn ask_trust() { ax::ask_trust() }
#[cfg(not(target_os = "macos"))]
pub fn ask_trust() {}

#[cfg(target_os = "macos")]
mod ax {
    use std::ffi::c_void;
    type Ref = *const c_void;

    // the few C functions this needs, against the system frameworks (no crate for them)
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXIsProcessTrusted() -> u8;
        fn AXIsProcessTrustedWithOptions(options: Ref) -> u8;
        static kAXTrustedCheckOptionPrompt: Ref;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFRelease(r: Ref);
        fn CFDictionaryCreate(alloc: Ref, keys: *const Ref, values: *const Ref, n: isize, kcb: Ref, vcb: Ref) -> Ref;
        static kCFBooleanTrue: Ref;
        static kCFTypeDictionaryKeyCallBacks: c_void;
        static kCFTypeDictionaryValueCallBacks: c_void;
    }

    pub fn trusted() -> bool { unsafe { AXIsProcessTrusted() != 0 } }

    /// Ask macOS to show its Accessibility prompt (it offers to open System Settings at Sol's row).
    pub fn ask_trust() {
        unsafe {
            let keys = [kAXTrustedCheckOptionPrompt];
            let vals = [kCFBooleanTrue];
            let d = CFDictionaryCreate(
                std::ptr::null(), keys.as_ptr(), vals.as_ptr(), 1,
                &kCFTypeDictionaryKeyCallBacks as *const c_void, &kCFTypeDictionaryValueCallBacks as *const c_void,
            );
            if !d.is_null() {
                AXIsProcessTrustedWithOptions(d);
                CFRelease(d);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("sol-permit-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn full_disk_access_is_sol_apps_own_answer() {
        // #1803: the engine is never Sol.app to macOS, so Sol.app answers for itself, here, in permit_state, by listing
        // what only Full Disk Access opens (places.rs can_list; places_copy made a copy of Safari's history to find out)
        let h = home("on");
        std::fs::create_dir_all(h.join("Library/Safari")).unwrap();
        assert!(state_at(Some(&h)).files);
        // macOS refusing the folder (what a process without Full Disk Access gets): off
        use std::os::unix::fs::PermissionsExt;
        let shut = home("shut");
        let safari = shut.join("Library/Safari");
        std::fs::create_dir_all(&safari).unwrap();
        std::fs::set_permissions(&safari, std::fs::Permissions::from_mode(0o000)).unwrap();
        let refused = std::fs::read_dir(&safari).is_err();   // root may list it anyway: then this case says nothing
        if refused { assert!(!state_at(Some(&shut)).files, "a folder the system refuses reads off"); }
        std::fs::set_permissions(&safari, std::fs::Permissions::from_mode(0o755)).unwrap();
        // neither folder there: off
        assert!(!state_at(Some(&home("off"))).files, "neither Safari's folder nor macOS's permissions folder lists: off");
        // no home known: off, never a guess from the working folder
        assert!(!state_at(None).files);
    }
}
