import { describe, expect, it } from "vitest";
import { requireLoopbackHttpUrl } from "./url";

describe("loopback URL boundary", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3001", "http://[::1]:3000"])(
    "allows %s",
    (value) => expect(requireLoopbackHttpUrl(value)).toMatch(/^http:/)
  );

  it.each(["https://localhost:3000", "http://192.0.2.10:3000", "http://example.invalid", "file:///tmp/socket"])(
    "rejects %s",
    (value) => expect(() => requireLoopbackHttpUrl(value)).toThrow(/loopback/i)
  );
});
