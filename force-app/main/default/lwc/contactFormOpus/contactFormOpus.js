import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';

;                         
                  
                  
 

export default class ContactFormOpus extends LightningElement {
    ownerName         = '';
    ownerId         = '';

    salutation         = '';
    firstName         = '';
    middleName         = '';
    lastName         = '';
    phone         = '';
    homePhone         = '';
    otherPhone         = '';
    title         = '';
    department         = '';
    fax         = '';
    birthdate         = '';
    email         = '';
    reportsToId         = '';
    assistantName         = '';
    assistantPhone         = '';
    leadSource         = '';
    leadSourceId         = '';
    description         = '';
    accountName         = '';

    mailingStreet         = '';
    mailingCity         = '';
    mailingState         = '';
    mailingPostalCode         = '';
    mailingCountry         = '';
    otherStreet         = '';
    otherCity         = '';
    otherState         = '';
    otherPostalCode         = '';
    otherCountry         = '';

    isSaving          = false;

    salutationOptions                   = [];

            contactRecordTypeId                    ;

    @wire(getCurrentUser)
    wiredUser({ data, error }                                                          ) {
        if (data) {
            this.ownerName = data.Name ?? '';
            this.ownerId = data.Id ?? '';
        }
        if (error) {
            this.ownerName = 'Unknown';
        }
    }

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    wiredObjectInfo({ data, error }                                                            ) {
        if (data) {
            this.contactRecordTypeId = data.defaultRecordTypeId;
        }
        if (error) {
            // Silently handle — picklists will be empty
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$contactRecordTypeId', fieldApiName: SALUTATION_FIELD })
    wiredSalutation({ data, error }                                                         ) {
        if (data?.values) {
            this.salutationOptions = data.values.map((v                ) => ({
                label: v.label,
                value: v.value
            }));
        }
        if (error) {
            this.salutationOptions = [];
        }
    }

    handleInputChange(event                                            )       {
        const field = event.target.dataset['field']          ;
        const value = event.detail?.value ?? event.target.value ?? '';
        (this                           )[this.fieldToProperty(field)] = value;
    }

    handleReportsToChange(event             )       {
        this.reportsToId = event.detail?.recordId ?? '';
    }

    handleLeadSourceChange(event             )       {
        this.leadSourceId = event.detail?.recordId ?? '';
    }

    handleAccountNameChange(event                                            )       {
        this.accountName = event.detail?.value ?? event.target.value ?? '';
    }

    handleCancel()       {
        this.resetForm();
    }

    async handleSave()                {
        if (!this.validateForm()) {
            return;
        }

        this.isSaving = true;

        const contactData                         = {
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
        } catch (err         ) {
            const message = (err                                   )?.body?.message ?? 'An error occurred while saving.';
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

            validateForm()          {
        const allValid = [
            ...(this.template.querySelectorAll('lightning-input')                                 ),
            ...(this.template.querySelectorAll('lightning-combobox')                                 ),
            ...(this.template.querySelectorAll('lightning-textarea')                                 )
        ].reduce((valid         , el                  ) => {
            const inputEl = el                                                ;
            return inputEl.reportValidity() && valid;
        }, true);

        return allValid;
    }

            resetForm()       {
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

            fieldToProperty(field        )         {
        const map                         = {
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
