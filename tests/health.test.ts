import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("health endpoint", () => {
  it("registers a health route", () => {
    const route = app.router.stack.find((layer) => layer.route?.path === "/health");
    expect(route).toBeDefined();
  });
});
