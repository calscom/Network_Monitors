import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Exercise the actual route-local helpers without starting auth, the DB, or polling.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = routes.indexOf("  const checkPing =");
const end = routes.indexOf("  // Unified polling function", start);
assert.ok(start !== -1 && end > start);
const { code } = transformSync(
  routes.slice(start, end) + "\nglobalThis.checks = { checkPing, checkSnmp };",
  { loader: "ts" },
);

function harness({ execAsync = async () => ({ stdout: "1 received" }), get, createError, closeError } = {}) {
  const timers = new Map();
  let callback;
  let closes = 0;
  const context = {
    execAsync,
    OID_IF_IN_OCTETS_BASE: "1.3.6.1.2.1.2.2.1.10",
    setTimeout(fn, ms) {
      const timer = {};
      timers.set(timer, { fn, ms });
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
    snmp: {
      createSession() {
        if (createError) throw createError;
        return {
          get(oids, cb) { callback = cb; get?.(cb); },
          close() { closes++; if (closeError) throw closeError; },
        };
      },
      isVarbindError: (varbind) => Boolean(varbind.error),
    },
  };
  runInNewContext(code, context);
  return {
    ...context.checks,
    timers,
    get closes() { return closes; },
    reply(...args) { callback(...args); },
    expire() {
      assert.equal(timers.size, 1);
      const [timer, { fn, ms }] = [...timers][0];
      assert.equal(ms, 10000);
      timers.delete(timer);
      fn();
    },
  };
}

test("ping returns false at the hard deadline when exec never settles", async () => {
  let options;
  const h = harness({ execAsync: (_command, opts) => {
    options = opts;
    return new Promise(() => {});
  } });
  const result = h.checkPing("192.0.2.1");
  assert.equal(options.timeout, 5000);
  h.expire();
  assert.equal(await result, false);
  assert.equal(h.timers.size, 0);
});

test("ping preserves successful output detection and clears its timer", async () => {
  for (const stdout of ["1 received", "1 packets received", "bytes from 192.0.2.1", "0 received"]) {
    const h = harness({ execAsync: async () => ({ stdout }) });
    assert.equal(await h.checkPing("192.0.2.1"), stdout !== "0 received");
    assert.equal(h.timers.size, 0);
  }
});

test("ping returns false on execution errors and clears its timer", async () => {
  const h = harness({ execAsync: async () => { throw new Error("timeout"); } });
  assert.equal(await h.checkPing("192.0.2.1"), false);
  assert.equal(h.timers.size, 0);
});

test("SNMP returns false and closes the session when no callback arrives", async () => {
  const h = harness();
  const result = h.checkSnmp("192.0.2.1", "public");
  h.expire();
  assert.equal(await result, false);
  assert.equal(h.closes, 1);
  assert.equal(h.timers.size, 0);
  h.reply(null, [{ value: 123 }]);
  assert.equal(await result, false);
  assert.equal(h.closes, 1);
});

test("SNMP preserves success, errors, empty and malformed responses", async () => {
  for (const [error, varbinds, expected] of [
    [null, [{ value: 123 }], true],
    [new Error("unreachable"), undefined, false],
    [null, [], false],
    [null, [{ error: true }], false],
    [null, undefined, false],
  ]) {
    const h = harness({ get: (cb) => cb(error, varbinds) });
    assert.equal(await h.checkSnmp("192.0.2.1", "public"), expected);
    assert.equal(h.closes, 1);
    assert.equal(h.timers.size, 0);
  }
});

test("SNMP setup/get failures return false and clear the deadline", async () => {
  for (const options of [
    { createError: new Error("setup failed") },
    { get: () => { throw new Error("get failed"); } },
  ]) {
    const h = harness(options);
    assert.equal(await h.checkSnmp("192.0.2.1", "public"), false);
    assert.equal(h.timers.size, 0);
    assert.equal(h.closes, options.createError ? 0 : 1);
  }
});

test("a throwing SNMP close cannot prevent the timeout result", async () => {
  const h = harness({ closeError: new Error("close failed") });
  const result = h.checkSnmp("192.0.2.1", "public");
  h.expire();
  assert.equal(await result, false);
  assert.equal(h.closes, 1);
});
