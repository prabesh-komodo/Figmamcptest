import { LightningElement, api } from 'lwc';

export interface AddRoleNextDetail {
    roleType: string;
    users: string[];
}

interface ValueChangeEvent extends CustomEvent {
    detail: { value: string };
}

/**
 * First step of the Add Role flow: shows the selected requests' scope and
 * captures one role type plus the users to give it to (picked as pills).
 * Emits `cancel`, or `next` with `{ roleType, users }`.
 */
export default class RequestUserRoleAddRoleModal extends LightningElement {
    /** e.g. "7 request(s) · 3 program(s) · 2 program type(s)" */
    @api scopeLabel = '';

    /** Role types offered in the Role Type lookup. */
    @api roleTypes: string[] = [];

    /** Users offered in the User(s) to Add lookup. */
    @api users: string[] = [];

    /** Pre-filled values, e.g. when the user comes back to this popup from the review. */
    @api initialRoleType = '';
    @api initialUsers: string[] = [];

    roleType = '';
    selectedUsers: string[] = [];

    connectedCallback(): void {
        this.roleType = this.initialRoleType ?? '';
        this.selectedUsers = [...(this.initialUsers ?? [])];
    }

    /** Users not picked yet, so the same person can't be added twice. */
    get availableUsers(): string[] {
        const picked = new Set(this.selectedUsers);
        return this.users.filter((user) => !picked.has(user));
    }

    get userPills(): Array<{ label: string; name: string }> {
        return this.selectedUsers.map((user) => ({ label: user, name: user }));
    }

    get hasUsers(): boolean {
        return this.selectedUsers.length > 0;
    }

    get isNextDisabled(): boolean {
        return !this.roleType || !this.hasUsers;
    }

    handleRoleTypeChange(event: ValueChangeEvent): void {
        this.roleType = event.detail.value;
    }

    handleUserPick(event: ValueChangeEvent): void {
        const user = event.detail.value;
        if (user && !this.selectedUsers.includes(user)) {
            this.selectedUsers = [...this.selectedUsers, user];
        }
    }

    handleUserRemove(event: Event): void {
        const user = (event.currentTarget as HTMLElement).dataset.name;
        this.selectedUsers = this.selectedUsers.filter((item) => item !== user);
    }

    handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.handleCancel();
        }
    }

    handleCancel(): void {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleNext(): void {
        if (this.isNextDisabled) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent<AddRoleNextDetail>('next', {
                detail: { roleType: this.roleType, users: [...this.selectedUsers] }
            })
        );
    }
}
