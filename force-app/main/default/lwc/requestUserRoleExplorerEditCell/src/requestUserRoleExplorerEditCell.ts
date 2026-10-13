import { LightningElement, api } from 'lwc';

export interface CellEditDetail {
    rowKey: string;
    fieldKey: string;
    /** Viewport rectangle of the cell, used to place the editor popover over it. */
    top: number;
    left: number;
    width: number;
    height: number;
}

/**
 * Datatable cell that shows a value (or grey placeholder) with a pencil button.
 * Clicking the pencil emits a bubbling, composed `celledit` event; the datatable's
 * parent owns the editor. Unlike the datatable's built-in inline edit, this only
 * ever edits the one row — bulk changes go through the selection bar.
 */
export default class RequestUserRoleExplorerEditCell extends LightningElement {
    @api value = '';
    @api placeholder = '';
    @api label = '';
    @api rowKey = '';
    @api fieldKey = '';
    @api editable = false;

    get editLabel(): string {
        return `Edit ${this.label}`;
    }

    handleEdit(): void {
        const cell = this.template.querySelector('div') as HTMLElement;
        const rect = cell.getBoundingClientRect();
        this.dispatchEvent(
            new CustomEvent<CellEditDetail>('celledit', {
                bubbles: true,
                composed: true,
                detail: {
                    rowKey: this.rowKey,
                    fieldKey: this.fieldKey,
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                }
            })
        );
    }
}
