import LightningDatatable from 'lightning/datatable';
import statusBadgeTemplate from './statusBadge.html';
import linkCellTemplate from './linkCell.html';
import editCellTemplate from './editCell.html';
import noteCellTemplate from './noteCell.html';

/**
 * lightning-datatable extended with custom cell types:
 * - `statusBadge`: renders role status values as SLDS badges. Pass the badge
 *   class through `typeAttributes: { variant: { fieldName: '<field>' } }`.
 * - `link`: renders a single-line, truncated text link. Pass
 *   `typeAttributes: { actionName: '<name>', rowKey: { fieldName: 'id' } }`;
 *   clicks surface as a bubbling `linkcellclick` event.
 * - `editCell`: shows the value (or a grey placeholder) with a pencil button.
 *   typeAttributes: `{ placeholder, label, fieldKey, editable, rowKey: { fieldName: 'id' } }`.
 *   The pencil emits a bubbling `celledit` event; the parent opens its own
 *   single-row editor (no built-in "Update N selected items" mass edit).
 * - `note`: text with an optional leading icon.
 *   typeAttributes: `{ iconName, iconVariant, textClass }` (usually per-row via fieldName).
 */
export default class RequestUserRoleExplorerDatatable extends LightningDatatable {
    static customTypes = {
        statusBadge: {
            template: statusBadgeTemplate,
            standardCellLayout: true,
            typeAttributes: ['variant']
        },
        link: {
            template: linkCellTemplate,
            standardCellLayout: true,
            typeAttributes: ['actionName', 'rowKey']
        },
        // Own layout so the cell fills the column and the pencil sits at its right edge
        // (the standard layout wraps custom cells in a shrink-to-fit box).
        editCell: {
            template: editCellTemplate,
            standardCellLayout: false,
            typeAttributes: ['placeholder', 'label', 'fieldKey', 'editable', 'rowKey']
        },
        note: {
            template: noteCellTemplate,
            standardCellLayout: true,
            typeAttributes: ['iconName', 'iconVariant', 'textClass']
        }
    };
}
