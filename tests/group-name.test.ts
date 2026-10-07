import { describe, expect, it } from "vitest";
import { deriveShortName, groupShortName } from "@/lib/group-name";

describe("guruhning qisqa nomi", () => {
  it("nom oxiridagi sinf va tartib raqamidan chiqariladi", () => {
    expect(deriveShortName("XSH-25I0802")).toBe("8.2");
    expect(deriveShortName("XSH-26I0810")).toBe("8.10");
    expect(deriveShortName("XSH-24I1101")).toBe("11.1");
    expect(deriveShortName("TEST")).toBeNull();
    expect(deriveShortName("G-9900")).toBeNull();
  });

  it("mentor kiritgan nom ustun turadi; hech biri bo'lmasa to'liq nom", () => {
    expect(groupShortName({ name: "XSH-25I0802", shortName: " 8-A " })).toBe("8-A");
    expect(groupShortName({ name: "XSH-25I0802", shortName: "" })).toBe("8.2");
    expect(groupShortName({ name: "TEST" })).toBe("TEST");
  });
});
