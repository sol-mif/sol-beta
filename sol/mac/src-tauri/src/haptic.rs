// The trackpad's tick (#1024, pieces that snap): a piece that seats gives one short haptic, as on a Mac a guide does
// when a window snaps. NSHapticFeedbackManager's default performer, pattern alignment (or level change, or generic),
// now. Only a Force Touch trackpad feels it; elsewhere it does nothing, and the face never waits on it.
#[tauri::command]
pub fn haptic(kind: Option<String>) {
    #[cfg(target_os = "macos")]
    unsafe {
        use objc2::runtime::AnyObject;
        use objc2::{class, msg_send};
        // NSHapticFeedbackPattern: generic 0, alignment 1, level change 2; NSHapticFeedbackPerformanceTime: now 1
        let pattern: isize = match kind.as_deref() { Some("level") => 2, Some("generic") => 0, _ => 1 };
        let p: *mut AnyObject = msg_send![class!(NSHapticFeedbackManager), defaultPerformer];
        if p.is_null() { return; }
        let _: () = msg_send![p, performFeedbackPattern: pattern, performanceTime: 1isize];
    }
    #[cfg(not(target_os = "macos"))]
    let _ = kind;
}
