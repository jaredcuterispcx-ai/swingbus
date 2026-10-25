import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { THEME_BOOT_SCRIPT, THEME_KEY } from "./theme.ts";

/** Runs the boot script against a stub document; returns the data-theme and theme-color it set. */
function boot(stored: string | null | Error) {
  const attrs: Record<string, string> = {};
  const metas: Record<string, string>[] = [];
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => (attrs[name] = value) },
    createElement: () => ({}) as Record<string, string>,
    head: { prepend: (m: Record<string, string>) => metas.unshift(m) },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (stored instanceof Error) throw stored;
      return key === THEME_KEY ? stored : null;
    },
  };
  new Function("document", "localStorage", THEME_BOOT_SCRIPT)(document, localStorage);
  return { theme: attrs["data-theme"], bar: metas.map((m) => `${m.name}=${m.content}`) };
}

test("boot script: dark unless this device chose light", () => {
  assert.deepEqual(boot(null), { theme: "dark", bar: ["theme-color=#000000"] });
  assert.deepEqual(boot("dark"), { theme: "dark", bar: ["theme-color=#000000"] });
  assert.deepEqual(boot("light"), { theme: "light", bar: ["theme-color=#ffffff"] });
  assert.deepEqual(boot("sepia"), { theme: "dark", bar: ["theme-color=#000000"] });
  assert.deepEqual(boot(new Error("storage blocked")), { theme: "dark", bar: ["theme-color=#000000"] });
});

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const LIGHT = ":root,\n.sb-light {";
const DARK = ':root:not([data-theme="light"]) {';

/** The #rrggbb custom properties declared in the block that opens with `opener`. */
function palette(opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  assert.ok(start >= 0, `"${opener}" not found in globals.css`);
  const body = css.slice(start + opener.length, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

const light = palette(LIGHT);
const dark = { ...light, ...palette(DARK) };

test("paper always prints light: the dark palette applies on screen only", () => {
  assert.match(css, /@media screen\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/);
  assert.equal(light["--void"], "#ffffff");
  assert.equal(dark["--void"], "#000000");
});

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` opacity over `bg`, composited in sRGB like the browser does. */
const over = (fg: string, bg: string, alpha: number) =>
  "#" +
  rgb(fg)
    .map((c, i) => Math.round(c * alpha + rgb(bg)[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("");

/** WCAG 2 AA: 4.5:1 for text (1.4.3), 3:1 for icons, markers and control edges (1.4.11). */
const PAIRS: [fg: string, bg: string, min: number][] = [
  ["--ink", "--void", 4.5],
  ["--ink", "--foam", 4.5],
  ["--ink", "--mist", 4.5],
  ["--ink", "--mist-hover", 4.5],
  ["--ink", "--raised", 4.5],
  ["--ink", "--surface", 4.5],
  ["--ink-soft", "--void", 4.5],
  ["--ink-soft", "--foam", 4.5],
  ["--ink-soft", "--mist", 4.5],
  ["--ink-soft", "--raised", 4.5],
  ["--ink-soft", "--surface", 4.5],
  ["--placeholder", "--mist", 4.5],
  ["--placeholder", "--void", 4.5],
  ["--on-strong", "--strong", 4.5],
  ["--on-strong", "--strong-hover", 4.5],
  ["--on-night", "--night", 4.5],
  ["--on-volt", "--volt", 4.5],
  ["--danger", "--void", 4.5],
  ["--danger", "--mist", 4.5],
  ["--danger", "--surface", 4.5],
  ["--amber", "--amber-soft", 4.5],
  ["--volt", "--night", 3],
  ["--strong", "--void", 3],
  ["--ink", "--map-bg", 3],
  ["--map-stop", "--map-bg", 3],
];

for (const [name, colors] of [
  ["light", light],
  ["dark", dark],
] as const) {
  test(`${name} scheme meets WCAG AA`, () => {
    const short = PAIRS.flatMap(([fg, bg, min]) => {
      assert.ok(colors[fg] && colors[bg], `${fg} or ${bg} has no #rrggbb value`);
      const ratio = contrast(colors[fg], colors[bg]);
      return ratio < min ? [`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`] : [];
    });
    // An out-of-contact shuttle is drawn at 50% opacity and must still stand out from the map.
    const mapBg = colors["--map-bg"];
    const faded = Math.max(
      contrast(over(colors["--night"], mapBg, 0.5), mapBg),
      contrast(over(colors["--on-night"], mapBg, 0.5), mapBg),
    );
    if (faded < 3) short.push(`faded shuttle on --map-bg: ${faded.toFixed(2)} < 3`);
    assert.deepEqual(short, []);
  });
}
