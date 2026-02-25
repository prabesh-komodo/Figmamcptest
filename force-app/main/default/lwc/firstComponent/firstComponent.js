import { LightningElement } from 'lwc';

export default class FirstComponent extends LightningElement {
    selectedValue = '';

    statusOptions = [
        { label: 'In Progress', value: 'inProgress' },
        { label: 'Open', value: 'open' },
        { label: 'Complete', value: 'complete' },
        { label: 'Pending', value: 'pending' },
    ];

    handleStatusChange(event) {
        this.selectedValue = event.detail.value;
    }
}
