// calendar: Home's calendar helper (#692 pass 1). Reads the person's calendars N days ahead and prints them as one
// JSON object on stdout. It only reads: nothing here can add, move or delete an event.
//
//   calendar --status        where the Mac's permission stands, without asking: {"ok":true,"status":"full|denied|..."}
//   calendar --days 7        asks once if it has never asked, then {"ok":true,"events":[...]} or {"ok":false,"denied":true,"why":...}
//
// Like the listener (sol/mac/listen/Own.swift), it first starts itself again as its own responsible process, so the
// Mac asks for "Sol calendar" and not for the bash or node above it. SOL_CAL_OWN=1 marks the copy that already is.

import EventKit
import Foundation

@_silgen_name("responsibility_spawnattrs_setdisclaim")
private func responsibility_spawnattrs_setdisclaim(_ attrs: UnsafeMutablePointer<posix_spawnattr_t?>, _ disclaim: Int32) -> Int32

func out(_ o: [String: Any]) -> Never {
    let d = (try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])) ?? Data("{\"ok\":false}".utf8)
    FileHandle.standardOutput.write(d)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(0)
}

func becomeOwn() {
    let env = ProcessInfo.processInfo.environment
    if env["SOL_CAL_OWN"] == "1" { return }
    guard let exe = Bundle.main.executablePath ?? CommandLine.arguments.first else { return }
    var attr: posix_spawnattr_t? = nil
    guard posix_spawnattr_init(&attr) == 0 else { return }
    defer { posix_spawnattr_destroy(&attr) }
    _ = responsibility_spawnattrs_setdisclaim(&attr, 1)
    var cArgs: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) } + [nil]
    var cEnv: [UnsafeMutablePointer<CChar>?] = env.filter { $0.key != "SOL_CAL_OWN" }.map { strdup("\($0.key)=\($0.value)") }
        + [strdup("SOL_CAL_OWN=1"), nil]
    defer { cArgs.forEach { free($0) }; cEnv.forEach { free($0) } }
    var pid: pid_t = 0
    if posix_spawn(&pid, exe, nil, &attr, &cArgs, &cEnv) != 0 { return }
    var status: Int32 = 0
    while waitpid(pid, &status, 0) == -1 && errno == EINTR {}
    exit((status & 0x7f) == 0 ? (status >> 8) & 0xff : 1)
}

func statusWord(_ s: EKAuthorizationStatus) -> String {
    switch s {
    case .fullAccess: return "full"
    case .writeOnly: return "write-only"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not-asked"
    default: return "full" // .authorized, before macOS 14
    }
}

let args = CommandLine.arguments
becomeOwn()

if args.contains("--status") {
    out(["ok": true, "status": statusWord(EKEventStore.authorizationStatus(for: .event))])
}

var days = 7
if let i = args.firstIndex(of: "--days"), i + 1 < args.count, let n = Int(args[i + 1]) { days = max(1, min(n, 31)) }

let store = EKEventStore()
let iso = ISO8601DateFormatter()

func read() -> Never {
    let start = Calendar.current.startOfDay(for: Date())
    let end = Calendar.current.date(byAdding: .day, value: days, to: start)!
    let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let events = store.events(matching: pred).sorted { $0.startDate < $1.startDate }.map { e -> [String: Any] in
        [
            "id": e.eventIdentifier ?? UUID().uuidString,
            "title": e.title ?? "",
            "start": iso.string(from: e.startDate),
            "end": iso.string(from: e.endDate),
            "allDay": e.isAllDay,
            "location": e.location ?? "",
            "calendar": e.calendar?.title ?? "",
        ]
    }
    out(["ok": true, "events": events])
}

switch EKEventStore.authorizationStatus(for: .event) {
case .fullAccess: read()
case .denied, .restricted:
    out(["ok": false, "denied": true, "why": "the Mac says no: System Settings › Privacy & Security › Calendars › Sol calendar"])
case .writeOnly:
    out(["ok": false, "denied": true, "why": "the Mac allows adding events only; Home needs to read: System Settings › Privacy & Security › Calendars"])
default:
    store.requestFullAccessToEvents { granted, error in
        if granted { read() }
        out(["ok": false, "denied": true, "why": error?.localizedDescription ?? "you said no; System Settings › Privacy & Security › Calendars can change it"])
    }
    dispatchMain()
}
