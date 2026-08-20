import { Component, EventEmitter, Input, Output } from '@angular/core';
import { type SurveyQuestionDraft } from '../../interfaces/survey.interface';

@Component({
  selector: 'app-create-survey-question',
  imports: [],
  templateUrl: './create-survey-question.html',
})
export class CreateSurveyQuestionComponent {
  @Input({ required: true }) question!: SurveyQuestionDraft;
  @Input({ required: true }) questionNumber = 1;
  @Input() maxAnswerFields = 6;
  @Input() maxInputLength = 60;
  @Input() showValidationErrors = false;
  @Output() questionChange = new EventEmitter<SurveyQuestionDraft>();
  @Output() deleteRequested = new EventEmitter<void>();

  protected getAnswerLabel(index: number): string { return String.fromCharCode(65 + index); }
  protected get isPromptInvalid(): boolean { return this.showValidationErrors && !this.question.prompt.trim(); }
  protected isAnswerInvalid(index: number): boolean {
    return this.showValidationErrors && !(this.question.answers[index] ?? '').trim();
  }
  protected updatePrompt(value: string): void {
    this.emitQuestion({ ...this.question, prompt: value.slice(0, this.maxInputLength) });
  }
  protected updateAnswer(index: number, value: string): void {
    this.emitQuestion({
      ...this.question,
      answers: { ...this.question.answers, [index]: value.slice(0, this.maxInputLength) },
    });
  }
  protected toggleMultiple(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitQuestion({ ...this.question, allowMultipleAnswers: input.checked });
  }
  protected addAnswer(): void {
    if (this.question.answerFieldIndexes.length >= this.maxAnswerFields) return;
    const next = this.question.answerFieldIndexes.length
      ? Math.max(...this.question.answerFieldIndexes) + 1
      : 0;
    this.emitQuestion({
      ...this.question,
      answerFieldIndexes: [...this.question.answerFieldIndexes, next],
      answers: { ...this.question.answers, [next]: '' },
    });
  }
  protected removeAnswer(index: number): void {
    if (this.question.answerFieldIndexes.length <= 2) {
      this.updateAnswer(index, '');
      return;
    }
    const answers = { ...this.question.answers };
    delete answers[index];
    this.emitQuestion({
      ...this.question,
      answerFieldIndexes: this.question.answerFieldIndexes.filter((item) => item !== index),
      answers,
    });
  }
  private emitQuestion(question: SurveyQuestionDraft): void { this.questionChange.emit(question); }
}
