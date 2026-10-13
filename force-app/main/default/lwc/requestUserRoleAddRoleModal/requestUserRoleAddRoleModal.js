import { LightningElement, api } from "lwc";

/**
 * First step of the Add Role flow: shows the selected requests' scope and
 * captures one role type plus the users to give it to (picked as pills).
 * Emits `cancel`, or `next` with `{ roleType, users }`.
 */
export default class RequestUserRoleAddRoleModal extends LightningElement {
  /** e.g. "7 request(s) · 3 program(s) · 2 program type(s)" */
  @api scopeLabel = "";

  /** Role types offered in the Role Type lookup. */
  @api roleTypes = [];

  /** Users offered in the User(s) to Add lookup. */
  @api users = [];

  /** Pre-filled values, e.g. when the user comes back to this popup from the review. */
  @api initialRoleType = "";
  @api initialUsers = [];

  roleType = "";
  selectedUsers = [];

  connectedCallback() {
    this.roleType = this.initialRoleType ?? "";
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
    return !this.roleType || !this.hasUsers;
  }

  handleRoleTypeChange(event) {
    this.roleType = event.detail.value;
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
        detail: { roleType: this.roleType, users: [...this.selectedUsers] }
      })
    );
  }
}
