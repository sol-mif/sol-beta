// Our own machines as CI runners (#638): which second-machine check runs (src/team/runners.ts), the workflow that asks
// it (.github/workflows/runners.yml), and sol/runner, which registers a machine. The decision with and without a
// runner online; the workflow by its text; the script on a dry run and its refusals, with gh a stand-in and the
// runner's folder and units in a temp folder, so nothing here registers, downloads or starts anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { devOnly, ROOT } from "./dev-copy.ts";
// sol/runner sets up a Linux machine and says no to any other before it does a thing (#1258)
const linuxOnly = (): string | false => devOnly("sol/runner") || (platform() !== "linux" && "sol/runner sets up a Linux machine; this one is not");
import { plan, checksOf, onlineFor, type Runner } from "../src/team/runners.ts";

const legion = (status: string): Runner => ({ name: "legion", status, labels: ["self-hosted", "Linux", "X64", "sol", "legion"].map((name) => ({ name })) });
const nucbox: Runner = { name: "nucbox", status: "online", labels: ["self-hosted", "Linux", "X64", "sol", "nucbox"].map((name) => ({ name })) };
const winbox: Runner = { name: "legion-win", status: "online", labels: ["self-hosted", "Windows", "X64", "sol", "legion-win"].map((name) => ({ name })) };
const by = (p: ReturnType<typeof plan>) => Object.fromEntries(p.map((x) => [x.id, x.run]));

test("the Legion online: the Linux check runs on every push and on the daily run; the NucBox is never taken for it", () => {
  for (const ev of ["push", "schedule", "workflow_dispatch"]) {
    assert.deepEqual(by(plan(ev, [nucbox, legion("online")], checksOf())), { linux: true, windows: false }, ev);
  }
  assert.deepEqual(onlineFor([nucbox, legion("online")], checksOf()[0].labels), ["legion"]);
  assert.deepEqual(by(plan("push", [nucbox], checksOf())), { linux: false, windows: false }, "the NucBox wears no legion label");
  assert.match(plan("push", [legion("online")], checksOf())[0].why, /^linux: runs on legion/);
});

test("no Legion online: a push leaves it to the daily run, the daily run says so and skips; unseen runners run nothing", () => {
  const off = [nucbox, legion("offline")];
  const push = plan("push", off, checksOf());
  assert.deepEqual(by(push), { linux: false, windows: false });
  assert.match(push[0].why, /the daily run checks it$/);
  const daily = plan("schedule", off, checksOf());
  assert.deepEqual(by(daily), { linux: false, windows: false });
  assert.match(daily[0].why, /skipped today$/);
  const unseen = plan("push", null, checksOf());
  assert.deepEqual(by(unseen), { linux: false, windows: false });
  assert.match(unseen[0].why, /SOL_RUNNERS_TOKEN/);
});

test("Windows: any of our runners on Windows; the second Linux machine renamed by the variable; labels in any case", () => {
  assert.deepEqual(by(plan("push", [winbox], checksOf())), { linux: false, windows: true });
  const zeus: Runner = { name: "zeus", status: "online", labels: ["SELF-HOSTED", "linux", "SOL", "Zeus"].map((name) => ({ name })) };
  assert.deepEqual(by(plan("push", [zeus], checksOf("zeus"))), { linux: true, windows: false });
  assert.deepEqual(checksOf("  ")[0].labels.at(-1), "legion", "an empty variable is the default");
});

