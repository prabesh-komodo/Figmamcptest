import { LightningElement } from 'lwc';
import MultiRowInputModal from 'c/multiRowInputModal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MultiRowModalLauncher extends LightningElement {
    async handleOpenModal(): Promise<void> {
        const result = await MultiRowInputModal.open({
            label: 'Multi-row input',
            size: 'medium'
        });

        if (result?.rows?.length) {
            const summary = result.rows
                .map((r) => {
                    if (r.name || r.detail) {
                        return `${r.name}: ${r.detail}`.trim();
                    }
                    return '(empty row)';
                })
                .join('; ');
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Rows captured',
                    message: `${result.rows.length} row(s). ${summary}`.slice(0, 5000),
                    variant: 'success'
                })
            );
            this.dispatchEvent(
                new CustomEvent('rowschange', {
                    detail: { rows: result.rows }
                })
            );
        }
    }
}
