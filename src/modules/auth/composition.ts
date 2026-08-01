import { AuthService } from "./application/auth-service";
import { PrismaAdminAuthRepository } from "./infrastructure/prisma-auth-repository";

export const authService = new AuthService(new PrismaAdminAuthRepository());
