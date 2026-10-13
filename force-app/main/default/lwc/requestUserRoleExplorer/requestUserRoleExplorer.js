import { LightningElement, api } from "lwc";
import LOCALE from "@salesforce/i18n/locale";
import ILLUSTRATION_URL from "@salesforce/resourceUrl/requestUserRoleIllustration";
import {
  SAMPLE_ACTIVITIES,
  SAMPLE_BATCHES,
  SAMPLE_REQUESTS,
  SAMPLE_REQUEST_USER_ROLES,
  SAMPLE_RESTRICTED_ROLE_TYPES,
  SAMPLE_USERS
} from "./sampleData";
import {
  CLOSED_REQUEST_STATUSES,
  applyReversal,
  isReversible,
  nextBatchId,
  operationLabel,
  planReversal
} from "./batchHistory";
import {
  NO_MATCH_MESSAGE,
  NO_MATCH_TITLE,
  VIEW_DEFINITIONS
} from "./explorerViews";
/** An open activity a role's user holds on that role's request. */
/** Everything the user can change inside one view; kept per view so switching tabs preserves it. */
// Incoming base-component events
// Bubbles up from c-request-user-role-explorer-link-cell inside the datatable.
// Replace User / De-activate Role(s) flows (shapes match their flow components)
/** The reason popup that opens either flow; reason/note are pre-filled when coming back to it. */
// Add Role flow (shapes match c-request-user-role-add-role-modal / -flow)
// Batch history and reversal
// Outgoing event details
const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"].map((value) => ({
  label: value,
  value
}));

const DEFAULT_PAGE_SIZE = 20;

const VIEW_OPTIONS = [
  { label: "Request User Roles", value: "roles" },
  { label: "Requests", value: "requests" }
];

/** Simulated processing time for the sample-data batches ("Replacing Records" / "De-activating Role(s)"). */
const FLOW_PROCESSING_MS = 1500;

/** Per-flow wording for the reason popup and the selection checks. */
const FLOW_COPY = {
  replace: {
    heading: "Replace User",
    reasonLabel: "Replacement Reason",
    noun: "replacement",
    verb: "replaced",
    blockedTitle: "Can't replace user"
  },
  deactivate: {
    heading: "De-activate Role(s)",
    reasonLabel: "Deactivation Reason",
    noun: "de-activation",
    verb: "de-activated",
    blockedTitle: "Can't de-activate roles"
  }
};

const SKIP_CLOSED = "Request closed / locked";
const SKIP_NOT_PERMITTED = "Role not permitted on this request type";
const SKIP_ALREADY_HOLDS = "Already holds this role on the request";

/** Reasons offered when reversing a batch. */
const REVERSAL_REASONS = [
  "Replaced in Error",
  "Deactivated in Error",
  "Added in Error",
  "Wrong Users Selected",
  "Wrong Requests Selected",
  "Other"
];

/** Shown as the batch performer while previewing with sample data. */
const SAMPLE_PERFORMER = "Reggie Ryan";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const ILLUSTRATION_LAYERS = [
  "cloud2",
  "cloud1",
  "mountain",
  "plant1-light",
  "plant1-dark",
  "plant2",
  "sun-light",
  "sun-dark"
];

function initialViewState() {
  return {
    filters: {},
    searchTerm: "",
    selectedIds: [],
    sortedBy: "",
    sortDirection: "asc",
    pageSize: DEFAULT_PAGE_SIZE,
    currentPage: 1
  };
}

/** Field values as a list, so single- and multi-valued fields (e.g. products) filter the same way. */
function fieldValues(record, key) {
  const value = record[key];
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }
  return value === undefined || value === null || value === ""
    ? []
    : [String(value)];
}

export default class RequestUserRoleExplorer extends LightningElement {
  /** Role records. When omitted, sample data is shown if `showSampleData` is set. */
  @api
  get records() {
    return this.providedRecords;
  }
  set records(value) {
    this.providedRecords = value;
    this.workingRoles = null;
  }

  /** Open activities held on roles; drives the "Resolve activities" step of Replace User. */
  @api
  get activities() {
    return this.providedActivities;
  }
  set activities(value) {
    this.providedActivities = value;
    this.workingActivities = null;
  }

  /** Users offered as replacements. Defaults to every assigned user (plus sample users in sample mode). */
  @api users;

  /** Request records. When omitted, sample data is shown if `showSampleData` is set. */
  @api requests;

  @api headerTitle = "Request User Role Administration";

  @api showSampleData = false;

  /**
   * Program type → role types that can't be added to its requests. Defaults to
   * the sample restrictions in sample mode, otherwise none.
   */
  @api restrictedRoleTypes;

  /** Batch history (Replace / De-activate / Add Role / Reversal runs). Sample batches are used in sample mode. */
  @api
  get batches() {
    return this.providedBatches;
  }
  set batches(value) {
    this.providedBatches = value;
    this.workingBatches = null;
  }

  /** Name recorded as "Performed by" on new batches. */
  @api performedBy = "";

  /** View shown on load (or set by a parent). The toolbar toggle switches views internally. */
  @api
  get selectedView() {
    return this.activeView;
  }
  set selectedView(value) {
    this.activeView = value === "requests" ? "requests" : "roles";
  }

