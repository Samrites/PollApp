import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type Survey } from '../../interfaces/survey.interface';

@Component({
  selector: 'app-survey-card',
  imports: [RouterLink],
  templateUrl: './survey-card.html',
})
export class SurveyCardComponent {
  @Input({ required: true }) survey!: Survey;
  @Input() variant: 'highlight' | 'list' = 'list';

  protected get cardClass(): string {
    return this.variant === 'highlight' ? 'highlight-card' : 'list-card';
  }

  protected get deadlineLabel(): string {
    if (this.survey.daysLeft < 0) return 'Ended';
    if (this.survey.daysLeft === 0) return 'Today';
    return `Ends in ${this.survey.daysLeft} Day${this.survey.daysLeft === 1 ? '' : 's'}`;
  }
}
