import assert from "node:assert/strict";
import { test } from "node:test";
import { clientKey, ipKey, rateLimiter } from "./rate-limit.ts";

const MIN = 60_000;

test("allows max attempts per window, then blocks until the block ends", () => {
  const limit = rateLimiter({ max: 3, windowMs: MIN, blockMs: 10 * MIN });
  for (let i = 0; i < 3; i++) assert.equal(limit.take("a", 1000), 0);
  assert.equal(limit.take("a", 2000), 600);
  // Still blocked after the original window would have reset.
  assert.equal(limit.take("a", 2000 + 5 * MIN), 300);
  assert.equal(limit.take("a", 2000 + 10 * MIN), 0);
});

test("a new window starts fresh", () => {
  const limit = rateLimiter({ max: 2, windowMs: MIN });
  assert.equal(limit.take("a", 0), 0);
  assert.equal(limit.take("a", 1), 0);
  assert.equal(limit.take("a", MIN), 0);
  assert.equal(limit.take("a", MIN + 1), 0);
  assert.equal(limit.take("a", MIN + 2), 60);
});

test("keys are counted separately", () => {
  const limit = rateLimiter({ max: 1, windowMs: MIN });
  assert.equal(limit.take("a", 0), 0);
  assert.equal(limit.take("b", 0), 0);
  assert.ok(limit.take("a", 0) > 0);
});

test("refunds give back attempts but never lift a block", () => {
  const limit = rateLimiter({ max: 2, windowMs: MIN });
  for (let i = 0; i < 5; i++) {
    assert.equal(limit.take("a", i), 0);
    limit.refund("a");
  }
  assert.equal(limit.take("a", 10), 0);
  assert.equal(limit.take("a", 11), 0);
  assert.ok(limit.take("a", 12) > 0);
  limit.refund("a");
  assert.ok(limit.take("a", 13) > 0);
});

test("forgets the oldest addresses under a flood instead of growing", () => {
  const limit = rateLimiter({ max: 1, windowMs: MIN });
  assert.equal(limit.take("first", 0), 0);
  assert.ok(limit.take("first", 0) > 0);
  for (let i = 0; i < 10_000; i++) limit.take(`flood-${i}`, 0);
  assert.equal(limit.take("first", 0), 0);
});

test("prefers CF-Connecting-IP, then the nearest X-Forwarded-For hop", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://swingbus.test/api/parties", { headers });
  assert.equal(
    clientKey(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })),
    "203.0.113.7",
  );
  assert.equal(clientKey(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.1" })), "198.51.100.1");
  assert.equal(clientKey(req({})), "unknown");
});

test("groups IPv6 by /64 and unwraps IPv4", () => {
  assert.equal(ipKey("2001:db8:abcd:12::1"), "2001:db8:abcd:12::/64");
  assert.equal(ipKey("2001:db8:abcd:12:ffff:1:2:3"), "2001:db8:abcd:12::/64");
  assert.equal(ipKey("2001:0db8:0000:0000:1111:2222:3333:4444"), ipKey("2001:db8::9"));
  assert.equal(ipKey("::1"), "0:0:0:0::/64");
  assert.equal(ipKey("::ffff:192.0.2.5"), "192.0.2.5");
  assert.equal(ipKey("192.0.2.5:443"), "192.0.2.5");
});