  providedRecords;
  providedActivities;
  providedBatches;
  workingBatches = null;
  // Local copies updated by a completed replacement, so the grid reflects it immediately.
  workingRoles = null;
  workingActivities = null;

  toast = null;

  // Replace User / De-activate Role(s) flows
  reasonModal = null;
  // Add Role flow (from the Requests view)
  addRoleModal = null;
  addRoleContext = null;
  // Batch history pages and the Reverse Batch flow
  page = "grid";
  selectedBatchId = "";
  reversalReasonModal = null;
  reversalContext = null;
  flowContext = null;
  isProcessing = false;
  flowBatchId = "";
  flowEffectiveDate = "";

  activeView = "roles";
  viewState = { roles: initialViewState(), requests: initialViewState() };
  isFilterPanelOpen = true;
  pageSizeOptions = PAGE_SIZE_OPTIONS;

  // ---------------------------------------------------------------- view

  get view() {
    return VIEW_DEFINITIONS[this.activeView];
  }

  get state() {
    return this.viewState[this.activeView];
  }

  updateState(patch) {
    this.viewState = {
      ...this.viewState,
      [this.activeView]: { ...this.state, ...patch }
    };
  }

  /** Toolbar view toggle: the active view renders as the brand button. */
  get viewButtons() {
    return VIEW_OPTIONS.map((option) => ({
      ...option,
      variant: option.value === this.activeView ? "brand" : "neutral"
    }));
  }

  get columns() {
    return this.view.columns;
  }

  get tableTitle() {
    return this.view.tableTitle;
  }

  get regionLabel() {
    return this.view.regionLabel;
  }

  get selectionActions() {
    return this.view.actions;
  }

  // ----------------------------------------------------------------- toast

  get toastClass() {
    return `slds-notify slds-notify_toast slds-theme_${this.toast?.variant ?? "info"}`;
  }

  get toastIcon() {
    return `utility:${this.toast?.variant ?? "info"}`;
  }

  /** Warning toasts use dark text, so the icon and close button stay dark too. */
  get toastIconVariant() {
    return this.toast?.variant === "warning" ? "" : "inverse";
  }

  get toastCloseVariant() {
    return this.toast?.variant === "warning" ? "bare" : "bare-inverse";
  }

  showToast(toast) {
    this.toast = toast;
  }

  handleToastClose() {
    this.toast = null;
  }

  // --------------------------------------------- replace user / de-activate

  get selectedRoles() {
    if (this.activeView !== "roles") {
      return [];
    }
    const selected = new Set(this.selectedFilteredIds);
    return this.roleRecords.filter((role) => selected.has(role.id));
  }

  /** Why a flow can't run for the current selection (empty when it can). */
  flowBlockers(mode) {
    const roles = this.selectedRoles;
    const { verb } = FLOW_COPY[mode];
    const blockers = [];
    const inactive = roles.filter(
      (role) => role.roleStatus !== "Active"
    ).length;
    if (inactive > 0) {
      blockers.push(
        `${inactive} of the selected roles ${inactive === 1 ? "is" : "are"} inactive. Only active roles can be ${verb}.`
      );
    }
    const users = new Set(roles.map((role) => role.assignedUser)).size;
    if (users > 1) {
      blockers.push(
        `The selected roles belong to ${users} different users. Select roles held by a single user to handle them together.`
      );
    }
    return blockers;
  }

  get flowCurrentUser() {
    return this.selectedRoles[0]?.assignedUser ?? "";
  }

  get flowScopeLabel() {
    const roles = this.selectedRoles;
    const requests = new Set(roles.map((role) => role.requestId)).size;
    const roleTypes = new Set(roles.map((role) => role.roleType)).size;
    return `${requests} distinct request(s) · ${roleTypes} role type(s) · ${roles.length} record(s)`;
  }

  get isFlowActive() {
    return (
      this.flowContext !== null ||
      this.addRoleContext !== null ||
      this.reversalContext !== null
    );
  }

  /** Toolbar shows a back button + title instead of the grid controls. */
  get showBackBar() {
    return this.isFlowActive || this.page !== "grid";
  }

  get isReversalFlow() {
    return this.reversalContext !== null;
  }

  get isBatchHistoryPage() {
    return !this.isFlowActive && this.page === "history";
  }

  get isBatchDetailPage() {
    return !this.isFlowActive && this.page === "detail";
  }

  get isAddRoleFlow() {
    return this.addRoleContext !== null;
  }

  get flowBackLabel() {
    if (this.isReversalFlow) {
      return "Back to Batch Details";
    }
    if (this.isAddRoleFlow) {
      return "Back to Requests List";
    }
    if (this.isFlowActive) {
      return "Back to Request User Roles List";
    }
    if (this.page === "detail") {
      const batch = this.selectedBatch;
      return batch
        ? `${batch.batchId} · ${operationLabel(batch, "title")}`
        : "Batch Details";
    }
    return "Batch History";
  }

  /** Back button label for screen readers when the bar shows a page title rather than "Back to …". */
  get flowBackAssistiveText() {
    if (this.isFlowActive) {
      return this.flowBackLabel;
    }
    return this.page === "detail"
      ? "Back to Batch History"
      : "Back to Request User Roles List";
  }