test("runners.yml: every push to main and a daily run, sol-dev only, no PR trigger, the two checks gated on the first job", { skip: devOnly(".github/workflows/runners.yml") }, () => {
  const y = readFileSync(join(ROOT, ".github", "workflows", "runners.yml"), "utf8");
  assert.match(y, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}schedule:\n {4}- cron: "[^"]+"/m);
  assert.doesNotMatch(y, /ubuntu-latest/, "no job on GitHub's machines: the first one on any of our Linux machines (#920)");
  assert.match(y, /if: endsWith\(github\.repository, '\/sol-dev'\)\n {4}runs-on: \[self-hosted, sol, Linux\]/);
  assert.match(y, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(y, /^ +pull_request(_target)?:/m, "a self-hosted runner never takes a PR's event");
  assert.match(y, /if: endsWith\(github\.repository, '\/sol-dev'\)/, "never sol-beta");
  // its one file by the API into the job's temp folder, never a checkout of the machine's shared working copy (#950)
  assert.match(y, /run: \|\r?\n {10}gh api "repos\/\$REPO\/contents\/sol\/engine\/src\/team\/runners\.ts\?ref=\$SHA" -H "Accept: application\/vnd\.github\.raw" > "\$RUNNER_TEMP\/runners\.ts"/);
  assert.match(y, /run: node "\$RUNNER_TEMP\/runners\.ts"/);
  assert.doesNotMatch(y.split("\n  linux:")[0], /actions\/checkout/, "the first job checks nothing out");
  assert.match(y, /GH_TOKEN: \$\{\{ secrets\.SOL_RUNNERS_TOKEN \}\}/);
  assert.match(y, /needs: online\n {4}if: needs\.online\.outputs\.linux == 'true'\n {4}runs-on: \[self-hosted, sol, Linux, "\$\{\{ vars\.SECOND_RUNNER \|\| 'legion' \}\}"\]/);
  assert.match(y, /needs: online\n {4}if: needs\.online\.outputs\.windows == 'true'\n {4}runs-on: \[self-hosted, sol, Windows\]/);
  assert.doesNotMatch(y, /git config --global/, "a machine's own git config is never written");
  assert.doesNotMatch(y.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"), /nucbox/i, "the NucBox's runner is not named by any job");
  // what the workflow names as outputs is what runners.ts writes
  for (const c of checksOf()) assert.match(y, new RegExp(`${c.id}: \\$\\{\\{ steps\\.plan\\.outputs\\.${c.id} \\}\\}`));
});

test("runners.ts in a run: with no token it writes false for each check and never fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-runners-"));
  const out = join(dir, "out");
  writeFileSync(out, "");
  const r = spawnSync(process.execPath, [join(import.meta.dirname, "..", "src", "team", "runners.ts")], {
    encoding: "utf8", env: { PATH: process.env.PATH, EVENT: "push", REPO: "sol-mif/sol-test", GH_TOKEN: "", GITHUB_OUTPUT: out },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(out, "utf8"), "linux=false\nwindows=false\n");
  assert.match(r.stdout, /SOL_RUNNERS_TOKEN/);
});

// sol/runner with stand-ins: gh (the repository, the runner's latest release and its notes with the SHA-256, the tokens),
// curl (a small package of our own, whose SHA-256 the notes give), systemctl (what is running, and whether the unit
// starts: STUB/fail) and the package's config.sh (registering writes .runner; remove says so in the log). Every call is
// logged in STUB/log, so nothing here registers, downloads or starts anything
function sandbox() {
  const top = mkdtempSync(join(tmpdir(), "sol-runner-"));
  const bin = join(top, "bin"); mkdirSync(bin);
  const stub = join(top, "stub"); mkdirSync(stub);
  // the package: config.sh and run.sh at its top, as GitHub's
  const pk = join(top, "pkg"); mkdirSync(join(pk, "bin"), { recursive: true });
  writeFileSync(join(pk, "config.sh"), `#!/usr/bin/env bash
echo "config.sh $*" >> "${stub}/log"
case "$1" in remove) [ -e "${stub}/no-remove" ] && exit 1; rm -f .runner ;; *) echo '{"agentName":"x"}' > .runner ;; esac
`);
  writeFileSync(join(pk, "run.sh"), "#!/usr/bin/env bash\n");
  writeFileSync(join(pk, "bin", "Runner.Listener"), "");
  chmodSync(join(pk, "config.sh"), 0o755); chmodSync(join(pk, "run.sh"), 0o755);
  const tgz = join(top, "runner.tar.gz");
  execFileSync("tar", ["czf", tgz, "-C", pk, "."]);
  const sum = execFileSync("sha256sum", [tgz], { encoding: "utf8" }).split(" ")[0];
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash
echo "gh $*" >> "${stub}/log"
case "$*" in
  *"releases/latest -q .tag_name"*) echo v2.330.0 ;;
  *"releases/latest -q .body"*) echo "<!-- BEGIN SHA linux-x64 -->${sum}<!-- END SHA linux-x64 --> <!-- BEGIN SHA linux-arm64 -->${sum}<!-- END SHA linux-arm64 -->" ;;
  *registration-token*) [ -e "${stub}/no-token" ] && { echo "gh: asked for a token" >&2; exit 1; }; echo REGTOKEN ;;
  *remove-token*) echo RMTOKEN ;;
  *) exit 1 ;;
