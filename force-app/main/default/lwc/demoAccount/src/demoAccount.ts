import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';

interface RecordPickerChangeEvent extends CustomEvent {
    detail: { recordId: string | null };
}

interface RecordEditFormSubmitEvent extends CustomEvent {
    detail: { fields: Record<string, unknown> };
}

interface RecordEditFormSuccessEvent extends CustomEvent {
    detail: { id: string };
}

interface RecordEditFormErrorEvent extends CustomEvent {
    detail: { detail?: string; message?: string };
}

export default class DemoAccount extends NavigationMixin(LightningElement) {
    @api recordId?: string;

    @track isSaving = false;
    @track relatesToId: string | null = null;

    handleRelatesToChange(event: RecordPickerChangeEvent): void {
        this.relatesToId = event.detail.recordId;
    }

    handleSubmit(event: RecordEditFormSubmitEvent): void {
        event.preventDefault();
        this.isSaving = true;

        const fields = event.detail?.fields ?? {};

        const form = this.template.querySelector('lightning-record-edit-form') as
            | (HTMLElement & { submit(fields: Record<string, unknown>): void })
            | null;

        if (form) {
            form.submit(fields);
        }
    }

    handleSuccess(event: RecordEditFormSuccessEvent): void {
        this.isSaving = false;
        const savedId = event.detail?.id;

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Contact saved successfully.',
                variant: 'success'
            })
        );

        if (savedId) {
            (this[NavigationMixin.Navigate] as (def: object) => void)({
                type: 'standard__recordPage',
                attributes: {
                    recordId: savedId,
                    actionName: 'view'
                }
            });
        }
    }

    handleError(event: RecordEditFormErrorEvent): void {
        this.isSaving = false;
        const message =
            event.detail?.detail ?? event.detail?.message ?? 'An error occurred while saving.';

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error saving contact',
                message,
                variant: 'error'
            })
        );
    }

    handleCancel(): void {
        this.relatesToId = null;
        this.isSaving = false;

        const form = this.template.querySelector('lightning-record-edit-form') as
            | (HTMLElement & { reset(): void })
            | null;

        form?.reset();

        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
