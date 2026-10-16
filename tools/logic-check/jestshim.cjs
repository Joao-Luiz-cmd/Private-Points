// Shim mínimo de Jest sobre node:test/assert — SOMENTE para verificação local sem rede.
const nodeTest = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
globalThis.describe = (name, fn) => nodeTest.describe(name, fn);
globalThis.it = (name, fn) => nodeTest.it(name, fn);
function makeMatchers(actual, negate) {
  const wrap = (fn) => (...args) => {
    let threw = false;
    try { fn(...args); } catch (e) { threw = true; if (!negate) throw e; }
    if (negate && !threw) throw new assert.AssertionError({ message: 'expected assertion to fail (.not)' });
  };
  return {
    toBe: wrap((v) => assert.strictEqual(actual, v)),
    toEqual: wrap((v) => assert.deepStrictEqual(actual, v)),
    toContain: wrap((v) => assert.ok(String(actual).includes(v), `${actual} !contains ${v}`)),
    toBeNull: wrap(() => assert.strictEqual(actual, null)),
    toBeCloseTo: wrap((v, digits = 2) => assert.ok(Math.abs(actual - v) < Math.pow(10, -digits) / 2, `${actual} not close to ${v}`)),
    toBeGreaterThanOrEqual: wrap((v) => assert.ok(actual >= v, `${actual} < ${v}`)),
    toThrow: wrap((exp) => {
      if (typeof exp === 'string') assert.throws(actual, (e) => String(e && e.message).includes(exp));
      else if (typeof exp === 'function') assert.throws(actual, exp);
      else assert.throws(actual);
    }),
  };
}
globalThis.expect = (actual) => { const m = makeMatchers(actual, false); m.not = makeMatchers(actual, true); return m; };
