import { LightningElement, api, track } from 'lwc';

interface RichTextChangeEvent extends CustomEvent {
    detail: { value: string };
}

interface LightningInputRichTextElement extends HTMLElement {
    setRangeText(
        replacement: string,
        start?: number,
        end?: number,
        selectMode?: 'select' | 'start' | 'end' | 'preserve'
    ): void;
    value: string;
}

interface PreviewSection {
    key: string;
    html: string;
    hasPageBreak: boolean;
}

export default class Rte extends LightningElement {
    private _value = '';
    private _showPageBreakButton: boolean | undefined;

    @api label = 'Rich text';
    @api placeholder: string | undefined;
    @api disabled = false;
    @api readOnly = false;
    @api required = false;
    @api labelVisible = false;
    @api pageBreakMarker = '[[PAGE_BREAK]]';

    @api
    get showPageBreakButton(): boolean {
        return this._showPageBreakButton !== false;
    }

    set showPageBreakButton(value: boolean | undefined) {
        this._showPageBreakButton = value;
    }

    @track isPreviewMode = false;

    get isEditMode(): boolean {
        return !this.isPreviewMode;
    }

    get editButtonVariant(): string {
        return this.isPreviewMode ? 'neutral' : 'brand';
    }

    get previewButtonVariant(): string {
        return this.isPreviewMode ? 'brand' : 'neutral';
    }

    get pageBreakButtonDisabled(): boolean {
        return this.disabled || this.readOnly;
    }

    get previewSections(): PreviewSection[] {
        const raw = this._value || '';
        const marker = this.pageBreakMarker;
        if (!raw || !marker) {
            return [{ key: 's-0', html: raw, hasPageBreak: false }];
        }

        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
            `<p>\\s*${escaped}\\s*</p>|${escaped}`,
            'gi'
        );
        const parts = raw.split(pattern).filter((p: string) => p.trim().length > 0);

        if (parts.length === 0) {
            return [{ key: 's-0', html: raw, hasPageBreak: false }];
        }

        return parts.map((html: string, idx: number) => ({
            key: `s-${idx}`,
            html,
            hasPageBreak: idx < parts.length - 1
        }));
    }

    @api
    get value(): string {
        return this._value;
    }

    set value(html: string | undefined) {
        this._value = html ?? '';
    }

    handleEditMode(): void {
        this.isPreviewMode = false;
    }

    handlePreviewMode(): void {
        this.isPreviewMode = true;
    }

    handleChange(event: RichTextChangeEvent): void {
        this._value = event.detail.value;
        this.fireChange();
    }

    handleInsertPageBreak(): void {
        const editor = this.refs.richText as unknown as LightningInputRichTextElement;
        editor.setRangeText(this.pageBreakMarker);
        this._value = editor.value;
        this.fireChange();
    }

    private fireChange(): void {
        this.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: this._value },
                bubbles: true,
                composed: true
            })
        );
    }
}
