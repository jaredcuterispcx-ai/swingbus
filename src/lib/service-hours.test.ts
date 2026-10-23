import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  assertInService,
  clockLabel,
  hoursLabel,
  opensLabel,
  serviceStatus,
  windowLabel,
} from "./service-hours.ts";

const offsite = { name: "Southland Mall Parking Lot", service: "offsite" as const };

/** [instant, open?, next opening if closed / closing if open] */
const OFFSITE: [string, boolean, string][] = [
  // Oct 23 2026, CDT (UTC−5)
  ["2026-10-23T05:30:00Z", false, "2026-10-23T10:00:00.000Z"], // 12:30 AM
  ["2026-10-23T09:59:59Z", false, "2026-10-23T10:00:00.000Z"], // 4:59:59 AM
  ["2026-10-23T10:00:00Z", true, "2026-10-23T15:00:00.000Z"], // 5:00 AM
  ["2026-10-23T14:59:59Z", true, "2026-10-23T15:00:00.000Z"], // 9:59:59 AM
  ["2026-10-23T15:00:00Z", false, "2026-10-23T22:00:00.000Z"], // 10:00 AM
  ["2026-10-23T21:59:59Z", false, "2026-10-23T22:00:00.000Z"], // 4:59:59 PM
  ["2026-10-23T22:00:00Z", true, "2026-10-24T03:00:00.000Z"], // 5:00 PM
  ["2026-10-24T02:59:59Z", true, "2026-10-24T03:00:00.000Z"], // 9:59:59 PM
  ["2026-10-24T03:00:00Z", false, "2026-10-24T10:00:00.000Z"], // 10:00 PM
  // Dec 15 2026, CST (UTC−6)
  ["2026-12-15T10:59:59Z", false, "2026-12-15T11:00:00.000Z"], // 4:59:59 AM
  ["2026-12-15T11:00:00Z", true, "2026-12-15T16:00:00.000Z"], // 5:00 AM
  ["2026-12-15T16:00:00Z", false, "2026-12-15T23:00:00.000Z"], // 10:00 AM
  ["2026-12-16T03:59:59Z", true, "2026-12-16T04:00:00.000Z"], // 9:59:59 PM
  ["2026-12-16T04:00:00Z", false, "2026-12-16T11:00:00.000Z"], // 10:00 PM
  // Fall back Nov 1 2026: 10:30 PM CDT, next opening is 5 AM CST
  ["2026-11-01T03:30:00Z", false, "2026-11-01T11:00:00.000Z"],
  ["2026-11-01T10:59:59Z", false, "2026-11-01T11:00:00.000Z"],
  ["2026-11-01T11:00:00Z", true, "2026-11-01T16:00:00.000Z"],
  // Spring forward Mar 8 2026: 10:30 PM CST, next opening is 5 AM CDT
  ["2026-03-08T04:30:00Z", false, "2026-03-08T10:00:00.000Z"],
  ["2026-03-08T09:59:59Z", false, "2026-03-08T10:00:00.000Z"],
  ["2026-03-08T10:00:00Z", true, "2026-03-08T15:00:00.000Z"],
];

const ORIGINAL_TZ = process.env.TZ;
after(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** Server timezone → its UTC offset in minutes on Oct 23 2026, as `getTimezoneOffset` reports it. */
const SERVER_ZONES: [string, number][] = [
  ["UTC", 0],
  ["America/Chicago", 300],
  ["America/Los_Angeles", 420],
  ["Asia/Tokyo", -540],
  ["Pacific/Kiritimati", -840],
];

for (const [tz, offset] of SERVER_ZONES) {
  test(`offsite windows in Memphis time with TZ=${tz}`, () => {
    process.env.TZ = tz;
    assert.equal(new Date("2026-10-23T12:00:00Z").getTimezoneOffset(), offset);
    for (const [at, open, change] of OFFSITE) {
      const status = serviceStatus(offsite, new Date(at));
      assert.equal(status.open, open, at);
      assert.equal(open ? status.closesAt : status.opensAt, change, at);
      assert.equal(open ? status.opensAt : status.closesAt, null, at);
    }
  });
}

test("onsite, both, and untagged stops never close", () => {
  for (const service of ["onsite", "both", undefined] as const) {
    for (const at of ["2026-10-23T08:00:00Z", "2026-10-23T16:00:00Z", "2026-10-24T04:00:00Z"]) {
      assert.deepEqual(serviceStatus({ service }, new Date(at)), {
        open: true,
        opensAt: null,
        closesAt: null,
      });
    }
    assert.equal(hoursLabel({ service }), "24/7");
  }
});

test("labels", () => {
  assert.equal(hoursLabel({ service: "offsite" }), "5–10 AM · 5–10 PM");
  assert.equal(windowLabel({ start: "10:00", end: "14:30" }), "10 AM–2:30 PM");
  assert.equal(clockLabel("2026-10-23T22:00:00Z"), "5 PM");
  assert.equal(clockLabel("2026-10-23T10:30:00Z"), "5:30 AM");
  assert.equal(opensLabel(serviceStatus(offsite, new Date("2026-10-23T15:00:00Z"))), "Opens 5 PM");
  assert.equal(opensLabel(serviceStatus(offsite, new Date("2026-10-24T03:00:00Z"))), "Opens 5 AM");
});

test("riders can't request a closed stop", () => {
  assert.throws(
    () => assertInService(offsite, new Date("2026-10-23T15:00:00Z")),
    { message: "Southland Mall Parking Lot is closed until 5 PM" },
  );
  assert.doesNotThrow(() => assertInService(offsite, new Date("2026-10-23T22:00:00Z")));
});
