import type { CreateGroupInput, GroupRepository, UpdateGroupInput } from "../domain/group";
import { GroupNotFoundError } from "../domain/group";

export class GroupService {
  constructor(private readonly repository: GroupRepository) {}

  list() {
    return this.repository.list();
  }

  create(input: CreateGroupInput) {
    return this.repository.create(input);
  }

  async update(id: string, input: UpdateGroupInput) {
    const group = await this.repository.update(id, input);
    if (!group) throw new GroupNotFoundError();
    return group;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw new GroupNotFoundError();
  }
}
