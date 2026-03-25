import { describe, it, expect } from "vitest";
import {
  getUserDisplayInitials,
  getUserDisplayNameFromMetadata,
  getUserGivenNameFromMetadata,
} from "@/lib/user-display";

describe("getUserDisplayNameFromMetadata", () => {
  it("combines given_name and family_name with a space", () => {
    expect(
      getUserDisplayNameFromMetadata({ given_name: "Jane", family_name: "Doe" }),
    ).toBe("Jane Doe");
  });

  it("returns only given_name when family_name is absent", () => {
    expect(getUserDisplayNameFromMetadata({ given_name: "Jane" })).toBe("Jane");
  });

  it("returns only family_name when given_name is absent", () => {
    expect(getUserDisplayNameFromMetadata({ family_name: "Doe" })).toBe("Doe");
  });

  it("returns empty string when both fields are absent", () => {
    expect(getUserDisplayNameFromMetadata({})).toBe("");
  });

  it("ignores whitespace-only values", () => {
    expect(
      getUserDisplayNameFromMetadata({ given_name: "   ", family_name: "Doe" }),
    ).toBe("Doe");
  });

  it("returns empty string when both values are whitespace-only", () => {
    expect(
      getUserDisplayNameFromMetadata({ given_name: "  ", family_name: "  " }),
    ).toBe("");
  });
});

describe("getUserGivenNameFromMetadata", () => {
  it("returns the given_name when present", () => {
    expect(getUserGivenNameFromMetadata({ given_name: "Alice" })).toBe("Alice");
  });

  it("returns empty string when given_name is absent", () => {
    expect(getUserGivenNameFromMetadata({})).toBe("");
  });

  it("returns empty string for whitespace-only given_name", () => {
    expect(getUserGivenNameFromMetadata({ given_name: "  " })).toBe("");
  });
});

describe("getUserDisplayInitials", () => {
  it("returns '··' for a null user", () => {
    expect(getUserDisplayInitials(null)).toBe("··");
  });

  it("returns '··' for a user with no metadata", () => {
    expect(getUserDisplayInitials({})).toBe("··");
  });

  it("returns '··' for a user with empty user_metadata", () => {
    expect(getUserDisplayInitials({ user_metadata: {} })).toBe("··");
  });

  it("returns initials from given_name + family_name (first char of each, uppercased)", () => {
    expect(
      getUserDisplayInitials({
        user_metadata: { given_name: "Jane", family_name: "Doe" },
      }),
    ).toBe("JD");
  });

  it("uses first 2 chars of a single-word name when no family_name", () => {
    expect(
      getUserDisplayInitials({ user_metadata: { given_name: "Alex" } }),
    ).toBe("AL");
  });

  it("returns first char + '·' for a single-character name", () => {
    expect(
      getUserDisplayInitials({ user_metadata: { given_name: "X" } }),
    ).toBe("X·");
  });

  it("falls back to 'name' field when given/family are absent", () => {
    expect(
      getUserDisplayInitials({
        user_metadata: { name: "Charlie Brown" },
      }),
    ).toBe("CB");
  });

  it("falls back to 'display_name' when given/family/name are absent", () => {
    expect(
      getUserDisplayInitials({
        user_metadata: { display_name: "DJ Shadow" },
      }),
    ).toBe("DS");
  });

  it("falls back to 'preferred_username' last in the chain", () => {
    expect(
      getUserDisplayInitials({
        user_metadata: { preferred_username: "hacker42" },
      }),
    ).toBe("HA");
  });

  it("given_name + family_name takes priority over name field", () => {
    expect(
      getUserDisplayInitials({
        user_metadata: {
          given_name: "Ann",
          family_name: "Lee",
          name: "Zorro Masked",
        },
      }),
    ).toBe("AL");
  });

  it("uses first + last word for multi-word names (not first + second)", () => {
    expect(
      getUserDisplayInitials({
        user_metadata: { name: "Mary Jo Smith" },
      }),
    ).toBe("MS");
  });

  it("two-char username produces two uppercase initials", () => {
    expect(
      getUserDisplayInitials({ user_metadata: { preferred_username: "ab" } }),
    ).toBe("AB");
  });
});