  get showBatchActions() {
    return !this.isFlowActive && this.page !== "grid";
  }

  get showReverseBatch() {
    return this.showBatchActions && this.page === "detail";
  }

  get isReverseBatchDisabled() {
    const batch = this.selectedBatch;
    return !batch || !isReversible(batch);
  }

  get isReplaceFlow() {
    return this.flowContext?.mode === "replace";
  }

  get isDeactivateFlow() {
    return this.flowContext?.mode === "deactivate";
  }

  get toolbarLabel() {
    if (this.isReversalFlow) {
      return "Reverse batch navigation";
    }
    if (this.isAddRoleFlow) {
      return "Add role navigation";
    }
    if (this.page !== "grid" && !this.isFlowActive) {
      return "Batch history actions";
    }
    if (!this.flowContext) {
      return "Request user role actions";
    }
    return this.isReplaceFlow
      ? "Replace user navigation"
      : "De-activate roles navigation";
  }

  // -------------------------------------------------------- batch history

  get batchRecords() {
    if (this.workingBatches) {
      return this.workingBatches;
    }
    if (this.providedBatches) {
      return this.providedBatches;
    }
    return this.showSampleData ? SAMPLE_BATCHES : [];
  }

  get selectedBatch() {
    return this.batchRecords.find(
      (batch) => batch.batchId === this.selectedBatchId
    );
  }

  get performer() {
    return this.performedBy || (this.showSampleData ? SAMPLE_PERFORMER : "");
  }

  get reversalReasons() {
    return REVERSAL_REASONS;
  }

  get isReversalReasonModalOpen() {
    return this.reversalReasonModal !== null;
  }

  get reversalHeading() {
    return `Reverse Batch · ${this.selectedBatchId}`;
  }

  get reversalScopeLabel() {
    return `${this.selectedBatch?.roleChanges.length ?? 0} record(s) will be affected.`;
  }

  get reversalOperationTitle() {
    const batch = this.selectedBatch;
    return batch ? operationLabel(batch, "title") : "";
  }

  // ------------------------------------------------------------- add role

  get selectedRequests() {
    if (this.activeView !== "requests") {
      return [];
    }
    const selected = new Set(this.selectedFilteredIds);
    return this.requestRecords.filter((request) => selected.has(request.id));
  }

  get addRoleScopeLabel() {
    const requests = this.selectedRequests;
    const programs = new Set(requests.map((request) => request.programName))
      .size;
    const programTypes = new Set(requests.map((request) => request.programType))
      .size;
    return `${requests.length} request(s) · ${programs} program(s) · ${programTypes} program type(s)`;
  }

  get isAddRoleModalOpen() {
    return this.addRoleModal !== null;
  }

  /** Role types offered by Add Role: every type already in use. */
  get roleTypeOptions() {
    return Array.from(
      new Set(this.roleRecords.map((role) => role.roleType))
    ).sort((a, b) => a.localeCompare(b));
  }

  get roleRestrictions() {
    return (
      this.restrictedRoleTypes ??
      (this.showSampleData ? SAMPLE_RESTRICTED_ROLE_TYPES : {})
    );
  }

  /**
   * One entry per selected request × user. A pair is skipped when the request
   * is closed, the role type isn't allowed on its program type, or the user
   * already holds an active role of that type on the request.
   */
  addRolePlan(requests, roleType, users) {
    const held = new Set(
      this.roleRecords
        .filter(
          (role) => role.roleStatus === "Active" && role.roleType === roleType
        )
        .map((role) => `${role.requestId}|${role.assignedUser}`)
    );
    const restrictions = this.roleRestrictions;
    return requests.flatMap((request) =>
      users.map((user) => {
        let skipReason = "";
        if (CLOSED_REQUEST_STATUSES.has(request.requestStatus)) {
          skipReason = SKIP_CLOSED;
        } else if (
          (restrictions[request.programType] ?? []).includes(roleType)
        ) {
          skipReason = SKIP_NOT_PERMITTED;
        } else if (held.has(`${request.requestId}|${user}`)) {
          skipReason = SKIP_ALREADY_HOLDS;
        }
        return {
          id: `${request.id}|${user}`,
          requestId: request.requestId,
          programName: request.programName,
          programType: request.programType,
          roleType,
          user,
          skipReason
        };
      })
    );
  }

  get isReasonModalOpen() {
    return this.reasonModal !== null;
  }

  get reasonModalCopy() {
    return FLOW_COPY[this.reasonModal?.mode ?? "replace"];
  }

  /** Open activities on the given roles that the outgoing user still holds. */
  pendingActivitiesFor(roles, currentUser) {
    const roleIds = new Set(roles.map((role) => role.id));
    return this.activityRecords.filter(
      (activity) =>
        roleIds.has(activity.roleId) && activity.assignedUser === currentUser
    );
  }

  get selectedIds() {
    return this.state.selectedIds;
  }

  get sortedBy() {
    return this.state.sortedBy;
  }

  get sortDirection() {
    return this.state.sortDirection;
  }

  // ---------------------------------------------------------------- data

  get roleRecords() {
    if (this.workingRoles) {
      return this.workingRoles;
    }
    if (this.providedRecords) {
      return this.providedRecords;
    }
    return this.showSampleData ? SAMPLE_REQUEST_USER_ROLES : [];
  }

