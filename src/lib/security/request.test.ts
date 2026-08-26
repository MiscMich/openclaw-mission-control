import { describe, expect, it } from "vitest";
import { readBoundedJsonObject } from "./request";

describe("request boundaries", () => {
  it("accepts a small JSON object", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    await expect(readBoundedJsonObject(request, 128)).resolves.toEqual({ ok: true });
  });

  it("rejects unsupported content types and oversized bodies", async () => {
    const text = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    await expect(readBoundedJsonObject(text, 128)).rejects.toThrow(/content-type/i);

    const large = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(256) }),
    });
    await expect(readBoundedJsonObject(large, 64)).rejects.toThrow(/too large/i);
  });

  it("rejects arrays and malformed JSON", async () => {
    const array = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    await expect(readBoundedJsonObject(array, 128)).rejects.toThrow(/object/i);

    const malformed = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    await expect(readBoundedJsonObject(malformed, 128)).rejects.toThrow(/invalid json/i);
  });
});
