import type { IconName } from 'acorn-web-components';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type TemplateResult,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import type { Addon } from '../../data';
import { routeApiError } from '../form';

export type CardHeading = {
  title: string;
  description: string;
  icon: IconName;
};

// Base for add-on section cards. Holds the add-on, the shared edit/save/error
// state, the stylesheet, and the card-head/row/link/runAction helpers; each
// subclass renders its own <moz-card> body.
export abstract class SectionCard extends LitElement {
  @property({ attribute: false }) addon!: Addon;
  @state() protected editing = false;
  @state() protected saving = false;
  @state() protected error = '';

  static styles: CSSResultGroup = css`
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-large);
    min-width: 0;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-small);
    width: 100%;
    margin-bottom: var(--space-xlarge);
  }
  .card-title {
    display: flex;
    align-items: center;
    gap: var(--space-small);
  }
  .card-head h2 {
    margin: 0;
    font-size: var(--font-size-heading-medium);
  }
  .card-head .sub {
    margin: var(--space-xxsmall) 0 0;
    color: var(--text-color-deemphasized, GrayText);
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xlarge);
  }
  .field dt {
    color: var(--text-color-deemphasized, GrayText);
    margin-bottom: var(--space-small);
  }
  .field dd {
    margin: 0;
  }
  .muted {
    color: var(--text-color-deemphasized, GrayText);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-large);
  }
  .card-actions {
    display: flex;
    gap: var(--space-small);
    flex: none;
  }
  .menu-btn {
    align-self: end;
  }
  .menu-btn::part(button) {
    font-size: var(--font-size-large);
    line-height: 1;
  }
`;

  protected renderCardHead(
    { title, description, icon }: CardHeading,
    actions?: TemplateResult,
  ) {
    return html`<div slot="heading" class="card-head">
      <div>
        <span class="card-title">
          <moz-icon name=${icon}></moz-icon>
          <h2>${title}</h2>
        </span>
        <p class="sub">${description}</p>
      </div>
      ${actions ?? nothing}
    </div>`;
  }

  // Edit / Save+Cancel for cards backed by a FormController (listing, technical).
  protected draftActions(
    form: { editing: boolean; saving: boolean; cancel: () => void },
    onEdit: () => void,
    onSave: () => void,
  ) {
    return form.editing
      ? html`<div class="card-actions">
          <moz-button
            size="small"
            variant="ghost"
            ?disabled=${form.saving}
            @click=${() => form.cancel()}
            >Cancel</moz-button
          >
          <moz-button
            size="small"
            variant="primary"
            ?disabled=${form.saving}
            @click=${onSave}
            >${form.saving ? 'Saving…' : 'Save'}</moz-button
          >
        </div>`
      : html`<moz-button size="small" @click=${onEdit}>Edit</moz-button>`;
  }

  // Always renders the label; falls back to a muted dash so the section keeps
  // the design's shape even when a value is absent.
  protected row(label: string, value: unknown): TemplateResult {
    const empty = value == null || value === '';
    return html`<div class="field">
      <dt>${label}</dt>
      <dd>${empty ? html`<span class="muted">—</span>` : value}</dd>
    </div>`;
  }

  protected link(url: string | undefined) {
    return url
      ? html`<a href=${url} target="_blank" rel="noopener">${url}</a>`
      : null;
  }

  protected formatError(e: unknown): string {
    const { error, fieldErrors } = routeApiError(e);
    const parts = [
      error,
      ...Object.entries(fieldErrors).map(([field, msg]) => `${field}: ${msg}`),
    ].filter(Boolean);
    return parts.join(' • ') || 'Something went wrong.';
  }

  // Routes a failure to the card's error bar. These cards have no single
  // API-field-keyed input to attach to (authors rows, screenshot captions), so
  // field errors are folded into the one general message via routeApiError.
  protected setError(e: unknown) {
    this.error = this.formatError(e);
  }

  // Runs a one-off action that persists immediately, toggling saving/error.
  protected runAction(fn: () => Promise<unknown>) {
    this.saving = true;
    this.error = '';
    fn()
      .catch((e) => this.setError(e))
      .finally(() => {
        this.saving = false;
      });
  }

  protected errorBar(message: string = this.error) {
    return message
      ? html`<moz-message-bar type="error">${message}</moz-message-bar>`
      : nothing;
  }
}