  get activityRecords() {
    if (this.workingActivities) {
      return this.workingActivities;
    }
    if (this.providedActivities) {
      return this.providedActivities;
    }
    return this.showSampleData ? SAMPLE_ACTIVITIES : [];
  }

  get userOptions() {
    if (this.users) {
      return this.users;
    }
    const assigned = this.roleRecords.map((role) => role.assignedUser);
    const all = this.showSampleData ? [...assigned, ...SAMPLE_USERS] : assigned;
    return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
  }

  get requestRecords() {
    if (this.requests) {
      return this.requests;
    }
    return this.showSampleData ? SAMPLE_REQUESTS : [];
  }

  get sourceRecords() {
    return this.activeView === "requests"
      ? this.requestRecords
      : this.roleRecords;
  }

  get hasSourceRecords() {
    return this.sourceRecords.length > 0;
  }

  get filteredRecords() {
    const activeFilters = Object.entries(this.state.filters).filter(
      ([, values]) => values.length > 0
    );
    const search = this.view.search;
    const term = this.state.searchTerm.trim().toLowerCase();

    const filtered = this.sourceRecords.filter(
      (record) =>
        activeFilters.every(([key, values]) =>
          fieldValues(record, key).some((value) => values.includes(value))
        ) &&
        (!search ||
          !term ||
          fieldValues(record, search.key).some((value) =>
            value.toLowerCase().includes(term)
          ))
    );

    return this.state.sortedBy ? this.sortRecords(filtered) : filtered;
  }

  get hasFilteredRecords() {
    return this.filteredRecords.length > 0;
  }

  get totalPages() {
    return Math.max(
      1,
      Math.ceil(this.filteredRecords.length / this.state.pageSize)
    );
  }

  get safeCurrentPage() {
    return Math.min(this.state.currentPage, this.totalPages);
  }

  get pagedRows() {
    const { pageSize } = this.state;
    const start = (this.safeCurrentPage - 1) * pageSize;
    return this.filteredRecords
      .slice(start, start + pageSize)
      .map((record) => this.view.toRow(record));
  }

  // ------------------------------------------------------------- filters

  get searchFilter() {
    return this.view.search;
  }

  get searchTerm() {
    return this.state.searchTerm;
  }

  get filters() {
    return this.view.filters.map(({ key, label }) => {
      const selected = this.state.filters[key] ?? [];
      const options = Array.from(
        new Set(
          this.sourceRecords.flatMap((record) => fieldValues(record, key))
        )
      )
        .filter((value) => !selected.includes(value))
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value }));

