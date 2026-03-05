import { LightningElement, track, wire } from 'lwc';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import getCurrentUser from '@salesforce/apex/ContactFormSonnetController.getCurrentUser';
import saveContact from '@salesforce/apex/ContactFormSonnetController.saveContact';

interface PicklistOption {
    label: string;
    value: string;
}

interface PicklistData {
    values: PicklistOption[];
}

interface WireResult<T> {
    data?: T;
    error?: unknown;
}

interface ObjectInfoData {
    defaultRecordTypeId: string;
}

interface UserData {
    Name?: string;
    SmallPhotoUrl?: string;
}

interface FormData {
    phone: string;
    salutation: string;
    homePhone: string;
    firstName: string;
    middleName: string;
    lastName: string;
    title: string;
    otherPhone: string;
    department: string;
    fax: string;
    birthdate: string;
    email: string;
    reportsToId: string | null;
    assistant: string;
    leadSourceId: string | null;
    assistantPhone: string;
    mailingStreet: string;
    mailingCity: string;
    mailingState: string;
    mailingPostalCode: string;
    mailingCountry: string;
    otherStreet: string;
    otherCity: string;
    otherState: string;
    otherPostalCode: string;
    otherCountry: string;
    description: string;
}

const EMPTY_FORM: FormData = {
    phone: '',
    salutation: '',
    homePhone: '',
    firstName: '',
    middleName: '',
    lastName: '',
    title: '',
    otherPhone: '',
    department: '',
    fax: '',
    birthdate: '',
    email: '',
    reportsToId: null,
    assistant: '',
    leadSourceId: null,
    assistantPhone: '',
    mailingStreet: '',
    mailingCity: '',
    mailingState: '',
    mailingPostalCode: '',
    mailingCountry: '',
    otherStreet: '',
    otherCity: '',
    otherState: '',
    otherPostalCode: '',
    otherCountry: '',
    description: ''
};

export default class ContactFormSonnet extends LightningElement {
    @track formData: FormData = { ...EMPTY_FORM };
    @track ownerName: string = '';
    @track ownerPhotoUrl: string = '';
    @track salutationOptions: PicklistOption[] = [];
    @track isLoading: boolean = false;

    contactObjectInfo: WireResult<ObjectInfoData> = {};

    @wire(getCurrentUser)
    wiredUser({ data, error }: WireResult<UserData>) {
        if (data) {
            this.ownerName = data.Name ?? '';
            this.ownerPhotoUrl = data.SmallPhotoUrl ?? '';
        } else if (error) {
            this.ownerName = 'Unknown User';
        }
    }

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    wiredObjectInfo(result: WireResult<ObjectInfoData>) {
        this.contactObjectInfo = result;
    }

    @wire(getPicklistValues, {
        recordTypeId: '$contactObjectInfo.data.defaultRecordTypeId',
        fieldApiName: SALUTATION_FIELD
    })
    wiredSalutation({ data, error }: WireResult<PicklistData>) {
        if (data) {
            this.salutationOptions = [
                { label: '--None--', value: '' },
                ...data.values.map((v) => ({ label: v.label, value: v.value }))
            ];
        } else if (error) {
            this.salutationOptions = [{ label: '--None--', value: '' }];
        }
    }

    handleFieldChange(event: CustomEvent<{ value: string }>) {
        const target = event.target as HTMLElement;
        const field = target.dataset.field as keyof FormData;
        if (field) {
            (this.formData as Record<string, unknown>)[field] = event.detail.value;
        }
    }

    handleReportsToChange(event: CustomEvent<{ recordId: string | null }>) {
        this.formData = { ...this.formData, reportsToId: event.detail.recordId };
    }

    handleLeadSourceChange(event: CustomEvent<{ recordId: string | null }>) {
        this.formData = { ...this.formData, leadSourceId: event.detail.recordId };
    }

    async handleSave() {
        if (!this.formData.firstName || !this.formData.lastName) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Validation Error',
                    message: 'First Name and Last Name are required.',
                    variant: 'error'
                })
            );
            return;
        }

        this.isLoading = true;
        try {
            const contactRecord = {
                Salutation: this.formData.salutation || null,
                FirstName: this.formData.firstName,
                MiddleName: this.formData.middleName || null,
                LastName: this.formData.lastName,
                Title: this.formData.title || null,
                Phone: this.formData.phone || null,
                HomePhone: this.formData.homePhone || null,
                OtherPhone: this.formData.otherPhone || null,
                Fax: this.formData.fax || null,
                Department: this.formData.department || null,
                Birthdate: this.formData.birthdate || null,
                Email: this.formData.email || null,
                ReportsToId: this.formData.reportsToId || null,
                AssistantName: this.formData.assistant || null,
                AssistantPhone: this.formData.assistantPhone || null,
                MailingStreet: this.formData.mailingStreet || null,
                MailingCity: this.formData.mailingCity || null,
                MailingState: this.formData.mailingState || null,
                MailingPostalCode: this.formData.mailingPostalCode || null,
                MailingCountry: this.formData.mailingCountry || null,
                OtherStreet: this.formData.otherStreet || null,
                OtherCity: this.formData.otherCity || null,
                OtherState: this.formData.otherState || null,
                OtherPostalCode: this.formData.otherPostalCode || null,
                OtherCountry: this.formData.otherCountry || null,
                Description: this.formData.description || null
            };

            await saveContact({ contactRecord });

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Contact saved successfully.',
                    variant: 'success'
                })
            );

            this.resetForm();
            this.dispatchEvent(new CustomEvent('save'));
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'An error occurred while saving the contact.';
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message,
                    variant: 'error'
                })
            );
        } finally {
            this.isLoading = false;
        }
    }

    handleCancel() {
        this.resetForm();
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    private resetForm() {
        this.formData = { ...EMPTY_FORM };
    }
}
