import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';
import getFieldSetMembers from '@salesforce/apex/ContactFormOpusController.getFieldSetMembers';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';

interface FieldSetField {
    fieldPath: string;
    label: string;
    type: string;
    required: string;
}

const DEFAULT_FIELDS: string[] = [
    'Salutation', 'FirstName', 'MiddleName', 'LastName', 'Phone', 'HomePhone', 'OtherPhone',
    'Title', 'Department', 'Fax', 'Birthdate', 'Email', 'ReportsToId', 'AssistantName', 'AssistantPhone',
    'LeadSource', 'Description', 'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode',
    'MailingCountry', 'OtherStreet', 'OtherCity', 'OtherState', 'OtherPostalCode', 'OtherCountry'
];

export default class ContactFormComposer extends LightningElement {
    ownerName: string = '';
    ownerId: string = '';
    accountName: string = '';
    isSaving: boolean = false;

    fieldSetFields: FieldSetField[] = [];

    @wire(getCurrentUser)
    wiredUser({ data, error }: { data?: { Name?: string; Id?: string }; error?: Error }) {
        if (data) {
            this.ownerName = data.Name ?? '';
            this.ownerId = data.Id ?? '';
        }
        if (error) {
            this.ownerName = 'Unknown';
        }
    }

    @wire(getFieldSetMembers, { fieldSetName: 'ContactComposerFields' })
    wiredFieldSet({ data, error }: { data?: Array<{ fieldPath: string; label: string; type: string; required: string }>; error?: Error }) {
        if (data && data.length > 0) {
            this.fieldSetFields = data.filter((f) => f.fieldPath !== 'AccountId');
        } else {
            // Fallback when field set doesn't exist - use default field list
            this.fieldSetFields = DEFAULT_FIELDS.map((fp) => ({
                fieldPath: fp,
                label: fp.replace(/([A-Z])/g, ' $1').trim(),
                type: 'string',
                required: 'false'
            }));
        }
        if (error) {
            this.fieldSetFields = DEFAULT_FIELDS.map((fp) => ({
                fieldPath: fp,
                label: fp.replace(/([A-Z])/g, ' $1').trim(),
                type: 'string',
                required: 'false'
            }));
        }
    }

    handleAccountNameChange(event: CustomEvent & { target: HTMLInputElement }): void {
        this.accountName = event.detail?.value ?? event.target.value ?? '';
    }

    handleCancel(): void {
        const form = this.template.querySelector('lightning-record-edit-form');
        if (form) {
            (form as { reset: () => void }).reset();
        }
        this.accountName = '';
    }

    handleSubmit(event: CustomEvent): void {
        event.preventDefault();
        const fields = event.detail?.fields;
        if (!fields) {
            return;
        }

        this.isSaving = true;

        const contactData: Record<string, string> = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && value !== null && value !== '') {
                contactData[key] = String(value);
            }
        }

        saveContact({
            contactJson: JSON.stringify(contactData),
            accountName: this.accountName || null
        })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Contact saved successfully.',
                        variant: 'success'
                    })
                );
                this.handleCancel();
            })
            .catch((err: { body?: { message?: string } }) => {
                const message = err?.body?.message ?? 'An error occurred while saving.';
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error',
                        message,
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.isSaving = false;
            });
    }
}