      return {
        key,
        label,
        name: `filter-${key}`,
        options,
        pills: selected.map((value) => ({ label: value, name: value })),
        hasPills: selected.length > 0,
        isDisabled: options.length === 0
      };
    });
  }

  get hasActiveFilters() {
    return (
      Object.values(this.state.filters).some((values) => values.length > 0) ||
      this.state.searchTerm.trim() !== ""
    );
  }

  // ------------------------------------------------------------- summary

  get stats() {
    return this.view.stats(this.filteredRecords, { roles: this.roleRecords });
  }

  // ----------------------------------------------------------- selection

  get selectedFilteredIds() {
    const visibleIds = new Set(this.filteredRecords.map((record) => record.id));
    return this.state.selectedIds.filter((id) => visibleIds.has(id));
  }

  get hasSelection() {
    return this.selectedFilteredIds.length > 0;
  }

  get selectionLabel() {
    return this.view.selectionLabel(
      this.selectedFilteredIds.length,
      this.filteredRecords.length
    );
  }

  get selectionBarClass() {
    const base =
      "slds-grid slds-grid_vertical-align-center slds-shrink-none slds-border_bottom slds-p-left_small slds-p-right_x-small selection-bar";
    return this.hasSelection ? `${base} selection-bar_active` : base;
  }

  // ---------------------------------------------------------- pagination

  get pageSizeValue() {
    return String(this.state.pageSize);
  }

  get showingLabel() {
    const { pageSize } = this.state;
    const total = this.filteredRecords.length;
    const start = total === 0 ? 0 : (this.safeCurrentPage - 1) * pageSize + 1;
    const end = Math.min(this.safeCurrentPage * pageSize, total);
    return `Showing ${start}–${end} of ${total} ${this.view.recordNoun}`;
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

  // --------------------------------------------------------- empty state

  get emptyStateTitle() {
    return this.hasSourceRecords ? NO_MATCH_TITLE : this.view.emptyTitle;
  }

  get emptyStateMessage() {
    return this.hasSourceRecords ? NO_MATCH_MESSAGE : this.view.emptyMessage;
  }

  get illustrationLayers() {
    return ILLUSTRATION_LAYERS.map((name) => ({
      key: name,
      className: `illustration__layer illustration__layer_${name}`,
      src: `${ILLUSTRATION_URL}/${name}.svg`
    }));
  }

  get isExportDisabled() {
    return !this.hasFilteredRecords;
  }

  // ------------------------------------------------------------ handlers

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  /** Header "Batch History": leaves any open flow (unless it's mid-batch) and shows the history list. */
  handleBatchHistory() {
    if (this.isProcessing) {
      return;
    }
    this.closeFlows();
    this.toast = null;
    this.page = "history";
    this.dispatchEvent(new CustomEvent("batchhistory"));
  }

  /** Toolbar back button: leaves the open flow, or steps back Batch Detail → History → grid. */
  handleToolbarBack() {
    if (this.isProcessing) {
      return;
    }
    if (this.isReversalFlow) {
      this.handleReversalExit();
    } else if (this.isFlowActive) {
      this.handleFlowExit();
    } else if (this.page === "detail") {
      this.page = "history";
    } else {
      this.page = "grid";
    }
  }

  handleBatchSelect(event) {
    this.selectedBatchId = event.detail.batchId;
    this.page = "detail";
  }

  handleBatchExport() {
    const batchIds =
      this.page === "detail"
        ? [this.selectedBatchId]
        : this.batchRecords.map((batch) => batch.batchId);
    this.dispatchEvent(
      new CustomEvent("batchexport", { detail: { batchIds } })
    );
  }

  handleReverseBatch() {
    if (!this.isReverseBatchDisabled) {
      this.reversalReasonModal = { reason: "", note: "" };
    }
  }

  handleReversalReasonCancel() {
    this.reversalReasonModal = null;
  }

  handleReversalReasonNext(event) {
    const batch = this.selectedBatch;
    this.reversalReasonModal = null;
    if (!batch) {
      return;
    }
    this.flowBatchId = "";
    this.flowEffectiveDate = "";
    this.reversalContext = {
      batchId: batch.batchId,
      reason: event.detail.reason,
      note: event.detail.note,
      entries: planReversal(
        batch,
        this.roleRecords,
        this.requestRecords,
        todayIso()
      )
    };
  }

  handleReversalInitiate() {
    const context = this.reversalContext;
    const batch = this.selectedBatch;
    if (!context || !batch) {
      return;
    }
    this.runBatch((batchId, effectiveDate, performedOn) => {
      // Reversals take effect on the day they run.
      const entries = context.entries.map((entry) => ({
        ...entry,
        effectiveDate
      }));
      const result = applyReversal(
        batch,
        entries,
        {
          roles: this.roleRecords,
          activities: this.activityRecords,
          batches: this.batchRecords
        },
        {
          batchId,
          performedBy: this.performer,
          performedOn,
          reason: context.reason,
          note: context.note
        }
      );
      this.workingRoles = result.roles;
      this.workingActivities = result.activities;
      this.workingBatches = result.batches;
      this.reversalContext = { ...context, entries };
      this.dispatchEvent(
        new CustomEvent("reversebatch", {
          detail: {
            batchId: batch.batchId,
            reversalBatchId: batchId,
            reason: context.reason,
            note: context.note,
            reversed: entries
              .filter((entry) => !entry.skipReason)
              .map((entry) => ({
                changeId: entry.id,
                requestId: entry.requestId,
                effectiveDate: entry.effectiveDate
              })),
            skipped: entries
              .filter((entry) => entry.skipReason)
              .map((entry) => ({
                changeId: entry.id,
                requestId: entry.requestId,
                reason: entry.skipReason
              }))
          }
        })
      );
    });
  }

  /** Back from the reversal review reopens the reason popup with the earlier answers. */
  handleReversalBack() {
    const context = this.reversalContext;
    if (!context || this.isProcessing) {
      return;
    }
    this.reversalContext = null;
    this.reversalReasonModal = { reason: context.reason, note: context.note };
  }

  /** Leave the reversal flow for the batch's detail page (which then shows the reversed statuses). */
  handleReversalExit() {
    if (this.isProcessing) {
      return;
    }
    this.reversalContext = null;
    this.flowBatchId = "";
    this.flowEffectiveDate = "";
    this.page = "detail";
  }

  /** Breadcrumb "Batch History" in the reversal flow. */
  handleReversalHistory() {
    this.handleReversalExit();
    this.page = "history";
  }

  closeFlows() {
    this.flowContext = null;
    this.addRoleContext = null;
    this.reversalContext = null;
    this.reasonModal = null;
    this.addRoleModal = null;
    this.reversalReasonModal = null;
    this.flowBatchId = "";
    this.flowEffectiveDate = "";
  }

  handleFilterPanelToggle() {
    this.isFilterPanelOpen = !this.isFilterPanelOpen;
  }

  handleFilterPanelClose() {
    this.isFilterPanelOpen = false;
  }

  handleViewSelect(event) {
    const view = event.currentTarget.dataset.view;
    if (view === this.activeView) {
      return;
    }
    this.activeView = view;
    this.dispatchEvent(new CustomEvent("viewchange", { detail: { view } }));
  }

  handleExport() {
    this.dispatchEvent(
      new CustomEvent("export", {
        detail: {
          view: this.activeView,
          recordIds: this.filteredRecords.map((record) => record.id),
          filters: { ...this.state.filters },
          searchTerm: this.state.searchTerm
        }
      })
    );
  }

  handleSearchChange(event) {
    this.updateState({ searchTerm: event.detail.value ?? "", currentPage: 1 });
  }

  handleFilterChange(event) {
    const combobox = event.currentTarget;
    const key = combobox.dataset.key;
    const value = event.detail.value;
    const current = this.state.filters[key] ?? [];

    if (value && !current.includes(value)) {
      this.updateState({
        filters: { ...this.state.filters, [key]: [...current, value] },
        currentPage: 1
      });
    }
    // The combobox only adds values; selections are shown as pills below it.
    combobox.value = null;
  }

  handlePillRemove(event) {
    const key = event.currentTarget.dataset.key;
    const removed = event.detail.item.name;
    this.updateState({
      filters: {
        ...this.state.filters,
        [key]: (this.state.filters[key] ?? []).filter(
          (value) => value !== removed
        )
      },
      currentPage: 1
    });
  }

  handleClearFilters() {
    this.updateState({ filters: {}, searchTerm: "", currentPage: 1 });
  }

  handleRowSelection(event) {
    this.toast = null;
    const pageIds = new Set(this.pagedRows.map((row) => row.id));
    const selectedOnPage = event.detail.selectedRows.map((row) => row.id);
    this.updateState({
      selectedIds: [
        ...this.state.selectedIds.filter((id) => !pageIds.has(id)),
        ...selectedOnPage
      ]
    });
  }

  handleClearSelection() {
    this.toast = null;
    this.updateState({ selectedIds: [] });
  }

  /** Selection-bar buttons (Replace User, Deactivate, Add Roles) dispatch their configured event. */
  handleSelectionAction(event) {
    const eventName = event.currentTarget.dataset.event;
    if (eventName === "replaceuser" || eventName === "deactivate") {
      // Both are guided flows; their events are dispatched once the flow completes.
      const mode = eventName === "replaceuser" ? "replace" : "deactivate";
      const blockers = this.flowBlockers(mode);
      if (blockers.length > 0) {
        this.showToast({
          variant: "warning",
          title: FLOW_COPY[mode].blockedTitle,
          message: blockers.join(" ")
        });
        return;
      }
      if (this.selectedRoles.length > 0) {
        this.toast = null;
        this.reasonModal = { mode, reason: "", note: "" };
      }
      return;
    }
    if (eventName === "addroles") {
      // Guided flow; `addroles` is dispatched once the roles are created.
      if (this.selectedRequests.length > 0) {
        this.toast = null;
        this.addRoleModal = { roleType: "", users: [] };
      }
      return;
    }
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail: { view: this.activeView, recordIds: this.selectedFilteredIds }
      })
    );
  }

  handleAddRoleCancel() {
    this.addRoleModal = null;
  }

  handleAddRoleNext(event) {
    const { roleType, users } = event.detail;
    this.addRoleModal = null;
    this.flowBatchId = "";
    this.flowEffectiveDate = "";
    this.addRoleContext = {
      roleType,
      users,
      scopeLabel: this.addRoleScopeLabel,
      entries: this.addRolePlan(this.selectedRequests, roleType, users)
    };
  }

  handleAddRoleInitiate() {
    const context = this.addRoleContext;
    if (!context) {
      return;
    }
    this.runBatch((batchId, effectiveDate, performedOn) => {
      const created = this.applyAddRoles(context, batchId, effectiveDate);
      const programs = new Map(
        context.entries.map((entry) => [entry.requestId, entry.programName])
      );
      this.recordBatch({
        batchId,
        operation: "addrole",
        performedBy: this.performer,
        performedOn,
        reason: "",
        note: "",
        roleChanges: created.map((item, index) => ({
          id: `${batchId}-${index + 1}`,
          roleType: context.roleType,
          requestId: item.requestId,
          programName: programs.get(item.requestId) ?? "",
          previousUser: "",
          newUser: item.user,
          effectiveDate,
          activeRoleId: item.roleId,
          status: "Active"
        })),
        activityChanges: []
      });
      this.dispatchEvent(
        new CustomEvent("addroles", {
          detail: {
            batchId,
            roleType: context.roleType,
            users: context.users,
            effectiveDate,
            created,
            skipped: context.entries
              .filter((entry) => entry.skipReason)
              .map((entry) => ({
                requestId: entry.requestId,
                user: entry.user,
                reason: entry.skipReason
              }))
          }
        })
      );
    });
  }

  /** Back from the review reopens the Add Role popup with the same picks. */
  handleAddRoleBack() {
    const context = this.addRoleContext;
    if (!context || this.isProcessing) {
      return;
    }
    this.addRoleContext = null;
    this.addRoleModal = { roleType: context.roleType, users: context.users };
  }

  handleSort(event) {
    this.updateState({
      sortedBy: event.detail.fieldName,
      sortDirection: event.detail.sortDirection
    });
  }

  handleLinkCellClick(event) {
    event.stopPropagation();
    const { actionName, rowKey } = event.detail;
    const row = this.sourceRecords.find((record) => record.id === rowKey);
    if (!row) {
      return;
    }
    if (actionName === "view_request") {
      this.dispatchEvent(
        new CustomEvent("requestselect", {
          detail: { recordId: row.id, requestId: row.requestId }
        })
      );
    } else if (actionName === "view_program") {
      this.dispatchEvent(
        new CustomEvent("programselect", {
          detail: { recordId: row.id, programName: row.programName }
        })
      );
    }
  }

  handlePageSizeChange(event) {
    this.updateState({
      pageSize: Number(event.detail.value) || DEFAULT_PAGE_SIZE,
      currentPage: 1
    });
  }

  handlePreviousPage() {
    this.updateState({ currentPage: Math.max(1, this.safeCurrentPage - 1) });
  }

  handleNextPage() {
    this.updateState({
      currentPage: Math.min(this.totalPages, this.safeCurrentPage + 1)
    });
  }

  handleReasonCancel() {
    this.reasonModal = null;
  }

  handleReasonNext(event) {
    const mode = this.reasonModal?.mode ?? "replace";
    const roles = this.selectedRoles;
    const currentUser = this.flowCurrentUser;
    this.reasonModal = null;
    this.flowBatchId = "";
    this.flowEffectiveDate = "";
    this.flowContext = {
      mode,
      currentUser,
      reason: event.detail.reason,
      note: event.detail.note,
      activities: this.pendingActivitiesFor(roles, currentUser),
      roles: roles.map(
        ({ id, roleName, roleType, requestId, programName, assignedUser }) => ({
          id,
          roleName,
          roleType,
          requestId,
          programName,
          assignedUser
        })
      )
    };
  }

  handleFlowInitiate(event) {
    const detail = event.detail;
    const context = this.flowContext;
    const currentUser = context?.currentUser ?? "";
    this.runBatch((batchId, effectiveDate, performedOn) => {
      const roleChanges = detail.replacements.map((item, index) => {
        const role = context?.roles.find(
          (candidate) => candidate.id === item.roleId
        );
        return this.roleChange(batchId, index, role, {
          previousUser: currentUser,
          newUser: item.newUser,
          effectiveDate,
          endedRoleId: item.roleId,
          activeRoleId: `${item.roleId}-${batchId}`
        });
      });
      // Recorded before applying, while activities still show their previous owner.
      const activityChanges = this.activityChanges(
        batchId,
        detail.activityActions,
        "Assign to Replacing User"
      );
      this.applyReplacement(detail, batchId, effectiveDate);
      this.recordBatch({
        batchId,
        operation: "replace",
        performedBy: this.performer,
        performedOn,
        reason: detail.reason,
        note: detail.note,
        roleChanges,
        activityChanges
      });
      this.dispatchEvent(
        new CustomEvent("replaceuser", {
          detail: { ...detail, batchId, currentUser, effectiveDate }
        })
      );
    });
  }

  handleDeactivateInitiate(event) {
    const detail = event.detail;
    const context = this.flowContext;
    const currentUser = context?.currentUser ?? "";
    this.runBatch((batchId, effectiveDate, performedOn) => {
      const roleChanges = detail.roleIds.map((roleId, index) => {
        const role = context?.roles.find(
          (candidate) => candidate.id === roleId
        );
        return this.roleChange(batchId, index, role, {
          previousUser: currentUser,
          newUser: "",
          effectiveDate,
          endedRoleId: roleId
        });
      });
      const activityChanges = this.activityChanges(
        batchId,
        detail.activityActions,
        "Assign to New User"
      );
      this.applyDeactivation(detail, effectiveDate);
      this.recordBatch({
        batchId,
        operation: "deactivate",
        performedBy: this.performer,
        performedOn,
        reason: detail.reason,
        note: detail.note,
        roleChanges,
        activityChanges
      });
      this.dispatchEvent(
        new CustomEvent("deactivate", {
          detail: { ...detail, batchId, currentUser, effectiveDate }
        })
      );
    });
  }

  /** Runs a flow's batch (simulated for sample data), then switches the flow to its completion view. */
  runBatch(apply) {
    if (!this.isFlowActive || this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    // eslint-disable-next-line @lwc/lwc/no-async-operation -- simulates the server-side batch for sample data
    setTimeout(() => {
      const batchId = nextBatchId(this.batchRecords);
      const effectiveDate = todayIso();
      apply(batchId, effectiveDate, new Date().toISOString());
      this.flowBatchId = batchId;
      this.flowEffectiveDate = effectiveDate;
      this.isProcessing = false;
    }, FLOW_PROCESSING_MS);
  }

  /**
   * Leave the flow. After a completed replacement the old selection no longer
   * applies (the roles were superseded); de-activated roles and the requests that
   * got new roles stay selected, as in the designs.
   */
  handleFlowExit() {
    if (this.isProcessing) {
      return;
    }
    if (this.flowBatchId && this.isReplaceFlow) {
      this.updateState({ selectedIds: [] });
    }
    this.flowContext = null;
    this.addRoleContext = null;
    this.flowBatchId = "";
    this.flowEffectiveDate = "";
  }

  /** Back from the flow's first step reopens its reason popup with the earlier answers. */
  handleFlowBack() {
    const context = this.flowContext;
    if (!context || this.isProcessing) {
      return;
    }
    this.flowContext = null;
    this.reasonModal = {
      mode: context.mode,
      reason: context.reason,
      note: context.note
    };
  }

  handleFlowRequestSelect(event) {
    this.dispatchEvent(
      new CustomEvent("requestselect", { detail: event.detail })
    );
  }

  handleFlowProgramSelect(event) {
    this.dispatchEvent(
      new CustomEvent("programselect", { detail: event.detail })
    );
  }

  /**
   * Ends each replaced role (Inactive, end date = effective date), adds a
   * matching active role for the new user, and reassigns activities whose
   * action is "Assign to Replacing User".
   */
  applyReplacement(detail, batchId, effectiveDate) {
    const newUserByRole = new Map(
      detail.replacements.map((item) => [item.roleId, item.newUser])
    );
    const roles = [];
    this.roleRecords.forEach((role) => {
      const newUser = newUserByRole.get(role.id);
      if (!newUser) {
        roles.push(role);
        return;
      }
      roles.push({
        ...role,
        roleStatus: "Inactive",
        effectiveEndDate: effectiveDate
      });
      roles.push({
        ...role,
        id: `${role.id}-${batchId}`,
        assignedUser: newUser,
        roleStatus: "Active",
        effectiveStartDate: effectiveDate,
        effectiveEndDate: null
      });
    });

    const reassigned = new Map(
      detail.activityActions
        .filter((item) => item.action === "assign")
        .map((item) => [item.activityId, item.newUser])
    );
    const activities = this.activityRecords.map((activity) => {
      const newUser = reassigned.get(activity.id);
      return newUser ? { ...activity, assignedUser: newUser } : activity;
    });

    this.workingRoles = roles;
    this.workingActivities = activities;
  }

  /**
   * Ends each de-activated role (Inactive, end date = effective date) and
   * reassigns activities whose action is "Assign to New User". "Do Nothing"
   * leaves the activity with the outgoing user.
   */
  applyDeactivation(detail, effectiveDate) {
    const ended = new Set(detail.roleIds);
    const roles = this.roleRecords.map((role) => {
      return ended.has(role.id)
        ? { ...role, roleStatus: "Inactive", effectiveEndDate: effectiveDate }
        : role;
    });
    const reassigned = new Map(
      detail.activityActions
        .filter((item) => item.action === "assign" && item.newUser)
        .map((item) => [item.activityId, item.newUser])
    );
    const activities = this.activityRecords.map((activity) => {
      const newUser = reassigned.get(activity.id);
      return newUser ? { ...activity, assignedUser: newUser } : activity;
    });

    this.workingRoles = roles;
    this.workingActivities = activities;
  }

  /** Creates an active role for every request × user pair that wasn't skipped. */
  applyAddRoles(context, batchId, effectiveDate) {
    const requestsById = new Map(
      this.requestRecords.map((request) => [request.requestId, request])
    );
    const created = [];
    const newRoles = [];
    context.entries
      .filter((entry) => !entry.skipReason)
      .forEach((entry, index) => {
        const request = requestsById.get(entry.requestId);
        const roleId = `${batchId}-${index + 1}`;
        created.push({ requestId: entry.requestId, user: entry.user, roleId });
        newRoles.push({
          id: roleId,
          assignedUser: entry.user,
          roleName: context.roleType,
          roleType: context.roleType,
          roleStatus: "Active",
          requestId: request.requestId,
          requestStatus: request.requestStatus,
          programName: request.programName,
          products: request.products,
          region: request.region,
          effectiveStartDate: effectiveDate,
          effectiveEndDate: null
        });
      });
    this.workingRoles = [...this.roleRecords, ...newRoles];
    return created;
  }

  // ------------------------------------------------------- batch records

  recordBatch(batch) {
    this.workingBatches = [...this.batchRecords, batch];
  }

  roleChange(batchId, index, role, change) {
    return {
      id: `${batchId}-${index + 1}`,
      roleType: role?.roleType ?? "",
      requestId: role?.requestId ?? "",
      programName: role?.programName ?? "",
      status: "Active",
      ...change
    };
  }

  /** Activity decisions of a Replace / De-activate run, as recorded on its batch. */
  activityChanges(batchId, actions, assignLabel) {
    const activities = new Map(
      this.activityRecords.map((activity) => [activity.id, activity])
    );
    return actions.map((item, index) => {
      const activity = activities.get(item.activityId);
      const assigned = item.action === "assign";
      return {
        id: `${batchId}-A${index + 1}`,
        activityId: item.activityId,
        activityName: activity?.activityName ?? "",
        requestId: activity?.requestId ?? "",
        programName: activity?.programName ?? "",
        previousUser: activity?.assignedUser ?? "",
        newUser: assigned ? item.newUser : "",
        actionTaken: assigned ? assignLabel : "Do Nothing"
      };
    });
  }

  // ------------------------------------------------------------- helpers

  sortRecords(records) {
    const { sortedBy, sortDirection } = this.state;
    const field = this.view.sortFieldOverrides[sortedBy] ?? sortedBy;
    const modifier = sortDirection === "asc" ? 1 : -1;
    const sortValue = (record) => {
      // Display-only columns (e.g. productLabel) sort by the row value the table shows.
      const values = fieldValues(record, field);
      return values.length > 0
        ? values.join(", ")
        : String(this.view.toRow(record)[field] ?? "");
    };

    return [...records].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      // Empty values always sort last, regardless of direction.
      if (left === right) return 0;
      if (left === "") return 1;
      if (right === "") return -1;
      return left.localeCompare(right, LOCALE, { numeric: true }) * modifier;
    });
  }
}
