import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';

type PicklistOption = {
    label: string;
    value: string;
};

type ContactFormData = {
    Salutation: string;
    FirstName: string;
    MiddleName: string;
    LastName: string;
    Phone: string;
    HomePhone: string;
    OtherPhone: string;
    Title: string;
    Department: string;
    Fax: string;
    Birthdate: string;
    Email: string;
    ReportsToId: string;
    AssistantName: string;
    AssistantPhone: string;
    LeadSource: string;
    Description: string;
    MailingStreet: string;
    MailingCity: string;
    MailingState: string;
    MailingPostalCode: string;
    MailingCountry: string;
    OtherStreet: string;
    OtherCity: string;
    OtherState: string;
    OtherPostalCode: string;
    OtherCountry: string;
};

type UserInfo = {
    Id?: string;
    Name?: string;
};

const EMPTY_FORM: ContactFormData = {
    Salutation: '',
    FirstName: '',
    MiddleName: '',
    LastName: '',
    Phone: '',
    HomePhone: '',
    OtherPhone: '',
    Title: '',
    Department: '',
    Fax: '',
    Birthdate: '',
    Email: '',
    ReportsToId: '',
    AssistantName: '',
    AssistantPhone: '',
    LeadSource: '',
    Description: '',
    MailingStreet: '',
    MailingCity: '',
    MailingState: '',
    MailingPostalCode: '',
    MailingCountry: '',
    OtherStreet: '',
    OtherCity: '',
    OtherState: '',
    OtherPostalCode: '',
    OtherCountry: ''
};

export default class ContactFormGPT extends LightningElement {
    ownerName = '';
    ownerId = '';
    accountName = '';
    isSaving = false;
    leadSourceRecordId = '';
    contactRecordTypeId: string | undefined;
    salutationOptions: PicklistOption[] = [];
    form: ContactFormData = { ...EMPTY_FORM };

    @wire(getCurrentUser)
    wiredUser({ data }: { data?: UserInfo; error?: unknown }) {
        if (data) {
            this.ownerName = data.Name ?? '';
            this.ownerId = data.Id ?? '';
        }
    }

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    wiredObjectInfo({ data }: { data?: { defaultRecordTypeId?: string }; error?: unknown }) {
        if (data?.defaultRecordTypeId) {
            this.contactRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$contactRecordTypeId', fieldApiName: SALUTATION_FIELD })
    wiredSalutations({ data }: { data?: { values?: PicklistOption[] }; error?: unknown }) {
        this.salutationOptions = (data?.values ?? []).map((item) => ({
            label: item.label,
            value: item.value
        }));
    }

    handleInputChange(event: Event): void {
        const target = event.target as HTMLInputElement & { dataset?: DOMStringMap };
        const field = target.dataset?.field as keyof ContactFormData | undefined;
        const value = (event as CustomEvent).detail?.value ?? target.value ?? '';
        if (!field) {
            return;
        }
        this.form = {
            ...this.form,
            [field]: value
        };
    }

    handleReportsToChange(event: CustomEvent<{ recordId?: string }>): void {
        this.form = {
            ...this.form,
            ReportsToId: event.detail?.recordId ?? ''
        };
    }

    handleLeadSourceLookupChange(event: CustomEvent<{ recordId?: string }>): void {
        this.leadSourceRecordId = event.detail?.recordId ?? '';
    }

    handleAccountNameChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.accountName = (event as CustomEvent).detail?.value ?? target.value ?? '';
    }

    handleCancel(): void {
        this.resetForm();
    }

    async handleSave(): Promise<void> {
        if (!this.validateForm()) {
            return;
        }

        this.isSaving = true;
        try {
            await saveContact({
                contactJson: JSON.stringify(this.form),
                accountName: this.accountName || null
            });

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Contact and related account data saved successfully.',
                    variant: 'success'
                })
            );

            this.resetForm();
        } catch (error) {
            const message = (error as { body?: { message?: string } })?.body?.message || 'An error occurred while saving.';
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message,
                    variant: 'error'
                })
            );
        } finally {
            this.isSaving = false;
        }
    }

    validateForm(): boolean {
        const elements = [
            ...this.template.querySelectorAll('lightning-input'),
            ...this.template.querySelectorAll('lightning-combobox'),
            ...this.template.querySelectorAll('lightning-textarea')
        ] as Array<{ reportValidity: () => boolean }>;

        return elements.reduce((allValid, field) => field.reportValidity() && allValid, true);
    }

    resetForm(): void {
        this.form = { ...EMPTY_FORM };
        this.accountName = '';
        this.leadSourceRecordId = '';
    }
}
