import { LightningElement } from 'lwc';

export default class DemoContact extends LightningElement {
    ownerName = 'Kristen Jane';

    phone = '';
    salutation = '';
    firstName = '';
    middleName = '';
    lastName = '';
    homePhone = '';
    title = '';
    otherPhone = '';
    department = '';
    fax = '';
    birthdate = '';
    email = '';
    reportsTo = '';
    assistant = '';
    leadSource = '';
    asstPhone = '';

    mailingStreet = '';
    mailingCity = '';
    mailingState = '';
    mailingZip = '';
    mailingCountry = '';

    otherStreet = '';
    otherCity = '';
    otherState = '';
    otherZip = '';
    otherCountry = '';

    description = '';

    salutationOptions = [
        { label: 'Mr.', value: 'Mr.' },
        { label: 'Ms.', value: 'Ms.' },
        { label: 'Mrs.', value: 'Mrs.' },
        { label: 'Dr.', value: 'Dr.' },
        { label: 'Prof.', value: 'Prof.' }
    ];

    leadSourceOptions = [
        { label: '--None--', value: '' },
        { label: 'Web', value: 'Web' },
        { label: 'Phone Inquiry', value: 'Phone Inquiry' },
        { label: 'Partner Referral', value: 'Partner Referral' },
        { label: 'Purchased List', value: 'Purchased List' },
        { label: 'Other', value: 'Other' }
    ];

    handleInputChange(event) {
        const field = event.target.name;
        const value = event.target.value;
        if (Object.prototype.hasOwnProperty.call(this, field)) {
            this[field] = value;
        }
    }

    handleOwnerClick() {
        // Dispatch custom event or open owner lookup if needed
    }
}
