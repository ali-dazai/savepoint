import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errMsg, catalogError, CATALOG_ERRORS } from "../../src/data/errors.js";

describe("errMsg", () => {
  const cases = [
    ["Invalid login credentials", "That email and password don't match."],
    ["User already registered", "There's already an account with that email. Sign in instead."],
    ["Password should be at least 6 characters", "Use a password with at least 6 characters."],
    ["Failed to fetch", "Can't reach the server. Check your connection and try again."],
    ["NetworkError when attempting to fetch resource", "Can't reach the server. Check your connection and try again."],
    ["Load failed", "Can't reach the server. Check your connection and try again."],
    ["Email not confirmed", "Confirm your email first: open the link we sent you, then sign in."],
    ['duplicate key value violates unique constraint "games_igdb_id_key"', "That game is already on the shelf."],
  ];
  for (const [input, expected] of cases) {
    it(`maps "${input}"`, () => {
      assert.equal(errMsg(new Error(input)), expected);
    });
  }
  it("matches case-insensitively", () => {
    assert.equal(errMsg(new Error("invalid LOGIN credentials")), "That email and password don't match.");
  });
  it("passes unknown messages through", () => {
    assert.equal(errMsg(new Error("Something odd")), "Something odd");
  });
  it("handles null and undefined", () => {
    assert.equal(errMsg(null), "Something went wrong.");
    assert.equal(errMsg(undefined), "Something went wrong.");
  });
  it("handles non-Error inputs", () => {
    assert.equal(errMsg("Invalid login credentials"), "That email and password don't match.");
    assert.equal(errMsg({ message: "Load failed" }), "Can't reach the server. Check your connection and try again.");
    assert.equal(errMsg(42), "42");
  });
});

describe("catalogError", () => {
  it("returns an Error with the mapped text for each known code", () => {
    for (const [code, text] of Object.entries(CATALOG_ERRORS)) {
      const e = catalogError(code);
      assert.ok(e instanceof Error);
      assert.equal(e.message, text);
    }
    assert.equal(Object.keys(CATALOG_ERRORS).length, 4);
  });
  it("falls back to the generic text for unknown or missing codes", () => {
    const generic = "Can't reach the games database right now. You can still add the game by hand.";
    assert.equal(catalogError("who_knows").message, generic);
    assert.equal(catalogError(undefined).message, generic);
    assert.equal(catalogError(null).message, generic);
  });
});