esac
`);
  writeFileSync(join(bin, "curl"), `#!/usr/bin/env bash
while [ $# -gt 0 ]; do [ "$1" = -o ] && { cp "${tgz}" "$2"; exit 0; }; shift; done; exit 1
`);
  writeFileSync(join(bin, "systemctl"), `#!/usr/bin/env bash
echo "systemctl $*" >> "${stub}/log"
scope=system; [ "$1" = --user ] && scope=user
case "$*" in
  *list-units*) cat "${stub}/active-$scope" 2>/dev/null ;;
  *" show "*) for a in "$@"; do :; done; cat "${stub}/show-$a" 2>/dev/null ;;
  *" enable "*) [ -e "${stub}/fail" ] && { echo "Failed to start sol-runner.service" >&2; exit 1; } ;;
esac
exit 0
`);
  for (const b of ["gh", "curl", "systemctl"]) chmodSync(join(bin, b), 0o755);
  const dir = join(top, "actions-runner"), units = join(top, "units");
  const run = (...args: string[]) => spawnSync("bash", [join(ROOT, "sol", "runner"), ...args], {
    encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SOL_RUNNER_DIR: dir, SOL_RUNNER_UNITS: units },
  });
  const log = () => (existsSync(join(stub, "log")) ? readFileSync(join(stub, "log"), "utf8") : "");
  return { top, dir, units, stub, run, log, sum };
}

test("sol/runner install --dry-run: says each step, the package checked by its SHA-256; writes nothing", { skip: linuxOnly() }, () => {
  const s = sandbox();
  const r = s.run("install", "legion", "--dry-run", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run: nothing is written, registered or started/);
  assert.match(r.stdout, /would download https:\/\/github\.com\/actions\/runner\/releases\/download\/v2\.330\.0\/actions-runner-linux-(x64|arm64)-2\.330\.0\.tar\.gz/);
  assert.match(r.stdout, new RegExp(`checked against SHA-256 ${s.sum}`));
  assert.match(r.stdout, /register it with sol-mif\/sol-test as 'legion', labels sol,legion/);
  assert.match(r.stdout, /sol-runner\.service and enable it/);
  assert.equal(existsSync(s.dir), false, "no runner folder");
  assert.equal(existsSync(s.units), false, "no unit");
});

test("sol/runner refuses: a runner registered already, the unit there already, a bad name; a runner there is left as it is", { skip: linuxOnly() }, () => {
  const s = sandbox();
  mkdirSync(s.dir, { recursive: true });
  writeFileSync(join(s.dir, ".runner"), '{"agentName":"nucbox"}');
  let r = s.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a runner is registered in .* already; it is left as it is/);
  assert.deepEqual(readdirSync(s.dir), [".runner"], "nothing added beside it");
  assert.equal(readFileSync(join(s.dir, ".runner"), "utf8"), '{"agentName":"nucbox"}');

  const t = sandbox();
  mkdirSync(t.units, { recursive: true });
  writeFileSync(join(t.units, "sol-runner.service"), "[Unit]\n");
  r = t.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the unit sol-runner is here already/);
  assert.equal(existsSync(t.dir), false);

  r = t.run("install", "Legion 7", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 2);
  r = t.run("install", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /a name of lower-case letters/);
});

test("sol/runner refuses a runner running from its folder under any name, user or system, or set up by GitHub's svc.sh; before writing anything (#639)", { skip: linuxOnly() }, () => {
  // a user unit of another name runs the runner from the folder
  const s = sandbox();
  writeFileSync(join(s.stub, "active-user"), "dbus.service loaded active running D-Bus\nmy-ci.service loaded active running a runner\n");
  writeFileSync(join(s.stub, "show-my-ci.service"), `ExecStart={ path=${s.dir}/run.sh ; argv[]=${s.dir}/run.sh ; }\nWorkingDirectory=${s.dir}\n`);
  writeFileSync(join(s.stub, "show-dbus.service"), "ExecStart={ path=/usr/bin/dbus-broker ; }\nWorkingDirectory=/\n");
  let r = s.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /the unit my-ci\.service is running a runner from .* already; it is left as it is/);
  assert.equal(existsSync(s.dir), false, "nothing written");
  assert.equal(existsSync(s.units), false);
  assert.doesNotMatch(s.log(), /registration-token|config\.sh/, "nothing registered");

  // a system unit, as GitHub's svc.sh installs it, named its own way
  const t = sandbox();
  writeFileSync(join(t.stub, "active-system"), "actions.runner.sol-mif-sol-dev.nucbox.service loaded active running GitHub Actions Runner\n");
  writeFileSync(join(t.stub, "show-actions.runner.sol-mif-sol-dev.nucbox.service"), `ExecStart={ path=${t.dir}/runsvc.sh ; }\nWorkingDirectory=${t.dir}\n`);
  r = t.run("install", "legion", "--dry-run", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the system unit actions\.runner\.sol-mif-sol-dev\.nucbox\.service is running a runner from/);

  // a unit running from a folder beside it (actions-runner2) is not this one: the dry run goes on
  const u = sandbox();
  writeFileSync(join(u.stub, "active-user"), "other.service loaded active running other\n");
  writeFileSync(join(u.stub, "show-other.service"), `ExecStart={ path=${u.dir}2/run.sh ; }\nWorkingDirectory=${u.dir}2\n`);
  r = u.run("install", "legion", "--dry-run", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 0, r.stderr);

  // the folder holds svc.sh's .service, no .runner
  const v = sandbox();
  mkdirSync(v.dir, { recursive: true });
  writeFileSync(join(v.dir, ".service"), "actions.runner.sol-mif-sol-dev.nucbox.service");
  r = v.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a runner service \(actions\.runner\.sol-mif-sol-dev\.nucbox\.service\) is set up for .* already/);
  assert.deepEqual(readdirSync(v.dir), [".service"], "nothing added beside it");
});

test("sol/runner install: registered, the unit written and started; a unit that will not start unregisters it and takes everything back (#639)", { skip: linuxOnly() }, () => {
  const s = sandbox();
  let r = s.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /'legion' is registered with sol-mif\/sol-test \(labels sol,legion\) and running as sol-runner/);
  assert.ok(existsSync(join(s.dir, ".runner")) && existsSync(join(s.dir, "run.sh")));
  assert.match(readFileSync(join(s.units, "sol-runner.service"), "utf8"), new RegExp(`^ExecStart=${s.dir}/run\\.sh$`, "m"));
  assert.match(s.log(), /config\.sh --unattended --url https:\/\/github\.com\/sol-mif\/sol-test --token REGTOKEN --name legion --labels sol,legion/);

  // the unit will not start: unregistered, the unit and the folder it made gone, and said
  const f = sandbox();
  writeFileSync(join(f.stub, "fail"), "");
  r = f.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the unit sol-runner did not start; so 'legion' was unregistered from sol-mif\/sol-test and what was unpacked removed: nothing is left, run it again/);
  assert.match(f.log(), /gh api -X POST repos\/sol-mif\/sol-test\/actions\/runners\/remove-token/);
  assert.match(f.log(), /config\.sh remove --token RMTOKEN/);
  assert.equal(existsSync(f.dir), false, "the folder it made is gone");
  assert.equal(existsSync(join(f.units, "sol-runner.service")), false, "the unit file is gone");
  // so the same command runs again once the cause is fixed
  execFileSync("rm", [join(f.stub, "fail")]);
  r = f.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 0, r.stderr);

  // a folder that was there before: only what this run unpacked and registered goes; GitHub would not unregister: said
  const g = sandbox();
  mkdirSync(join(g.dir, "_diag"), { recursive: true });
  writeFileSync(join(g.dir, "notes.txt"), "mine\n");
  writeFileSync(join(g.dir, "_diag", "old.log"), "an earlier run's log\n");
  writeFileSync(join(g.stub, "fail"), "");
  writeFileSync(join(g.stub, "no-remove"), "");
  r = g.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /GitHub would not unregister 'legion': remove it in sol-mif\/sol-test's Settings, Actions, Runners/);
  assert.deepEqual(readdirSync(g.dir).sort(), ["_diag", "notes.txt"], "what was there stays; what was unpacked and registered is gone");
  assert.equal(readFileSync(join(g.dir, "_diag", "old.log"), "utf8"), "an earlier run's log\n", "a folder registering also writes, there before, is kept");
  assert.deepEqual(readdirSync(g.top).filter((e) => e.includes(".unpack.")), [], "the folder it unpacked in is gone");

  // a folder that already holds an unrelated file under a name the package brings (bin/): refused before anything is
  // moved in or registered, and what was there is untouched (#639, NEW-1)
  const k = sandbox();
  mkdirSync(join(k.dir, "bin"), { recursive: true });
  writeFileSync(join(k.dir, "bin", "mine.sh"), "echo mine\n");
  writeFileSync(join(k.dir, "notes.txt"), "mine\n");
  r = k.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds bin already, which the runner brings; nothing was moved in, what is there is left as it is/);
  assert.deepEqual(readdirSync(k.dir).sort(), ["bin", "notes.txt"]);
  assert.deepEqual(readdirSync(join(k.dir, "bin")), ["mine.sh"]);
  assert.equal(readFileSync(join(k.dir, "bin", "mine.sh"), "utf8"), "echo mine\n");
  assert.doesNotMatch(k.log(), /registration-token|config\.sh/, "nothing registered");
  assert.deepEqual(readdirSync(k.top).filter((e) => e.includes(".unpack.")), [], "the folder it unpacked in is gone");

  // registration refused: nothing to unregister, what was unpacked is removed
  const h = sandbox();
  writeFileSync(join(h.stub, "no-token"), "");
  r = h.run("install", "legion", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /GitHub gave no registration token .* what was unpacked is removed/);
  assert.equal(existsSync(h.dir), false);
});

test("sol/runner install --slot: one more runner on the same machine, its own name, folder and unit (#920)", { skip: linuxOnly() }, () => {
  const s = sandbox();
  // the first runner's unit is there: a second slot is not refused by it, and never touches it
  mkdirSync(s.units, { recursive: true });
  writeFileSync(join(s.units, "sol-runner.service"), "[Unit]\n");
  let r = s.run("install", "legion", "--slot", "2", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /'legion-2' is registered with sol-mif\/sol-test \(labels sol,legion-2\) and running as sol-runner-2/);
  assert.match(readFileSync(join(s.units, "sol-runner-2.service"), "utf8"), new RegExp(`^ExecStart=${s.dir}/run\\.sh$`, "m"));
  assert.equal(readFileSync(join(s.units, "sol-runner.service"), "utf8"), "[Unit]\n", "the first runner's unit is left as it is");
  assert.match(s.log(), /config\.sh --unattended .* --name legion-2 --labels sol,legion-2/);
  assert.match(s.log(), /systemctl --user enable -q --now sol-runner-2/);
  // the same slot again: its own unit is there
  r = s.run("install", "legion", "--slot", "2", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a runner is registered in .* already|the unit sol-runner-2 is here already/);
  // without SOL_RUNNER_DIR the folder is ~/actions-runner-N: said by the dry run
  const d = sandbox();
  const dry = spawnSync("bash", [join(ROOT, "sol", "runner"), "install", "legion", "--slot", "3", "--dry-run", "--repo", "sol-mif/sol-test"], {
    encoding: "utf8", env: { ...process.env, PATH: `${join(d.top, "bin")}:${process.env.PATH}`, HOME: d.top, SOL_RUNNER_UNITS: d.units, SOL_RUNNER_DIR: "" },
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, new RegExp(`into ${d.top}/actions-runner-3,`));
  assert.match(dry.stdout, /as 'legion-3', labels sol,legion-3/);
  assert.match(dry.stdout, /sol-runner-3\.service and enable it/);
  // a slot that is no number
  r = s.run("install", "legion", "--slot", "two", "--repo", "sol-mif/sol-test");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /a slot is a number/);
});

test("the unit sol/runner writes is the NucBox's: the runner's run.sh, restarted, niced, at login", { skip: devOnly("sol/engine/systemd/user/sol-runner.service") }, () => {
  const u = readFileSync(join(ROOT, "sol", "engine", "systemd", "user", "sol-runner.service"), "utf8");
  assert.match(u, /^ExecStart=%h\/actions-runner\/run\.sh$/m);
  assert.match(u, /^WorkingDirectory=%h\/actions-runner$/m);
  assert.match(u, /^Restart=always$/m);
  assert.match(u, /^Nice=10$/m);
  assert.match(u, /^WantedBy=default\.target$/m);
  assert.ok(execFileSync("bash", ["-n", join(ROOT, "sol", "runner")]).length === 0, "the script parses");
});
