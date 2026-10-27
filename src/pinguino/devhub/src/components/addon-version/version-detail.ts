import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  APP_NAMES,
  BASE,
  MAX_UPLOAD_SIZE,
  SOURCE_EXTENSIONS,
} from '../../base';
import {
  appVersionsQuery,
  formatDate,
  localized,
  removeVersion,
  updateVersion,
  type Version,
  type VersionEdit,
  versionQuery,
} from '../../data';
import '../../foundations/badges';
import {
  type CardHeading,
  SectionCard,
} from '../../foundations/components/section-card';
import { FormController, textArea } from '../../foundations/form';
import { formatSize, navigateTo } from '../../helper';

type CompatRow = { app: string; min: string; max: string; isNew?: boolean };

type Section = 'compatibility' | 'notes' | 'source';

@customElement('version-detail')
export class VersionDetail extends SectionCard {
  @property({ type: Number }) versionId = 0;

  @state() private section?: Section;
  @state() private source?: File;
  @state() private compat: CompatRow[] = [];
  @state() private confirmingDelete = false;
  @state() private deleting = false;
  @state() private deleteError = '';

  #version = versionQuery(
    this,
    () => this.addon?.slug ?? '',
    () => this.versionId,
  );
  #form = new FormController<VersionEdit>(this);

  #appVersions = Object.fromEntries(
    Object.keys(APP_NAMES).map((app) => [
      app,
      appVersionsQuery(this, () =>
        this.compat.some((r) => r.app === app) ? app : undefined,
      ),
    ]),
  );

  static styles = [
    SectionCard.styles,
    css`
      .back {
        display: inline-block;
        margin-block-end: var(--space-medium);
      }
      .page-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-medium);
        flex-wrap: wrap;
        margin-block-end: var(--space-large);
      }
      .page-head h1 {
        margin: 0;
        font-size: var(--font-size-heading-large);
      }
      .entries {
        display: flex;
        flex-direction: column;
        gap: var(--space-large);
      }
      .entry,
      .entry-edit {
        display: grid;
        gap: var(--space-medium);
      }
      .entry {
        grid-template-columns: repeat(3, 1fr);
      }
      .entry-edit {
        grid-template-columns: repeat(3, 1fr) 2.5rem;
        align-items: end;
      }
      .entry-edit > * {
        min-width: 0;
      }
    `,
  ];

  willUpdate(changed: PropertyValues<this>) {
    if (changed.has('versionId')) this.#cancel();
  }

  #startEdit(section: Section, v: Version) {
    this.#endEdit();
    this.section = section;
    if (section === 'compatibility') {
      this.compat = Object.entries(v.compatibility ?? {}).map(
        ([app, { min, max }]) => ({ app, min, max }),
      );
    }
    this.#form.start({
      release_notes: localized(v.release_notes),
      approval_notes: v.approval_notes ?? '',
    });
  }

  #cancel() {
    this.#form.cancel();
    this.#endEdit();
  }

  #endEdit() {
    this.section = undefined;
    this.source = undefined;
    this.compat = [];
  }

  #notesEdit(draft: VersionEdit, saved: Version): VersionEdit {
    const notes = draft.release_notes ?? '';
    const reviewerNotes = draft.approval_notes ?? '';
    return {
      ...(notes !== localized(saved.release_notes) && {
        release_notes: notes,
      }),
      ...(reviewerNotes !== (saved.approval_notes ?? '') && {
        approval_notes: reviewerNotes,
      }),
    };
  }

  #compatibilityEdit(v: Version): VersionEdit {
    const saved = v.compatibility ?? {};
    const changed = this.compat.some(
      (r) =>
        r.isNew || r.min !== saved[r.app]?.min || r.max !== saved[r.app]?.max,
    );
    if (!changed) return {};
    return {
      compatibility: Object.fromEntries(
        this.compat.map((r) => [
          r.app,
          { ...(r.min && { min: r.min }), ...(r.max && { max: r.max }) },
        ]),
      ),
    };
  }

  #setCompat(index: number, patch: Partial<CompatRow>) {
    this.compat = this.compat.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
  }

  #unusedApps() {
    return Object.keys(APP_NAMES).filter(
      (app) => !this.compat.some((r) => r.app === app),
    );
  }

  #addCompat() {
    const [app] = this.#unusedApps();
    this.compat = [...this.compat, { app, min: '', max: '', isNew: true }];
  }

  #save(v: Version) {
    const { section, source } = this;
    return this.#form.submit(async (draft) => {
      const edit =
        section === 'notes'
          ? this.#notesEdit(draft, v)
          : this.#compatibilityEdit(v);
      await updateVersion(this.addon.slug, v.id, edit, source);
      this.#endEdit();
    });
  }

  async #delete(v: Version) {
    this.deleting = true;
    this.deleteError = '';
    try {
      await removeVersion(this.addon.slug, v.id);
      this.confirmingDelete = false;
      navigateTo(`${BASE}/addon/${this.addon.slug}/versions`);
    } catch (e) {
      this.deleteError = this.formatError(e);
    } finally {
      this.deleting = false;
    }
  }

  #deleteDialog(v: Version) {
    const isCurrent = this.addon.currentVersion?.id === v.id;
    return html`<moz-dialog
      heading="Delete Version ${v.version}"
      dismissable
      ?open=${this.confirmingDelete}
      @moz-dialog:dismiss=${(e: Event) => {
        if (this.deleting) e.preventDefault();
        else this.confirmingDelete = false;
      }}
    >
      ${this.errorBar(this.deleteError)}
      ${
        isCurrent
          ? html`<moz-message-bar type="warning">
              You are about to delete the current version of your add-on. This
              may cause your add-on status to change, or your listing to lose
              public visibility, if this is the only public version of your
              add-on.
            </moz-message-bar>`
          : nothing
      }
      <p>Deleting this version will permanently delete:</p>
      <ul>
        <li>1 file</li>
      </ul>
      <moz-message-bar type="warning">
        <strong>Important:</strong> Once a version has been deleted, you may not
        upload a new version with the same version number. The version will also
        be Restricted, which will disable and prevent any further installation
        in Firefox. Existing users can choose to re-enable the add-on.
      </moz-message-bar>
      <p>Are you sure you wish to delete this version?</p>
      <div slot="actions" class="card-actions">
        <moz-button data-dismiss ?disabled=${this.deleting}>Cancel</moz-button>
        <moz-button
          variant="destructive"
          ?disabled=${this.deleting}
          @click=${() => this.#delete(v)}
          >Delete Version</moz-button
        >
      </div>
    </moz-dialog>`;
  }

  #sectionHead(
    heading: CardHeading,
    section: Section,
    v: Version,
    { editable = true, extra }: { editable?: boolean; extra?: unknown } = {},
  ) {
    if (!editable) return this.renderCardHead(heading);
    const form = this.#form;
    const editing = this.#isEditing(section);
    if (!editing && form.editing) {
      return this.renderCardHead(
        heading,
        html`<moz-button size="small" disabled>Edit</moz-button>`,
      );
    }
    const actions = this.draftActions(
      { editing, saving: form.saving, cancel: () => this.#cancel() },
      () => this.#startEdit(section, v),
      () => this.#save(v),
    );
    return this.renderCardHead(
      heading,
      editing && extra
        ? html`<div class="card-actions">${extra} ${actions}</div>`
        : actions,
    );
  }

  #isEditing(section: Section) {
    return this.#form.editing && this.section === section;
  }

  #pageHead(v: Version) {
    return html`<div class="page-head">
      <h1>Version ${v.version}</h1>
      <div class="card-actions">
        <moz-button
          variant="ghost"
          ?disabled=${this.saving}
          @click=${() =>
            this.runAction(() =>
              updateVersion(this.addon.slug, v.id, {
                is_disabled: !v.is_disabled,
              }),
            )}
          >${v.is_disabled ? 'Enable Version' : 'Disable Version'}</moz-button
        >
        <moz-button
          variant="destructive"
          @click=${() => {
            this.deleteError = '';
            this.confirmingDelete = true;
          }}
          >Delete Version</moz-button
        >
      </div>
    </div>`;
  }

  #license(v: Version) {
    if (!v.license) return null;
    const name = localized(v.license.name);
    return v.license.url
      ? html`<span
          >${name}
          <a href=${v.license.url} target="_blank" rel="noopener"
            >Details</a
          ></span
        >`
      : name;
  }

  #fileCard(v: Version) {
    const f = v.file;
    return html`<moz-card appearance="outline" spacing="spacious">
      ${this.renderCardHead({
        title: 'File',
        description: 'The package for this version.',
        icon: 'downloaded-file',
      })}
      <dl>
        ${this.row(
          'Package',
          html`<span
            ><a href=${f.url}>Download</a>
            <span class="muted">(${formatSize(f.size)})</span></span
          >`,
        )}
        ${this.row(
          'Status',
          html`<version-badge
            status=${f.status}
            ?user-disabled=${v.is_disabled}
            .reviewed=${v.reviewed}
          ></version-badge>`,
        )}
        ${this.row(
          'Channel',
          html`<distribution-badge
            distribution=${v.channel}
          ></distribution-badge>`,
        )}
        ${this.row('Uploaded', formatDate(f.created))}
        ${this.row('Reviewed', formatDate(v.reviewed))}
        ${this.row('License', this.#license(v))}
      </dl>
    </moz-card>`;
  }

  #compatibilityCard(v: Version) {
    const editing = this.#isEditing('compatibility');
    const error = this.#form.fieldError('compatibility');
    const add = html`<moz-button
      size="small"
      variant="ghost"
      icon-start="add"
      ?disabled=${this.#form.saving || !this.#unusedApps().length}
      @click=${() => this.#addCompat()}
      >Add application</moz-button
    >`;
    return html`<moz-card appearance="outline" spacing="spacious">
      ${this.#sectionHead(
        {
          title: 'Compatibility',
          description: 'The applications and versions this version supports.',
          icon: 'globe',
        },
        'compatibility',
        v,
        { extra: add },
      )}
      ${editing ? this.errorBar(this.#form.error) : nothing}
      ${
        editing
          ? html`<div class="entries">
              ${this.compat.map((r, i) => this.#compatEditRow(i, r))}
            </div>`
          : this.#compatRows(v)
      }
      ${error ? html`<p class="error">${error}</p>` : nothing}
    </moz-card>`;
  }

  #versionSelect(
    label: string,
    value: string,
    options: string[],
    allowDefault: boolean | undefined,
    onChange: (value: string) => void,
  ) {
    const all =
      value && !options.includes(value) ? [value, ...options] : options;
    return html`<moz-select
      label=${label}
      .value=${value}
      ?disabled=${this.#form.saving}
      @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}
    >
      ${
        allowDefault
          ? html`<moz-option value="" label="Default"></moz-option>`
          : nothing
      }
      ${all.map((o) => html`<moz-option value=${o} label=${o}></moz-option>`)}
    </moz-select>`;
  }

  #compatRows(v: Version) {
    const apps = Object.entries(v.compatibility ?? {});
    if (!apps.length) {
      return html`<p class="muted">No compatible applications.</p>`;
    }
    return html`<div class="entries">
      ${apps.map(
        ([app, range]) =>
          html`<div class="entry">
            ${this.row('Application', APP_NAMES[app] ?? app)}
            ${this.row('Minimum', range.min)} ${this.row('Maximum', range.max)}
          </div>`,
      )}
    </div>`;
  }

  #compatEditRow(index: number, r: CompatRow) {
    const saving = this.#form.saving;
    const versions = this.#appVersions[r.app]?.().data ?? [];
    const choices = [r.app, ...this.#unusedApps()];
    return html`<div class="entry-edit">
      ${
        r.isNew && choices.length > 1
          ? html`<moz-select
              label="Application"
              .value=${r.app}
              ?disabled=${saving}
              @change=${(e: Event) =>
                this.#setCompat(index, {
                  app: (e.target as HTMLSelectElement).value,
                  min: '',
                  max: '',
                })}
            >
              ${choices.map(
                (app) =>
                  html`<moz-option
                    value=${app}
                    label=${APP_NAMES[app]}
                  ></moz-option>`,
              )}
            </moz-select>`
          : html`<moz-input-text
              label="Application"
              full-width
              disabled
              .value=${APP_NAMES[r.app] ?? r.app}
            ></moz-input-text>`
      }
      ${this.#versionSelect(
        'Minimum',
        r.min,
        versions.filter((ver) => !ver.includes('*')),
        r.isNew,
        (min) => this.#setCompat(index, { min }),
      )}
      ${this.#versionSelect('Maximum', r.max, versions, r.isNew, (max) =>
        this.#setCompat(index, { max }),
      )}
      ${
        r.isNew
          ? html`<moz-button
              class="menu-btn"
              variant="ghost"
              icon-start="close"
              aria-label="Remove application"
              ?disabled=${saving}
              @click=${() => {
                this.compat = this.compat.filter((_, i) => i !== index);
              }}
            ></moz-button>`
          : html`<span></span>`
      }
    </div>`;
  }

  #notesCard(v: Version) {
    const form = this.#form;
    const editing = this.#isEditing('notes');
    const notes = localized(v.release_notes);
    return html`<moz-card appearance="outline" spacing="spacious">
      ${this.#sectionHead(
        {
          title: 'Notes',
          description: 'Release notes for users, and notes for reviewers.',
          icon: 'comment',
        },
        'notes',
        v,
      )}
      ${
        editing
          ? html`<div class="form">
              ${this.errorBar(form.error)}
              ${textArea(form, 'release_notes', 'Version notes')}
              ${textArea(form, 'approval_notes', 'Notes for reviewers')}
            </div>`
          : html`<dl>
              ${this.row(
                'Version notes',
                notes ? html`<span class="notes">${notes}</span>` : null,
              )}
              ${this.row(
                'Notes for reviewers',
                v.approval_notes
                  ? html`<span class="notes">${v.approval_notes}</span>`
                  : null,
              )}
            </dl>`
      }
    </moz-card>`;
  }

  #sourceCard(v: Version) {
    const form = this.#form;
    const editing = this.#isEditing('source');
    const locked = v.is_source_editable === false;
    return html`<moz-card appearance="outline" spacing="spacious">
      ${this.#sectionHead(
        {
          title: 'Source code',
          description:
            'Source for minified, concatenated or machine-generated code.',
          icon: 'archive',
        },
        'source',
        v,
        { editable: !locked },
      )}
      <dl>
        ${this.row(
          'Source',
          locked
            ? html`<moz-message-bar
                type="warning"
              >You cannot change attached sources because this version has been reviewed by Mozilla.</moz-message-bar>`
            : v.source
              ? html`<a href=${v.source}>Download source</a>`
              : null,
        )}
      </dl>
      ${
        editing
          ? html`<div class="form">
              ${this.errorBar(form.error)}
              <div class="form-field">
                <moz-input-file
                  accept=${SOURCE_EXTENSIONS}
                  max-size=${MAX_UPLOAD_SIZE}
                  label=${'Upload source'}
                  error=${form.fieldError('source')}
                  ?disabled=${form.saving}
                  @change=${(e: Event) => {
                    this.source = (
                      e.target as { files?: ArrayLike<File> }
                    ).files?.[0];
                  }}
                ></moz-input-file>
              </div>
            </div>`
          : nothing
      }
    </moz-card>`;
  }

  render() {
    const result = this.#version();
    const back = html`<a
      class="back"
      href="${BASE}/addon/${this.addon.slug}/versions"
      >&larr; Back to versions</a
    >`;
    if (result.isPending) return html`${back}<p class="muted">Loading…</p>`;
    const v = result.data;
    if (!v) {
      return html`${back}<p class="muted">Version not found.</p>`;
    }
    const isTheme = this.addon.kind === 'theme';
    return html`
      ${back} ${this.#pageHead(v)}
      ${
        this.error
          ? html`<div class="toggle-error">${this.errorBar()}</div>`
          : nothing
      }
      <div class="cards">
        ${this.#fileCard(v)}
        ${!isTheme ? this.#compatibilityCard(v) : nothing}
        ${!isTheme ? this.#notesCard(v) : nothing}
        ${!isTheme && v.channel !== 'enterprise' ? this.#sourceCard(v) : nothing}
      </div>
      ${this.#deleteDialog(v)}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'version-detail': VersionDetail;
  }
}
