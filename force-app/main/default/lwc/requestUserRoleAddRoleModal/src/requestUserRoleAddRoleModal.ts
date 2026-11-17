import { LightningElement, api } from 'lwc';

export interface AddRoleNextDetail {
    role: string;
    users: string[];
}

interface ValueChangeEvent extends CustomEvent {
    detail: { value: string };
}

/**
 * First step of the Add Role flow: shows the selected requests' scope and
 * captures one role plus the users to give it to (picked as pills).
 * Emits `cancel`, or `next` with `{ role, users }`.
 */
export default class RequestUserRoleAddRoleModal extends LightningElement {
    /** e.g. "7 request(s) · 3 program(s) · 2 program type(s)" */
    @api scopeLabel = '';

    /** Roles offered in the Role lookup. */
    @api roles: string[] = [];

    /** Users offered in the User(s) to Add lookup. */
    @api users: string[] = [];

    /** Pre-filled values, e.g. when the user comes back to this popup from the review. */
    @api initialRole = '';
    @api initialUsers: string[] = [];

    role = '';
    selectedUsers: string[] = [];

    connectedCallback(): void {
        this.role = this.initialRole ?? '';
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
        return !this.role || !this.hasUsers;
    }

    handleRoleChange(event: ValueChangeEvent): void {
        this.role = event.detail.value;
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
                detail: { role: this.role, users: [...this.selectedUsers] }
            })
        );
    }
}
