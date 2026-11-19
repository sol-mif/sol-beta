// macOS permissions for the onboarding (onboard/permissions.ts, OneHome.tsx): three commands.
//
//   permit_state → { accessibility }: is Sol trusted for Accessibility right now (AXIsProcessTrusted, below).
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
}

#[tauri::command]
pub fn permit_state() -> PermitState {
    PermitState { accessibility: trusted() }
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
