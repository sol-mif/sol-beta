// The pause signal's senses (#1597, part 1 of #1587): three things the app's own process watches, with Sol's window
// open or closed, and tells the engine the moment one turns (POST /pause { why }, engine src/pause.ts):
//   typing   the Mac went quiet: no key or mouse for PAUSE_IDLE after some (Quartz, lib.rs system_idle, the reading
//            presence's idleSeconds already uses); once per quiet, so a person away for long is one pause
//   app      another app came to the front (NSWorkspace's frontmostApplication; its process id only, never its name)
//   call     the default microphone went from in use (CALL_MIN at least, on the same device) to idle (CoreAudio
//            kAudioProcessPropertyIsRunningInput, macOS 14+); nothing of the sound or the call is read. Only input
//            counts: a headset that is also the speaker (AirPods) runs for music too (#1640). Where input cannot be told
//            per process and the input device also plays sound, no call is sensed
// No Input Monitoring and no other permission: none of these reads a key or a word. Polled twice a second on a thread
// of its own (as occlusion is in lib.rs), so there is no observer to keep alive. Nothing is read while the engine's
// switch pause.signal is off (#1640): the thread asks the engine once a minute (a POST /pause with no why, which
// senses nothing) and only watches once it answers on: true. The engine decides whether a turn is a pause.
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
/// how long an engine that said off is left alone, and how often a watching thread asks again whether it is still on
const OFF_WAIT: Duration = Duration::from_secs(60);
/// how soon an engine that did not answer (not started yet) is asked again
const DOWN_WAIT: Duration = Duration::from_secs(5);

pub fn start() {
    std::thread::spawn(|| {
        let mut on = false;   // the engine's switch, as last heard; off, nothing below is read
        let mut ask_at = Instant::now();   // when to ask the engine again
        let mut armed = false;   // typing seen since the last quiet
        let mut front: Option<i32> = None;
        let mut mic: Option<(u32, bool)> = None;   // (device, input running), the default input's
        let mut mic_since = Instant::now();   // when the microphone last turned on
        loop {
            std::thread::sleep(TICK);
            if Instant::now() >= ask_at {
                let was = on;
                let answer = tell(None);
                on = answer == Some(true);
                ask_at = Instant::now() + ask_again(answer);
                if on && !was {
                    // just turned on: start from what is now, so nothing before it reads as a turn
                    armed = false;
                    front = objc2::rc::autoreleasepool(|_| front_pid());
                    mic = mic_state();
                    mic_since = Instant::now();
                }
            }
            if !on { continue; }
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
            // the answer is the switch as it stands: off now (or no engine), stop reading until the next ask
            let answer = tell(Some(why));
            if answer != Some(true) { on = false; ask_at = Instant::now() + ask_again(answer); }
        }
    });
}

/// how long until the engine is asked again: it answered (on, to hear it turn off; or off), a minute; no answer, soon
fn ask_again(answer: Option<bool>) -> Duration { if answer.is_some() { OFF_WAIT } else { DOWN_WAIT } }

/// the body of a POST /pause: a sense's why, or none, which only asks whether the switch is on
fn body(why: Option<&str>) -> String {
    match why { Some(w) => format!("{{\"why\":\"{w}\"}}"), None => "{}".to_string() }
}

