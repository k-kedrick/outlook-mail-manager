import { PostgresJobRepository } from "./infrastructure/postgres-job-repository";

export const jobRepository = new PostgresJobRepository();
