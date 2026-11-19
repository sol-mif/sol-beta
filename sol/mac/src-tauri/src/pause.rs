// The pause signal's senses (#1597, part 1 of #1587): three things the app's own process watches, with Sol's window
// open or closed, and tells the engine the moment one turns (POST /pause { why }, engine src/pause.ts):
//   typing   the Mac went quiet: no key or mouse for PAUSE_IDLE after some (Quartz, lib.rs system_idle, the reading
//            presence's idleSeconds already uses); once per quiet, so a person away for long is one pause
//   app      another app came to the front (NSWorkspace's frontmostApplication; its process id only, never its name)
//   call     the default microphone went from in use (CALL_MIN at least, on the same device) to idle (CoreAudio
//            kAudioDevicePropertyDeviceIsRunningSomewhere); nothing of the sound or the call is read. Known limit: that
//            property is the whole device's, so on a headset that is also the speaker (AirPods), music stopping after
//            CALL_MIN reads as a call's end too; part 2 of #1587 weighs it before anything waits on it
// No Input Monitoring and no other permission: none of these reads a key or a word. Polled twice a second on a thread
// of its own (as occlusion is in lib.rs), so there is no observer to keep alive. The engine decides whether a turn is a
// pause; while its switch pause.signal is off it answers on: false, and this asks again only a minute later.
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

const TICK: Duration = Duration::from_millis(500);
/// quiet this long after some typing or a mouse move is a pause
const PAUSE_IDLE: f64 = 2.0;
/// busy again under this, so the next quiet counts
const BUSY_IDLE: f64 = 1.0;
/// the microphone in use at least this long is a call; a short dictation to Sol is not
const CALL_MIN: Duration = Duration::from_secs(20);
/// how long an engine that said off is left alone
const OFF_WAIT: Duration = Duration::from_secs(60);

pub fn start() {
    std::thread::spawn(|| {
        let mut armed = false;   // typing seen since the last quiet
        let mut front = front_pid();
        let mut mic = mic_state();   // (device, running), the default input's
        let mut mic_since = Instant::now();   // when the microphone last turned on
        let mut off_until: Option<Instant> = None;
        loop {
            std::thread::sleep(TICK);
            // a pool per tick: AppKit's autoreleased objects are freed here, not kept for the thread's (endless) life
            let why = objc2::rc::autoreleasepool(|_| {
                let mut why: Option<&'static str> = None;
                if let Some(idle) = crate::system_idle() {
                    if idle < BUSY_IDLE { armed = true; }
                    else if armed && idle >= PAUSE_IDLE { armed = false; why = Some("typing"); }
                }
                let f = front_pid();
                if f.is_some() && f != front { if front.is_some() { why = why.or(Some("app")); } front = f; }
                if let Some(m) = mic_state() {
                    match mic {
                        Some((d, true)) if d == m.0 && !m.1 && mic_since.elapsed() >= CALL_MIN => { why = why.or(Some("call")); }
                        _ => {}
                    }
                    if m.1 && mic.map_or(true, |(d, r)| d != m.0 || !r) { mic_since = Instant::now(); }
                    mic = Some(m);
                }
                why
            });
            let Some(why) = why else { continue };
            if off_until.is_some_and(|t| Instant::now() < t) { continue; }
            off_until = match tell(why) { Some(false) => Some(Instant::now() + OFF_WAIT), _ => None };
        }
    });
}

/// POST /pause to this Mac's engine; Some(on) from its answer, None when it did not answer
fn tell(why: &str) -> Option<bool> {
    let addr = format!("127.0.0.1:{}", crate::ENGINE_PORT).parse().ok()?;
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(200)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
    s.set_write_timeout(Some(Duration::from_secs(1))).ok()?;
    let body = format!("{{\"why\":\"{why}\"}}");
    let req = format!("POST /pause HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
    s.write_all(req.as_bytes()).ok()?;
    let mut out = String::new();
    s.take(4096).read_to_string(&mut out).ok()?;
    answer_on(&out)
}

/// `on` from the engine's whole answer, head and body; the body is one JSON object, read from its braces, so a chunked
/// answer reads too
fn answer_on(out: &str) -> Option<bool> {
    let body = &out[out.find("\r\n\r\n")? + 4..];
    let v: serde_json::Value = serde_json::from_str(&body[body.find('{')?..=body.rfind('}')?]).ok()?;
    v.get("on").and_then(|o| o.as_bool())
}

#[cfg(test)]
mod tests {
    use super::answer_on;
    #[test]
    fn reads_the_engines_answer() {
        assert_eq!(answer_on("HTTP/1.1 200 OK\r\nContent-Length: 27\r\n\r\n{\"on\":false,\"paused\":false}"), Some(false));
        assert_eq!(answer_on("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1a\r\n{\"on\":true,\"paused\":true}\r\n0\r\n\r\n"), Some(true));
        assert_eq!(answer_on("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"), None);
        assert_eq!(answer_on("garbage"), None);
    }
}

#[cfg(target_os = "macos")]
fn front_pid() -> Option<i32> {
    use objc2_app_kit::NSWorkspace;
    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    Some(app.processIdentifier())
}
#[cfg(not(target_os = "macos"))]
fn front_pid() -> Option<i32> { None }

/// the default input device and whether any process is using it; None when it cannot be read
#[cfg(target_os = "macos")]
fn mic_state() -> Option<(u32, bool)> {
    #[repr(C)]
    struct Address { selector: u32, scope: u32, element: u32 }
    #[link(name = "CoreAudio", kind = "framework")]
    unsafe extern "C" {
        fn AudioObjectGetPropertyData(id: u32, addr: *const Address, qual_size: u32, qual: *const std::ffi::c_void, size: *mut u32, data: *mut std::ffi::c_void) -> i32;
    }
    const fn code(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
    const SYSTEM: u32 = 1;   // kAudioObjectSystemObject
    let global = code(b"glob");   // kAudioObjectPropertyScopeGlobal
    let mut device: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let a = Address { selector: code(b"dIn "), scope: global, element: 0 };   // kAudioHardwarePropertyDefaultInputDevice
    let r = unsafe { AudioObjectGetPropertyData(SYSTEM, &a, 0, std::ptr::null(), &mut size, &mut device as *mut u32 as *mut _) };
    if r != 0 || device == 0 { return None; }
    let mut running: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let a = Address { selector: code(b"gone"), scope: global, element: 0 };   // kAudioDevicePropertyDeviceIsRunningSomewhere
    let r = unsafe { AudioObjectGetPropertyData(device, &a, 0, std::ptr::null(), &mut size, &mut running as *mut u32 as *mut _) };
    if r != 0 { return None; }
    Some((device, running != 0))
}
#[cfg(not(target_os = "macos"))]
fn mic_state() -> Option<(u32, bool)> { None }
