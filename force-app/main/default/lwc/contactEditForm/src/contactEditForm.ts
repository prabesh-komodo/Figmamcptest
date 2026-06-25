import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

interface RecordEditFormSuccessEvent extends CustomEvent {
    detail: { id: string };
}

interface RecordEditFormErrorEvent extends CustomEvent {
    detail: {
        message: string;
        detail?: string;
    };
}

export default class ContactEditForm extends LightningElement {
    @api recordId: string | undefined;
    activeTab = 'details';

    handleTabChange(event: CustomEvent): void {
        const target = event.target as HTMLElement & { value: string };
        this.activeTab = target.value;
    }

    handleSubmit(event: CustomEvent): void {
        event.preventDefault();
        const fields = event.detail.fields as Record<string, unknown>;
        const form = this.template.querySelector('lightning-record-edit-form') as HTMLElement & {
            submit(fields: Record<string, unknown>): void;
        };
        form.submit(fields);
    }

    handleSuccess(event: RecordEditFormSuccessEvent): void {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Contact saved successfully.',
                variant: 'success'
            })
        );
        this.dispatchEvent(new CustomEvent('save', { detail: { id: event.detail.id } }));
    }

    handleError(event: RecordEditFormErrorEvent): void {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: event.detail.message || 'An error occurred while saving.',
                variant: 'error'
            })
        );
    }

    handleCancel(): void {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
