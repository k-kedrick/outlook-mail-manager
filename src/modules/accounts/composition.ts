import { AccountAdminService } from "./application/account-admin-service";
import { ImportAccountsService } from "./application/import-accounts-service";
import { PrismaAccountAdminRepository } from "./infrastructure/prisma-account-admin-repository";
import { PrismaAccountImporter } from "./infrastructure/prisma-account-importer";

export const importAccountsService = new ImportAccountsService(new PrismaAccountImporter());
export const accountAdminService = new AccountAdminService(new PrismaAccountAdminRepository());
