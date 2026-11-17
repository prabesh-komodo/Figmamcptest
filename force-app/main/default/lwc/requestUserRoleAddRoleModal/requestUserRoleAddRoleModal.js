import { LightningElement, api } from "lwc";

/**
 * First step of the Add Role flow: shows the selected requests' scope and
 * captures one role plus the users to give it to (picked as pills).
 * Emits `cancel`, or `next` with `{ role, users }`.
 */
export default class RequestUserRoleAddRoleModal extends LightningElement {
  /** e.g. "7 request(s) · 3 program(s) · 2 program type(s)" */
  @api scopeLabel = "";

  /** Roles offered in the Role lookup. */
  @api roles = [];

  /** Users offered in the User(s) to Add lookup. */
  @api users = [];

  /** Pre-filled values, e.g. when the user comes back to this popup from the review. */
  @api initialRole = "";
  @api initialUsers = [];

  role = "";
  selectedUsers = [];

  connectedCallback() {
    this.role = this.initialRole ?? "";
    this.selectedUsers = [...(this.initialUsers ?? [])];
  }

  /** Users not picked yet, so the same person can't be added twice. */
  get availableUsers() {
    const picked = new Set(this.selectedUsers);
    return this.users.filter((user) => !picked.has(user));
  }

  get userPills() {
    return this.selectedUsers.map((user) => ({ label: user, name: user }));
  }

  get hasUsers() {
    return this.selectedUsers.length > 0;
  }

  get isNextDisabled() {
    return !this.role || !this.hasUsers;
  }

  handleRoleChange(event) {
    this.role = event.detail.value;
  }

  handleUserPick(event) {
    const user = event.detail.value;
    if (user && !this.selectedUsers.includes(user)) {
      this.selectedUsers = [...this.selectedUsers, user];
    }
  }

  handleUserRemove(event) {
    const user = event.currentTarget.dataset.name;
    this.selectedUsers = this.selectedUsers.filter((item) => item !== user);
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.handleCancel();
    }
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }

  handleNext() {
    if (this.isNextDisabled) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("next", {
        detail: { role: this.role, users: [...this.selectedUsers] }
      })
    );
  }
}
