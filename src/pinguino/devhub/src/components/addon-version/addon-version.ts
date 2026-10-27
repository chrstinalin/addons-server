import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BASE } from '../../base';
import {
  type Addon,
  formatDate,
  resolveVisibility,
  type Version,
  versionsQuery,
} from '../../data';
import '../../foundations/badges';
import './version-detail';

@customElement('addon-version')
export class AddonVersion extends LitElement {
  @property({ attribute: false }) addon!: Addon;
  @property() section?: string;

  #versions = versionsQuery(
    this,
    () => this.addon?.slug ?? '',
    () => !this.#versionId,
  );

  get #versionId() {
    return Number(this.section) || undefined;
  }

  static styles = css`
    moz-page-header::part(heading) {
      font-size: var(--font-size-heading-medium);
    }
    .main-content {
      display: flex;
      flex-direction: column;
      gap: var(--space-xlarge);
      padding: var(--space-small);
    }
    .version-section {
      display: flex;
      flex-direction: column;
      padding: var(--space-xlarge);
      gap: var(--space-large);
      border-radius: var(--border-radius-large);
      background-color: var(--background-color-canvas);
    }
    .version-section.current {
      background-color: var(--color-violet-desaturated-10);
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: var(--space-small);
      margin: 0;
      font-size: var(--font-size-small);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
    }
    .version-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr 1fr auto;
      align-items: center;
      column-gap: var(--space-medium);
      row-gap: var(--space-xsmall);
    }
    .version-row + .version-row {
      border-top: 1px solid var(--color-gray-20);
      padding-top: var(--space-xlarge);
    }
    .version-row:has(+ .version-row) {
      padding-bottom: var(--space-xlarge);
    }
    .version-row-label {
      color: var(--color-black-alpha-70);
      font-size: var(--font-size-small);
      padding-bottom: var(--space-medium);
    }
    .version-number {
      font-family: 'Mozilla Headline', var(--font-family);
      font-size: var(--font-size-heading-xlarge);
      font-weight: var(--font-weight-semibold);
    }
    .manage-button {
      --button-text-color-ghost: var(--color-violet-50);
    }
  `;

  static LABELS = ['Version', 'Status', 'Distribution', 'Visibility', 'Date'];

  renderVersion(version: Version, { labels = false } = {}) {
    return html`
      <div class="version-row">
        ${
          labels
            ? html`${AddonVersion.LABELS.map(
                (label) => html`<div class="version-row-label">${label}</div>`,
              )}<div></div>`
            : nothing
        }
        <div class="version-number">${version.version}</div>
        <div>
          <version-badge
            status=${version.file.status}
            ?user-disabled=${version.is_disabled}
            .reviewed=${version.reviewed}
          ></version-badge>
        </div>
        <div>
          <distribution-badge distribution=${version.channel ?? 'listed'}></distribution-badge>
        </div>
        <div>
          <visibility-badge
            visibility=${resolveVisibility(version.is_disabled)}
          ></visibility-badge>
        </div>
        <div class="date">${formatDate(version.file.created)}</div>
        <moz-button
          class="manage-button"
          variant="ghost"
          href=${version.edit_url}
          >Manage version</moz-button
        >
      </div>
    `;
  }

  render() {
    const versionId = this.#versionId;
    if (versionId) {
      return html`<version-detail
        .addon=${this.addon}
        .versionId=${versionId}
      ></version-detail>`;
    }
    const versions = this.#versions().data;
    if (!versions) return nothing;
    const current = this.addon.currentVersion;
    const otherVersions = versions.filter(
      (version) => version.id !== current?.id,
    );
    return html`
      <moz-card>
        <div class="main-content">
          <moz-page-header
            heading="Version"
            description="See all your versions at once and easily manage them."
          >
            <moz-button
              slot="actions"
              variant="primary"
              icon-start="add"
              href="${BASE}/addon/${this.addon.slug}/versions/submit/distribution"
              >Upload a new version</moz-button
            >
          </moz-page-header>

          ${
            current
              ? html`<div class="version-section current">
                <h3 class="section-title">Listed Version</h3>
                <div class="version-list">
                ${this.renderVersion(current, { labels: true })}
                  
                </div>
              </div>`
              : nothing
          }
          ${
            otherVersions.length
              ? html`<div class="version-section">
                <h3 class="section-title">Other versions</h3>
                <div class="version-list">
                ${otherVersions.map((version, i) =>
                  this.renderVersion(version, {
                    labels: i === 0,
                  }),
                )}
                </div>

              </div>`
              : nothing
          }
        </div>
      </moz-card>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'addon-version': AddonVersion;
  }
}
