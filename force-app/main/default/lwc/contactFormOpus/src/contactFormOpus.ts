import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';

interface PicklistOption {
    label: string;
    value: string;
}

export default class ContactFormOpus extends LightningElement {
    ownerName: string = '';
    ownerId: string = '';

    salutation: string = '';
    firstName: string = '';
    middleName: string = '';
    lastName: string = '';
    phone: string = '';
    homePhone: string = '';
    otherPhone: string = '';
    title: string = '';
    department: string = '';
    fax: string = '';
    birthdate: string = '';
    email: string = '';
    reportsToId: string = '';
    assistantName: string = '';
    assistantPhone: string = '';
    leadSource: string = '';
    leadSourceId: string = '';
    description: string = '';
    accountName: string = '';

    mailingStreet: string = '';
    mailingCity: string = '';
    mailingState: string = '';
    mailingPostalCode: string = '';
    mailingCountry: string = '';
    otherStreet: string = '';
    otherCity: string = '';
    otherState: string = '';
    otherPostalCode: string = '';
    otherCountry: string = '';

    isSaving: boolean = false;

    salutationOptions: PicklistOption[] = [];

    private contactRecordTypeId: string | undefined;

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

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    wiredObjectInfo({ data, error }: { data?: { defaultRecordTypeId?: string }; error?: Error }) {
        if (data) {
            this.contactRecordTypeId = data.defaultRecordTypeId;
        }
        if (error) {
            // Silently handle — picklists will be empty
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$contactRecordTypeId', fieldApiName: SALUTATION_FIELD })
    wiredSalutation({ data, error }: { data?: { values?: PicklistOption[] }; error?: Error }) {
        if (data?.values) {
            this.salutationOptions = data.values.map((v: PicklistOption) => ({
                label: v.label,
                value: v.value
            }));
        }
        if (error) {
            this.salutationOptions = [];
        }
    }

    handleInputChange(event: CustomEvent & { target: HTMLInputElement }): void {
        const field = event.target.dataset['field'] as string;
        const value = event.detail?.value ?? event.target.value ?? '';
        (this as Record<string, unknown>)[this.fieldToProperty(field)] = value;
    }

    handleReportsToChange(event: CustomEvent): void {
        this.reportsToId = event.detail?.recordId ?? '';
    }

    handleLeadSourceChange(event: CustomEvent): void {
        this.leadSourceId = event.detail?.recordId ?? '';
    }

    handleAccountNameChange(event: CustomEvent & { target: HTMLInputElement }): void {
        this.accountName = event.detail?.value ?? event.target.value ?? '';
    }

    handleCancel(): void {
        this.resetForm();
    }

    async handleSave(): Promise<void> {
        if (!this.validateForm()) {
            return;
        }

        this.isSaving = true;

        const contactData: Record<string, string> = {
            Salutation: this.salutation,
            FirstName: this.firstName,
            MiddleName: this.middleName,
            LastName: this.lastName,
            Phone: this.phone,
            HomePhone: this.homePhone,
            OtherPhone: this.otherPhone,
            Title: this.title,
            Department: this.department,
            Fax: this.fax,
            Birthdate: this.birthdate,
            Email: this.email,
            ReportsToId: this.reportsToId,
            AssistantName: this.assistantName,
            AssistantPhone: this.assistantPhone,
            LeadSource: this.leadSource,
            LeadSourceId: this.leadSourceId,
            Description: this.description,
            MailingStreet: this.mailingStreet,
            MailingCity: this.mailingCity,
            MailingState: this.mailingState,
            MailingPostalCode: this.mailingPostalCode,
            MailingCountry: this.mailingCountry,
            OtherStreet: this.otherStreet,
            OtherCity: this.otherCity,
            OtherState: this.otherState,
            OtherPostalCode: this.otherPostalCode,
            OtherCountry: this.otherCountry
        };

        try {
            await saveContact({
                contactJson: JSON.stringify(contactData),
                accountName: this.accountName || null
            });

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Contact saved successfully.',
                    variant: 'success'
                })
            );

            this.resetForm();
        } catch (err: unknown) {
            const message = (err as { body?: { message?: string } })?.body?.message ?? 'An error occurred while saving.';
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

    private validateForm(): boolean {
        const allValid = [
            ...(this.template.querySelectorAll('lightning-input') as unknown as HTMLInputElement[]),
            ...(this.template.querySelectorAll('lightning-combobox') as unknown as HTMLInputElement[]),
            ...(this.template.querySelectorAll('lightning-textarea') as unknown as HTMLInputElement[])
        ].reduce((valid: boolean, el: HTMLInputElement) => {
            const inputEl = el as unknown as { reportValidity: () => boolean };
            return inputEl.reportValidity() && valid;
        }, true);

        return allValid;
    }

    private resetForm(): void {
        this.salutation = '';
        this.firstName = '';
        this.middleName = '';
        this.lastName = '';
        this.phone = '';
        this.homePhone = '';
        this.otherPhone = '';
        this.title = '';
        this.department = '';
        this.fax = '';
        this.birthdate = '';
        this.email = '';
        this.reportsToId = '';
        this.assistantName = '';
        this.assistantPhone = '';
        this.leadSource = '';
        this.leadSourceId = '';
        this.description = '';
        this.accountName = '';
        this.mailingStreet = '';
        this.mailingCity = '';
        this.mailingState = '';
        this.mailingPostalCode = '';
        this.mailingCountry = '';
        this.otherStreet = '';
        this.otherCity = '';
        this.otherState = '';
        this.otherPostalCode = '';
        this.otherCountry = '';
    }

    private fieldToProperty(field: string): string {
        const map: Record<string, string> = {
            Salutation: 'salutation',
            FirstName: 'firstName',
            MiddleName: 'middleName',
            LastName: 'lastName',
            Phone: 'phone',
            HomePhone: 'homePhone',
            OtherPhone: 'otherPhone',
            Title: 'title',
            Department: 'department',
            Fax: 'fax',
            Birthdate: 'birthdate',
            Email: 'email',
            ReportsToId: 'reportsToId',
            AssistantName: 'assistantName',
            AssistantPhone: 'assistantPhone',
            LeadSource: 'leadSource',
            Description: 'description',
            AccountName: 'accountName',
            MailingStreet: 'mailingStreet',
            MailingCity: 'mailingCity',
            MailingState: 'mailingState',
            MailingPostalCode: 'mailingPostalCode',
            MailingCountry: 'mailingCountry',
            OtherStreet: 'otherStreet',
            OtherCity: 'otherCity',
            OtherState: 'otherState',
            OtherPostalCode: 'otherPostalCode',
            OtherCountry: 'otherCountry'
        };
        return map[field] ?? field;
    }
}
