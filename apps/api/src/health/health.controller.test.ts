import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module";

// Through the front door: a real HTTP request against a bootstrapped app, via
// AppModule rather than the controller class. Instantiating HealthController
// directly would still pass if the controller were never registered on the
// module — which is the bug most worth catching here.
describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds 200 with status ok", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("reports a non-negative uptime and a parseable timestamp", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(response.body.uptimeSeconds)).toBe(true);
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  it("404s on an unknown route", async () => {
    const response = await request(app.getHttpServer()).get("/not-a-route");

    expect(response.status).toBe(404);
  });
});
