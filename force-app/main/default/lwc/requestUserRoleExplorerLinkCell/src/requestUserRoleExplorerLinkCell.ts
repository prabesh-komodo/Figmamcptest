import { LightningElement, api } from 'lwc';

export interface LinkCellClickDetail {
    actionName: string;
    rowKey: string;
}

/**
 * Single-line, truncated text link rendered inside a datatable cell. Datatable
 * custom types cannot dispatch events themselves, so this cell emits a
 * bubbling, composed `linkcellclick` event that the datatable's parent handles.
 */
export default class RequestUserRoleExplorerLinkCell extends LightningElement {
    @api label = '';
    @api actionName = '';
    @api rowKey = '';

    handleClick(): void {
        this.dispatchEvent(
            new CustomEvent<LinkCellClickDetail>('linkcellclick', {
                bubbles: true,
                composed: true,
                detail: { actionName: this.actionName, rowKey: this.rowKey }
            })
        );
    }
}
