import LightningModal from "lightning/modal";
import { api, track } from "lwc";

let rowSeq = 0;

function nextRowId() {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

export default class MultiRowInputModal extends LightningModal {
  @api label = "Multi-row input";

  @track rows = [{ id: nextRowId(), name: "", detail: "" }];

  handleFieldChange(event) {
    const target = event.target;
    const rowId = target.dataset.rowId;
    const field = target.dataset.field;
    if (!rowId || !field) {
      return;
    }
    const value = event.detail?.value ?? "";
    this.rows = this.rows.map((row) => {
      return row.id === rowId ? { ...row, [field]: value } : row;
    });
  }

  handleAddRow() {
    this.rows = [...this.rows, { id: nextRowId(), name: "", detail: "" }];
  }

  handleRemoveRow(event) {
    const target = event.currentTarget;
    const rowId = target.dataset.rowId;
    if (!rowId || this.rows.length <= 1) {
      return;
    }
    this.rows = this.rows.filter((row) => row.id !== rowId);
  }

  handleDone() {
    const result = {
      rows: this.rows.map((row) => ({
        id: row.id,
        name: row.name.trim(),
        detail: row.detail.trim()
      }))
    };
    this.close(result);
  }

  handleCancel() {
    this.close();
  }

  get disableRemove() {
    return this.rows.length <= 1;
  }
}
