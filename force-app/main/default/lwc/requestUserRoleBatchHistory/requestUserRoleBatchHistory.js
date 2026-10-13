import { LightningElement, api } from "lwc";
import LOCALE from "@salesforce/i18n/locale";

/*
 * Batch History list: one row per Replace / De-activate / Add Role / Reversal
 * batch, newest first. Clicking a Batch ID emits `batchselect` with `{ batchId }`.
 */

/** Shape of the explorer's batch records that this list reads. */
const OPERATION_LABELS = {
  replace: "Replace",
  deactivate: "Deactivate",
  addrole: "Add Role"
};

const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"].map((value) => ({
  label: value,
  value
}));
const DEFAULT_PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const COLUMNS = [
  {
    label: "Batch ID",
    fieldName: "batchId",
    type: "link",
    sortable: true,
    typeAttributes: { actionName: "view_batch", rowKey: { fieldName: "id" } }
  },
  { label: "Operation", fieldName: "operationLabel", sortable: true },
  { label: "Performed By", fieldName: "performedBy", sortable: true },
  { label: "Performed On", fieldName: "performedOnLabel", sortable: true }
];

// Sort Performed On by the timestamp, not the formatted label.
const SORT_FIELDS = { performedOnLabel: "performedOn" };

export default class RequestUserRoleBatchHistory extends LightningElement {
  @api batches = [];

  columns = COLUMNS;
  pageSizeOptions = PAGE_SIZE_OPTIONS;
  sortedBy = "performedOnLabel";
  sortDirection = "desc";
  pageSize = DEFAULT_PAGE_SIZE;
  currentPage = 1;

  get rows() {
    const rows = this.batches.map((batch) => ({
      id: batch.batchId,
      batchId: batch.batchId,
      operationLabel:
        batch.operation === "reversal"
          ? `Reversal of ${batch.reversedBatchId ?? ""}`
          : OPERATION_LABELS[batch.operation],
      performedBy: batch.performedBy,
      performedOn: batch.performedOn,
      performedOnLabel: dateFormatter.format(new Date(batch.performedOn))
    }));
    const field = SORT_FIELDS[this.sortedBy] ?? this.sortedBy;
    const modifier = this.sortDirection === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const order = String(a[field]).localeCompare(String(b[field]), LOCALE, {
        numeric: true
      });
      // Ties (e.g. same day) fall back to the newest batch first.
      return order !== 0
        ? order * modifier
        : b.batchId.localeCompare(a.batchId, LOCALE, { numeric: true });
    });
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.batches.length / this.pageSize));
  }

  get safeCurrentPage() {
    return Math.min(this.currentPage, this.totalPages);
  }

  get pagedRows() {
    const start = (this.safeCurrentPage - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  get hasBatches() {
    return this.batches.length > 0;
  }

  get pageSizeValue() {
    return String(this.pageSize);
  }

  get showingLabel() {
    const total = this.batches.length;
    if (total === 0) {
      return "Showing 0 batch(es)";
    }
    const start = (this.safeCurrentPage - 1) * this.pageSize + 1;
    const end = Math.min(total, start + this.pageSize - 1);
    return `Showing ${start}–${end} of ${total} batch(es)`;
  }

  get pageLabel() {
    return `Page ${this.safeCurrentPage} of ${this.totalPages}`;
  }

  get isPreviousDisabled() {
    return this.safeCurrentPage <= 1;
  }

  get isNextDisabled() {
    return this.safeCurrentPage >= this.totalPages;
  }

  handleSort(event) {
    this.sortedBy = event.detail.fieldName;
    this.sortDirection = event.detail.sortDirection;
  }

  handlePageSizeChange(event) {
    this.pageSize = Number(event.detail.value) || DEFAULT_PAGE_SIZE;
    this.currentPage = 1;
  }

  handlePreviousPage() {
    this.currentPage = Math.max(1, this.safeCurrentPage - 1);
  }

  handleNextPage() {
    this.currentPage = Math.min(this.totalPages, this.safeCurrentPage + 1);
  }

  handleLinkCellClick(event) {
    event.stopPropagation();
    if (event.detail.actionName === "view_batch") {
      this.dispatchEvent(
        new CustomEvent("batchselect", {
          detail: { batchId: event.detail.rowKey }
        })
      );
    }
  }
}
