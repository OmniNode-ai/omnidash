// OMN-24616 AC7: Runs and Evidence export cells that a spreadsheet would run as a formula are neutralised (draft through onex delegate run 68dc32a1).
import { describe, it, expect } from "vitest";
import { csvCell } from "./csv-cell";

describe("csvCell", () => {
  it("returns an empty string for null or undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("stringifies objects", () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("converts numbers and booleans with String and never neutralises them", () => {
    expect(csvCell(42)).toBe("42");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
    expect(csvCell(-0.5)).toBe("-0.5");
    expect(csvCell(-1)).toBe("-1");
  });

  it("neutralises strings that start with a formula character", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(
      "\"'=HYPERLINK(\"\"http://x\"\",\"\"y\"\")\""
    );
    expect(csvCell("-1")).toBe("\"'-1\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(csvCell("\tfoo")).toBe("\"'\tfoo\"");
    expect(csvCell("\rfoo")).toBe("\"'\rfoo\"");
  });

  it("quotes cells containing a comma, double quote, CR, or LF", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("leaves safe strings unquoted", () => {
    expect(csvCell("hello")).toBe("hello");
  });
});
