import { LightningElement } from 'lwc';

export default class AutoActivityCard extends LightningElement {
    handleEdit(): void {
        this.dispatchEvent(
            new CustomEvent('edit', { bubbles: true, composed: true })
        );
    }

    handleTransfer(): void {
        this.dispatchEvent(
            new CustomEvent('transfer', { bubbles: true, composed: true })
        );
    }

    handleViewActivity(): void {
        this.dispatchEvent(
            new CustomEvent('viewactivity', { bubbles: true, composed: true })
        );
    }
}
