import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { type SurveyQuestion } from '../../interfaces/survey.interface';

/**
 * Displays a single survey question and its answer options.
 *
 * The component receives the current question state,
 * tracks selected answers, and emits answer selections
 * to the parent component.
 */
@Component({
  selector: 'app-survey-question',
  imports: [],
  templateUrl: './survey-question.html',
})
export class SurveyQuestionComponent {
  @Input({ required: true }) question!: SurveyQuestion;
  @Input() selectedAnswers: number[] = [];
  @Input() disabled = false;

  @Output() answerToggle = new EventEmitter<number>();

  /**
   * Returns whether a specific answer is currently selected.
   *
   * @param answerIndex The index of the answer option.
   * @returns Whether the answer is selected.
   */
  protected isSelected(answerIndex: number): boolean {
    return this.selectedAnswers.includes(answerIndex);
  }

  /**
   * Converts an answer index into an alphabetical label.
   *
   * @param index The zero-based answer index.
   * @returns A label such as A, B, C, or D.
   */
  protected getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }
}
