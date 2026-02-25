import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import LEAD_SOURCE_FIELD from '@salesforce/schema/Contact.LeadSource';
import getCurrentUser from '@salesforce/apex/ContactFormController.getCurrentUser';
import getReportsToOptions from '@salesforce/apex/ContactFormController.getReportsToOptions';
import saveContact from '@salesforce/apex/ContactFormController.saveContact';

type PicklistEntry = { label: string; value: string };
type ReportsToOption = { label: string; value: string };
type ContactFieldValues = Record<string, string>;

export default class AccountForm extends LightningElement {
    contactRecordTypeId: string | undefined;
    salutationOptions: PicklistEntry[] = [];
    leadSourceOptions: PicklistEntry[] = [];
    reportsToOptions: ReportsToOption[] = [];
    currentUserName = '';
    isSaving = false;

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    objectInfoWire({ data, error }: { data?: { defaultRecordTypeId?: string }; error?: unknown }) {
        if (data) {
            this.contactRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getCurrentUser)
    currentUserWire({ data, error }: { data?: { Name?: string }; error?: unknown }) {
        if (data) {
            this.currentUserName = data.Name ?? '';
        }
    }

    @wire(getPicklistValues, {
        recordTypeId: '$contactRecordTypeId',
        fieldApiName: SALUTATION_FIELD
    })
    salutationPicklistWire({ data, error }: { data?: { values: PicklistEntry[] }; error?: unknown }) {
        if (data) {
            this.salutationOptions = data.values ?? [];
        }
    }

    @wire(getPicklistValues, {
        recordTypeId: '$contactRecordTypeId',
        fieldApiName: LEAD_SOURCE_FIELD
    })
    leadSourcePicklistWire({ data, error }: { data?: { values: PicklistEntry[] }; error?: unknown }) {
        if (data) {
            this.leadSourceOptions = data.values ?? [];
        }
    }

    @wire(getReportsToOptions)
    reportsToOptionsWire({ data, error }: { data?: ReportsToOption[]; error?: unknown }) {
        if (data) {
            this.reportsToOptions = data ?? [];
        }
    }

    get salutationOptionsWithEmpty(): PicklistEntry[] {
        return [{ label: '--None--', value: '' }, ...(this.salutationOptions ?? [])];
    }

    get leadSourceOptionsWithEmpty(): PicklistEntry[] {
        return [{ label: '--None--', value: '' }, ...(this.leadSourceOptions ?? [])];
    }

    get reportsToOptionsWithEmpty(): ReportsToOption[] {
        return this.reportsToOptions?.length
            ? this.reportsToOptions
            : [{ label: '--None--', value: '' }];
    }

    handleSubmit(): void {
        this.isSaving = true;
        const fields = this.collectFieldValues();
        if (!fields.FirstName?.trim()) {
            this.showToast('Error', 'First Name is required.', 'error');
            this.isSaving = false;
            return;
        }
        if (!fields.LastName?.trim()) {
            this.showToast('Error', 'Last Name is required.', 'error');
            this.isSaving = false;
            return;
        }
        if (!fields.Phone?.trim()) {
            this.showToast('Error', 'Phone is required.', 'error');
            this.isSaving = false;
            return;
        }
        saveContact({ contactData: fields })
            .then((result: unknown) => {
                this.showToast('Success', 'Contact saved successfully.', 'success');
                this.resetForm();
                this.dispatchEvent(new CustomEvent('contactcreated', { detail: { id: result as string } }));
            })
            .catch((error: unknown) => {
                const err = error as { body?: { message?: string }; message?: string };
                const message = err.body?.message ?? err.message ?? 'Unknown error';
                this.showToast('Error Saving Contact', message, 'error');
            })
            .finally(() => {
                this.isSaving = false;
            });
    }

    collectFieldValues(): ContactFieldValues {
        const inputFields = this.template.querySelectorAll('lightning-input, lightning-combobox, lightning-textarea');
        const data: ContactFieldValues = {};
        const excludeNames = new Set(['Owner']);
        inputFields.forEach((field: Element) => {
            const el = field as HTMLInputElement & { name?: string; value?: string; checked?: boolean; type?: string; disabled?: boolean };
            const name = el.name;
            if (name && !excludeNames.has(name) && !el.disabled) {
                const val =
                    el.type === 'checkbox'
                        ? String(Boolean(el.checked))
                        : String(el.value ?? '').trim();
                if (val !== '' || name === 'FirstName' || name === 'LastName' || name === 'Phone') {
                    data[name] = val;
                }
            }
        });
        return data;
    }

    resetForm(): void {
        const inputFields = this.template.querySelectorAll('lightning-input, lightning-combobox, lightning-textarea');
        inputFields.forEach((field: Element) => {
            const el = field as HTMLInputElement & { name?: string; value?: string; checked?: boolean; type?: string };
            if (el.name === 'Owner') return;
            if (el.type === 'checkbox') {
                el.checked = false;
            } else {
                el.value = '';
            }
        });
    }

    showToast(title: string, message: string, variant: 'success' | 'error' | 'warning' | 'info'): void {
        this.dispatchEvent(
            new ShowToastEvent({ title, message, variant } as { title: string; message: string; variant: 'success' | 'error' | 'warning' | 'info' })
        );
    }
}
