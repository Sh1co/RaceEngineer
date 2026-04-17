import { describe, expect, it } from "vitest";
import { isIgnoredPath, isSupportedFile } from "./indexRepository";

describe("indexRepository path filtering", () => {
  it("ignores common dependency and virtual environment folders", () => {
    expect(isIgnoredPath("node_modules/react/index.js")).toBe(true);
    expect(isIgnoredPath("backend/venv/lib/python3.11/site.py")).toBe(true);
    expect(isIgnoredPath("backend/.venv/lib/site.py")).toBe(true);
    expect(isIgnoredPath("dist/app.bundle.js")).toBe(true);
  });

  it("keeps source files under normal project directories", () => {
    expect(isIgnoredPath("lib/extension/src/chat/ChatController.ts")).toBe(
      false
    );
    expect(isSupportedFile("lib/extension/src/chat/ChatController.ts")).toBe(
      true
    );
  });

  it("rejects minified and lock files even outside ignored folders", () => {
    expect(isSupportedFile("web/app.min.js")).toBe(false);
    expect(isSupportedFile("styles/main.min.css")).toBe(false);
    expect(isSupportedFile("pnpm-lock.yaml")).toBe(false);
  });
});
