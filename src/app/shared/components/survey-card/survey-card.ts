import {
  Component,
  Input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { type Survey } from '../../interfaces/survey.interface';

/**
 * Displays a survey card in highlight or list mode.
 *
 * The component renders survey information and provides
 * a readable deadline label based on the remaining days.
 */
@Component({
  selector: 'app-survey-card',
  imports: [RouterLink],
  templateUrl: './survey-card.html',
})
export class SurveyCardComponent {
  @Input({ required: true }) survey!: Survey;
  @Input() variant: 'highlight' | 'list' = 'list';

  /**
   * Returns the CSS class for the selected card variant.
   *
   * @returns The class name for highlight or list mode.
   */
  protected get cardClass(): string {
    return this.variant === 'highlight'
      ? 'highlight-card'
      : 'list-card';
  }

  /**
   * Returns the deadline label for the current survey.
   *
   * @returns A readable label such as Ended, Today, or Ends in X Days.
   */
  protected get deadlineLabel(): string {
    if (this.survey.daysLeft < 0) {
      return 'Ended';
    }

    if (this.survey.daysLeft === 0) {
      return 'Today';
    }

    return this.createRemainingDaysLabel();
  }

  /**
   * Creates the deadline label for a future survey.
   *
   * @returns The formatted remaining-days label.
   */
  private createRemainingDaysLabel(): string {
    const dayLabel =
      this.survey.daysLeft === 1
        ? 'Day'
        : 'Days';

    return `Ends in ${this.survey.daysLeft} ${dayLabel}`;
  }
}