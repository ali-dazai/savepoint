import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hsl, tintFrom, hueSat, manualVars, styleVars } from "../../src/ui/theme.js";
import { hash } from "../../src/core/util.js";

// hexToHsl and wallVars are not exported, so they are covered through tintFrom / hueSat.
const parse = (s) =>
  s
    .match(/^hsl\((\d+), (\d+)%, (\d+)%\)$/)
    .slice(1)
    .map(Number);

describe("hsl", () => {
  it("formats rounded degrees and percentages", () => {
    assert.equal(hsl(120.4, 0.456, 0.5), "hsl(120, 46%, 50%)");
    assert.equal(hsl(0, 0, 1), "hsl(0, 0%, 100%)");
  });
});

describe("tintFrom", () => {
  it("returns bg, tile and soft hsl strings", () => {
    const t = tintFrom("#ff0000", "tint-shape");
    assert.deepEqual(Object.keys(t).sort(), ["bg", "soft", "tile"]);
    for (const v of Object.values(t)) assert.ok(v.startsWith("hsl("), v);
  });
  it("caches by colour and key", () => {
    assert.equal(tintFrom("#00ff00", "tint-cache"), tintFrom("#00ff00", "tint-cache"));
    assert.notEqual(tintFrom("#00ff00", "tint-cache"), tintFrom("#00ff00", "tint-cache-2"));
  });
  it("reads hue from the colour, with or without #", () => {
    assert.equal(parse(tintFrom("#ff0000", "h1").bg)[0], 0);
    assert.equal(parse(tintFrom("#00ff00", "h2").bg)[0], 120);
    assert.equal(parse(tintFrom("0000ff", "h3").bg)[0], 240);
  });
  it("uses 5% saturation for near-grey colours", () => {
    const t = tintFrom("#808080", "grey");
    assert.equal(parse(t.bg)[1], 5);
    assert.equal(parse(t.tile)[1], 5);
    assert.equal(parse(t.soft)[1], 17);
  });
  it("clamps vivid saturation to at most 45%", () => {
    const t = tintFrom("#ff0000", "vivid");
    assert.equal(parse(t.bg)[1], 45);
    assert.equal(parse(t.soft)[1], 55);
  });
  it("lifts weak (but not grey) saturation to at least 20%", () => {
    assert.equal(parse(tintFrom("#a08080", "weak").bg)[1], 20);
  });
  it("uses fixed lightness steps", () => {
    const t = tintFrom("#ff0000", "light");
    assert.deepEqual([parse(t.bg)[2], parse(t.tile)[2], parse(t.soft)[2]], [19, 25, 84]);
  });
  it("takes the hue from the key when there is no usable colour", () => {
    const [h, s] = parse(tintFrom(null, "key-a").bg);
    assert.equal(h, hash("key-a") % 360);
    assert.equal(s, 22);
    assert.equal(parse(tintFrom("not-a-colour", "key-a").bg)[0], h);
    assert.equal(tintFrom(null, "key-a"), tintFrom(null, "key-a"));
  });
  it("gives different keys different hues", () => {
    assert.notEqual(hash("alpha") % 360, hash("beta") % 360);
    assert.notEqual(parse(tintFrom(null, "alpha").bg)[0], parse(tintFrom(null, "beta").bg)[0]);
  });
});

describe("hueSat", () => {
  it("gives greys a saturation of 0.06", () => {
    assert.equal(hueSat("#808080", "k")[1], 0.06);
    assert.equal(hueSat("#ffffff", "k")[1], 0.06);
  });
  it("clamps vivid colours to 0.5 and weak ones up to 0.22", () => {
    assert.deepEqual(hueSat("#ff0000", "k"), [0, 0.5]);
    assert.equal(hueSat("#a08080", "k")[1], 0.22);
  });
  it("keeps saturation between 0.22 and 0.5 for coloured input", () => {
    for (const c of ["#336699", "#cc3366", "#99cc33", "#7a55c4"]) {
      const s = hueSat(c, "k")[1];
      assert.ok(s >= 0.22 && s <= 0.5, `${c} -> ${s}`);
    }
  });
  it("falls back to a key-derived hue and 0.25 saturation", () => {
    const [h, s] = hueSat(null, "some game");
    assert.equal(s, 0.25);
    assert.ok(h >= 0 && h < 360);
    assert.deepEqual(hueSat(undefined, "some game"), [h, s]);
  });
});

describe("manualVars", () => {
  const vars = manualVars(200, 0.4);
  it("returns string values under -- keys including --bg and --ink", () => {
    for (const [k, v] of Object.entries(vars)) {
      assert.ok(k.startsWith("--"), k);
      assert.equal(typeof v, "string");
    }
    assert.ok("--bg" in vars && "--ink" in vars);
  });
  it("caps the paper tint saturation at 30%", () => {
    assert.equal(vars["--bg"], hsl(200, 0.3, 0.955));
    assert.equal(manualVars(200, 0.1)["--bg"], hsl(200, 0.1, 0.955));
  });
});

describe("styleVars", () => {
  it("joins variables into an inline style string", () => {
    assert.equal(styleVars({ "--a": "1", "--b": "red" }), "--a:1;--b:red");
  });
});
