import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";

// Run the actual route-local polling declarations, not a copy of the scheduler.
// Loading the whole routes module would start database/auth/network dependencies.
const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const names = [
  "pollDevice", "checkPing", "checkSnmp", "pollDeviceUnified",
  "devicePollTimers", "pollSingleDevice", "initializeStaggeredPolling",
];
const declarations = names.map((name) => {
  // These route-local declarations use two-space indentation. Fail explicitly
  // if they move; never silently substitute a copied implementation.
  const pattern = name === "devicePollTimers"
    ? /^  const devicePollTimers:[^\n]+;/m
    : new RegExp(`^  const ${name} = [\\s\\S]*?^  };`, "m");
  const statement = source.match(pattern)?.[0];
  assert.ok(statement, `Production declaration ${name} must exist`);
  return statement;
});
const code = transformSync(
  `${declarations.join("\n")}
   globalThis.scheduler = { initializeStaggeredPolling, devicePollTimers };`,
  { loader: "ts", target: "es2022" },
).code;

class Clock {
  now = 0;
  nextId = 0;
  timers = new Map();

  setTimeout = (callback, delay = 0) => {
    const id = ++this.nextId;
    this.timers.set(id, { callback, at: this.now + delay, delay });
    return id;
  };

  clearTimeout = (id) => this.timers.delete(id);

  async advanceTo(target) {
    assert.ok(target >= this.now);
    for (;;) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      const [id, timer] = next;
      this.now = timer.at;
      this.timers.delete(id);
      // Do not await the callback: a poll can be waiting for another fake timer.
      timer.callback();
      await setImmediate(); // Drain all promise continuations before the next timer.
    }
    this.now = target;
    await setImmediate();
  }
}

function harness(devices) {
  const clock = new Clock();
  const logs = [];
  const writes = [];
  const networkChecks = [];
  const context = vm.createContext({
    Promise,
    currentPollingInterval: 5000,
    isAvailabilityResetInProgress: false,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    console: Object.fromEntries(["log", "warn", "error"].map((level) => [
      level, (...args) => logs.push({ level, at: clock.now, text: args.join(" ") }),
    ])),
    storage: {
      getDevices: async () => devices,
      getDevice: async (id) => devices.find((device) => device.id === id),
    },
    snmp: {
      createSession: (ip) => ({
        get: () => networkChecks.push({ ip, type: "snmp", at: clock.now }),
        close: () => {},
      }),
    },
    execAsync: (command) => {
      networkChecks.push({ command, type: "ping", at: clock.now });
      return new Promise(() => {}); // No network response, including no SNMP callback.
    },
    retryUpdateDeviceMetrics: async (id, _name, metrics) => writes.push({ id, metrics }),
    OID_IF_IN_OCTETS_BASE: "1.3.6.1.2.1.2.2.1.10",
    OID_IF_OUT_OCTETS_BASE: "1.3.6.1.2.1.2.2.1.16",
  });
  vm.runInContext(code, context);
  return { clock, logs, writes, networkChecks, context, ...context.scheduler };
}

function makeDevices(count, types = ["snmp_only"]) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `unreachable-${index + 1}`,
    ip: `192.0.2.${(index % 254) + 1}`,
    community: "test",
    pollType: types[index % types.length],
    status: "red",
    totalChecks: 0,
    successfulChecks: 0,
  }));
}

for (const scenario of [
  { label: "169 SNMP devices", count: 169, types: ["snmp_only"] },
  {
    label: "all four polling modes",
    count: 12,
    types: ["snmp_only", "ping_only", "ping_and_snmp", "ping_or_snmp"],
  },
]) {
  test(`startup burst: ${scenario.label} time out and keep scheduling`, async () => {
    const devices = makeDevices(scenario.count, scenario.types);
    const h = harness(devices);
    const offset = Math.floor(5000 * 0.8 / devices.length);
    const lastOffset = (devices.length - 1) * offset;
    await h.initializeStaggeredPolling();
    assert.equal(h.devicePollTimers.size, devices.length);
    assert.ok(h.logs.some((log) => log.text.includes(`Scheduled ${devices.length} devices`)));

    for (let round = 0; round < 3; round++) {
      const roundStart = round * 15000; // 10s timeout + 5s interval after completion.
      await h.clock.advanceTo(roundStart + lastOffset);
      const checksStarted = h.networkChecks.length;
      assert.equal(h.networkChecks.filter((check) => check.type === "snmp").length,
        devices.filter((device) => device.pollType !== "ping_only").length * (round + 1));
      assert.equal(h.networkChecks.filter((check) => check.type === "ping").length,
        devices.filter((device) => device.pollType !== "snmp_only").length * (round + 1));
      await h.clock.advanceTo(roundStart + lastOffset + 9999);
      // No overlapping rounds while all checks are still waiting.
      // Early devices may have finished, but none may start its next poll yet.
      assert.equal(h.networkChecks.length, checksStarted);
      await h.clock.advanceTo(roundStart + lastOffset + 10000);
      assert.equal(h.devicePollTimers.size, devices.length);
      assert.equal(h.clock.timers.size, devices.length, "Only next-round timers remain");
      devices.forEach((device, index) => {
        const next = h.clock.timers.get(h.devicePollTimers.get(device.id));
        assert.ok(next, `Device ${device.id} has a live next-round timer`);
        assert.equal(next.delay, 5000);
        assert.equal(next.at, roundStart + index * offset + 15000);
      });
      console.log(`[poll-test] ${scenario.label}: round ${round + 1} resolved by `
        + `${h.clock.now}ms; all ${devices.length} next polls scheduled 5000ms after completion`);
    }
    for (const device of devices) {
      const expected = [0, 15000, 30000].map((at) => at + (device.id - 1) * offset);
      const actual = h.networkChecks
        .filter((check) => device.pollType === "ping_only"
          ? check.command === `ping -c 1 -W 2 ${device.ip}` : check.ip === device.ip)
        .map((check) => check.at);
      assert.deepEqual(actual, expected, `Device ${device.id} ran all three rounds`);
    }
    assert.equal(h.logs.filter((log) => log.text.includes("forcing resolution")).length,
      devices.filter((device) => device.pollType === "snmp_only").length * 3);
    assert.equal(h.writes.length,
      devices.filter((device) => device.pollType !== "snmp_only").length * 3);
    assert.ok(h.writes.every((write) => write.metrics.status === "red"));
    assert.equal(h.logs.filter((log) => log.level === "error").length, 0);
    h.clock.timers.clear();
  });
}