/// POST /pause to this Mac's engine; Some(on) from its answer, None when it did not answer
fn tell(why: Option<&str>) -> Option<bool> {
    let addr = format!("127.0.0.1:{}", crate::ENGINE_PORT).parse().ok()?;
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(200)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
    s.set_write_timeout(Some(Duration::from_secs(1))).ok()?;
    let body = body(why);
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
    use super::{answer_on, ask_again, body, DOWN_WAIT, OFF_WAIT};
    #[test]
    fn reads_the_engines_answer() {
        assert_eq!(answer_on("HTTP/1.1 200 OK\r\nContent-Length: 27\r\n\r\n{\"on\":false,\"paused\":false}"), Some(false));
        assert_eq!(answer_on("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1a\r\n{\"on\":true,\"paused\":true}\r\n0\r\n\r\n"), Some(true));
        assert_eq!(answer_on("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"), None);
        assert_eq!(answer_on("garbage"), None);
    }
    #[test]
    fn asks_without_sensing_and_waits_on_off() {
        assert_eq!(body(None), "{}");   // no why: the engine senses nothing (pause.ts sensed) and only answers on
        assert_eq!(body(Some("call")), "{\"why\":\"call\"}");
        assert_eq!(ask_again(Some(false)), OFF_WAIT);
        assert_eq!(ask_again(Some(true)), OFF_WAIT);
        assert_eq!(ask_again(None), DOWN_WAIT);
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

/// the default input device and whether any process is recording (input only: a headset's music is not a call, #1640);
/// None when it cannot be read. Input is told per process (CoreAudio's process objects, macOS 14+); on an older Mac the
/// device-wide "running somewhere" stands in, but only for an input device that plays no sound
#[cfg(target_os = "macos")]
fn mic_state() -> Option<(u32, bool)> {
    #[repr(C)]
    struct Address { selector: u32, scope: u32, element: u32 }
    #[link(name = "CoreAudio", kind = "framework")]
    unsafe extern "C" {
        fn AudioObjectGetPropertyDataSize(id: u32, addr: *const Address, qual_size: u32, qual: *const std::ffi::c_void, size: *mut u32) -> i32;
        fn AudioObjectGetPropertyData(id: u32, addr: *const Address, qual_size: u32, qual: *const std::ffi::c_void, size: *mut u32, data: *mut std::ffi::c_void) -> i32;
    }
    const fn code(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
    const SYSTEM: u32 = 1;   // kAudioObjectSystemObject
    let global = code(b"glob");   // kAudioObjectPropertyScopeGlobal
    let get_u32 = |id: u32, selector: u32, scope: u32| -> Option<u32> {
        let (mut v, mut size) = (0u32, std::mem::size_of::<u32>() as u32);
        let a = Address { selector, scope, element: 0 };
        let r = unsafe { AudioObjectGetPropertyData(id, &a, 0, std::ptr::null(), &mut size, &mut v as *mut u32 as *mut _) };
        (r == 0).then_some(v)
    };
    let device = get_u32(SYSTEM, code(b"dIn "), global).filter(|&d| d != 0)?;   // kAudioHardwarePropertyDefaultInputDevice
    // every process CoreAudio knows, and whether any is taking input (kAudioHardwarePropertyProcessObjectList,
    // kAudioProcessPropertyIsRunningInput)
    let list = Address { selector: code(b"prs#"), scope: global, element: 0 };
    let mut size = 0u32;
    if unsafe { AudioObjectGetPropertyDataSize(SYSTEM, &list, 0, std::ptr::null(), &mut size) } == 0 && size > 0 {
        let mut ids = vec![0u32; size as usize / std::mem::size_of::<u32>()];
        if unsafe { AudioObjectGetPropertyData(SYSTEM, &list, 0, std::ptr::null(), &mut size, ids.as_mut_ptr() as *mut _) } == 0 {
            ids.truncate(size as usize / std::mem::size_of::<u32>());
            return Some((device, ids.iter().any(|&p| get_u32(p, code(b"piri"), global).is_some_and(|v| v != 0))));
        }
    }
    // older Mac: the whole device's state, which a headset's playback also turns on; an input device with output
    // streams (kAudioDevicePropertyStreams, output scope) cannot be told apart, so no call is sensed on it
    let streams = Address { selector: code(b"stm#"), scope: code(b"outp"), element: 0 };
    let mut size = 0u32;
    if unsafe { AudioObjectGetPropertyDataSize(device, &streams, 0, std::ptr::null(), &mut size) } != 0 || size > 0 { return None; }
    let running = get_u32(device, code(b"gone"), global)?;   // kAudioDevicePropertyDeviceIsRunningSomewhere
    Some((device, running != 0))
}
#[cfg(not(target_os = "macos"))]
fn mic_state() -> Option<(u32, bool)> { None }
