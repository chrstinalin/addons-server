import { type TemplateResult, unsafeCSS } from 'lit';
import { SectionCard as BaseSectionCard } from '../../foundations/components/section-card';
// Styles live in a sibling .css file; `?inline` brings them in as a string that
// unsafeCSS adopts (the project's convention). One CSSResult instance is shared
// across every section card and the shell.
import stylesText from './addon-listing.css?inline';
import { SECTION, type SectionId } from './sections';

export const sharedStyles = [BaseSectionCard.styles, unsafeCSS(stylesText)];

// Base for the four listing-section cards: the shared stylesheet, and headings
// looked up from SECTION metadata.
export abstract class SectionCard extends BaseSectionCard {
  static styles = sharedStyles;

  // Renders the heading for a section's card from its SECTION metadata.
  protected cardHead(id: SectionId, actions?: TemplateResult) {
    return this.renderCardHead(SECTION[id], actions);
  }
}
