import { Component, EventEmitter, Input, Output } from '@angular/core';
import { type SurveyQuestion } from '../../interfaces/survey.interface';

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

  protected isSelected(answerIndex: number): boolean {
    return this.selectedAnswers.includes(answerIndex);
  }

  protected getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }
}
