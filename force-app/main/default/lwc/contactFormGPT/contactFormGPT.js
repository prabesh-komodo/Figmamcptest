import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';

;                      
                  
                  
  

;                       
                       
                      
                       
                     
                  
                      
                       
                  
                       
                
                      
                  
                        
                          
                           
                       
                        
                          
                        
                         
                              
                           
                        
                      
                       
                            
                         
  

;                
                
                  
  

const EMPTY_FORM                  = {
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
    contactRecordTypeId                    ;
    salutationOptions                   = [];
    form                  = { ...EMPTY_FORM };

    @wire(getCurrentUser)
    wiredUser({ data }                                      ) {
        if (data) {
            this.ownerName = data.Name ?? '';
            this.ownerId = data.Id ?? '';
        }
    }

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    wiredObjectInfo({ data }                                                              ) {
        if (data?.defaultRecordTypeId) {
            this.contactRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$contactRecordTypeId', fieldApiName: SALUTATION_FIELD })
    wiredSalutations({ data }                                                           ) {
        this.salutationOptions = (data?.values ?? []).map((item) => ({
            label: item.label,
            value: item.value
        }));
    }

    handleInputChange(event       )       {
        const target = event.target                                                 ;
        const field = target.dataset?.field                                     ;
        const value = (event               ).detail?.value ?? target.value ?? '';
        if (!field) {
            return;
        }
        this.form = {
            ...this.form,
            [field]: value
        };
    }

    handleReportsToChange(event                                    )       {
        this.form = {
            ...this.form,
            ReportsToId: event.detail?.recordId ?? ''
        };
    }

    handleLeadSourceLookupChange(event                                    )       {
        this.leadSourceRecordId = event.detail?.recordId ?? '';
    }

    handleAccountNameChange(event       )       {
        const target = event.target                    ;
        this.accountName = (event               ).detail?.value ?? target.value ?? '';
    }

    handleCancel()       {
        this.resetForm();
    }

    async handleSave()                {
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
            const message = (error                                   )?.body?.message || 'An error occurred while saving.';
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
        const elements = [
            ...this.template.querySelectorAll('lightning-input'),
            ...this.template.querySelectorAll('lightning-combobox'),
            ...this.template.querySelectorAll('lightning-textarea')
        ]                                            ;

        return elements.reduce((allValid, field) => field.reportValidity() && allValid, true);
    }

    resetForm()       {
        this.form = { ...EMPTY_FORM };
        this.accountName = '';
        this.leadSourceRecordId = '';
    }
}
