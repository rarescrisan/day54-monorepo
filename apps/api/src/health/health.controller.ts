import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  status: "ok";
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Liveness probe. Deliberately dependency-free: a health check that can fail
 * because one of its own collaborators failed to construct is not a health
 * check. If this ever needs to report on a database or queue, add a *readiness*
 * endpoint alongside it rather than making this one conditional.
 */
@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
