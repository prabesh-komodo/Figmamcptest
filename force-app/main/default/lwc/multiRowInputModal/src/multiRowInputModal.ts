import LightningModal from 'lightning/modal';
import { api, track } from 'lwc';

interface InputRow {
    id: string;
    name: string;
    detail: string;
}

let rowSeq = 0;

function nextRowId(): string {
    rowSeq += 1;
    return `row-${rowSeq}`;
}

export default class MultiRowInputModal extends LightningModal {
    @api label = 'Multi-row input';

    @track rows: InputRow[] = [
        { id: nextRowId(), name: '', detail: '' }
    ];

    handleFieldChange(event: CustomEvent<{ value: string }>): void {
        const target = event.target as HTMLElement & { dataset: DOMStringMap };
        const rowId = target.dataset.rowId;
        const field = target.dataset.field as 'name' | 'detail' | undefined;
        if (!rowId || !field) {
            return;
        }
        const value = event.detail?.value ?? '';
        this.rows = this.rows.map((row) => {
            return row.id === rowId ? { ...row, [field]: value } : row;
        });
    }

    handleAddRow(): void {
        this.rows = [...this.rows, { id: nextRowId(), name: '', detail: '' }];
    }

    handleRemoveRow(event: Event): void {
        const target = event.currentTarget as HTMLElement & { dataset: DOMStringMap };
        const rowId = target.dataset.rowId;
        if (!rowId || this.rows.length <= 1) {
            return;
        }
        this.rows = this.rows.filter((row) => row.id !== rowId);
    }

    handleDone(): void {
        const result: MultiRowInputModalResult = {
            rows: this.rows.map((row) => ({
                id: row.id,
                name: row.name.trim(),
                detail: row.detail.trim()
            }))
        };
        this.close(result);
    }

    handleCancel(): void {
        this.close();
    }

    get disableRemove(): boolean {
        return this.rows.length <= 1;
    }
}
