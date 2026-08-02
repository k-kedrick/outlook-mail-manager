export type MailGroup = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
};

export type MailGroupWithCount = MailGroup & { _count: { accounts: number } };
export type CreateGroupInput = { name: string; color?: string };
export type UpdateGroupInput = { name?: string; color?: string | null; sortOrder?: number };

export interface GroupRepository {
  list(): Promise<MailGroupWithCount[]>;
  create(input: CreateGroupInput): Promise<MailGroup>;
  update(id: string, input: UpdateGroupInput): Promise<MailGroup | null>;
  delete(id: string): Promise<boolean>;
}

export class GroupNotFoundError extends Error {
  constructor() {
    super("GROUP_NOT_FOUND");
    this.name = "GroupNotFoundError";
  }
}
