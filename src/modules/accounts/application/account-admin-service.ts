import type { AccountAdminListInput, AccountAdminPatch, AccountAdminRepository } from "../domain/account-admin";
import { AccountNotFoundError } from "../domain/account-admin";

export class AccountAdminService {
  constructor(private readonly repository: AccountAdminRepository) {}

  list(input: AccountAdminListInput) {
    return this.repository.list(input);
  }

  async update(id: string, input: AccountAdminPatch) {
    const account = await this.repository.update(id, input);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  async delete(id: string) {
    const account = await this.repository.delete(id);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  export(accountIds: string[]) {
    return this.repository.export(accountIds);
  }

  async reveal(id: string) {
    const account = await this.repository.reveal(id);
    if (!account) throw new AccountNotFoundError();
    return account;
  }
}
