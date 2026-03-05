import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCurrentUser from '@salesforce/apex/ContactFieldOpusController.getCurrentUser';
import getFieldSetMembers from '@salesforce/apex/ContactFieldOpusController.getFieldSetMembers';
import saveContact from '@salesforce/apex/ContactFieldOpusController.saveContact';

interface FieldSetMember {
    fieldPath: string;
    label: string;
    type: string;
    required: string;
}

interface WireResult<T> {
    data?: T;
    error?: { body?: { message?: string }; message?: string };
}

const ADDRESS_FIELD_PATHS = new Set([
    'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode', 'MailingCountry',
    'OtherStreet', 'OtherCity', 'OtherState', 'OtherPostalCode', 'OtherCountry'
]);

const DESCRIPTION_FIELD_PATHS = new Set(['Description']);

export default class ContactFieldOpus extends LightningElement {
    ownerName = '';
    accountName = '';
    isSaving = false;

    contactFields: FieldSetMember[] = [];
    addressFields: FieldSetMember[] = [];
    descriptionFields: FieldSetMember[] = [];

    @wire(getCurrentUser)
    wiredUser({ error, data }: WireResult<{ Name?: string }>) {
        if (data) {
            this.ownerName = data.Name ?? '';
        }
        if (error) {
            console.error('Error fetching user', error);
        }
    }

    @wire(getFieldSetMembers, { fieldSetName: 'ContactComposerFields' })
    wiredFieldSet({ data, error }: WireResult<FieldSetMember[]>) {
        if (data && data.length > 0) {
            const filtered = data.filter((f: FieldSetMember) => f.fieldPath !== 'AccountId');
            this.contactFields = filtered.filter(
                (f: FieldSetMember) =>
                    !ADDRESS_FIELD_PATHS.has(f.fieldPath) &&
                    !DESCRIPTION_FIELD_PATHS.has(f.fieldPath)
            );
            this.addressFields = filtered.filter((f: FieldSetMember) =>
                ADDRESS_FIELD_PATHS.has(f.fieldPath)
            );
            this.descriptionFields = filtered.filter((f: FieldSetMember) =>
                DESCRIPTION_FIELD_PATHS.has(f.fieldPath)
            );
        }
        if (error) {
            this.contactFields = [];
            this.addressFields = [];
            this.descriptionFields = [];
        }
    }

    handleAccountNameChange(event: Event) {
        this.accountName = (event.target as HTMLInputElement).value ?? '';
    }

    handleCancel() {
        const form = this.template.querySelector('lightning-record-edit-form') as HTMLElement & { reset(): void } | null;
        if (form) {
            form.reset();
        }
        this.accountName = '';
    }

    handleSubmit(event: CustomEvent<{ fields: Record<string, unknown> }>) {
        event.preventDefault();
        const fields = event.detail?.fields;
        if (!fields) return;

        this.isSaving = true;
        const contactData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && value !== null && value !== '') {
                contactData[key] =
                    typeof value === 'object' && value !== null
                        ? String(value)
                        : value;
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
                        message: 'Contact saved successfully',
                        variant: 'success'
                    })
                );
                this.handleCancel();
            })
            .catch((err: { body?: { message?: string }; message?: string }) => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error saving record',
                        message: err?.body?.message ?? err?.message ?? 'An error occurred',
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.isSaving = false;
            });
    }
}
