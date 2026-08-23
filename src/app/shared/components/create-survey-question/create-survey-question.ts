import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { type SurveyQuestionDraft } from '../../interfaces/survey.interface';

/**
 * Displays and edits a single survey question draft.
 *
 * Handles prompt validation, answer editing, multiple-choice state,
 * dynamic answer fields, and communication with the parent component.
 */
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

  protected isPromptTouched = false;
  protected touchedAnswers = new Set<number>();

  /**
   * Converts an answer index to an alphabetical label.
   *
   * @param index The zero-based answer index.
   * @returns A label such as A, B, C, or D.
   */
  protected getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  /**
   * Returns whether the question prompt should display a validation error.
   *
   * @returns Whether the prompt is currently invalid.
   */
  protected get isPromptInvalid(): boolean {
    return (
      (
        this.showValidationErrors ||
        this.isPromptTouched
      ) &&
      !this.question.prompt.trim()
    );
  }

  /**
   * Returns whether an answer should display a validation error.
   *
   * @param index The answer field index.
   * @returns Whether the answer is currently invalid.
   */
  protected isAnswerInvalid(index: number): boolean {
    const isTouched =
      this.showValidationErrors ||
      this.touchedAnswers.has(index);

    const answer =
      this.question.answers[index] ?? '';

    return isTouched && !answer.trim();
  }

  /**
   * Marks the question prompt as touched.
   */
  protected markPromptTouched(): void {
    this.isPromptTouched = true;
  }

  /**
   * Marks an answer field as touched.
   *
   * @param index The answer field index.
   */
  protected markAnswerTouched(index: number): void {
    this.touchedAnswers.add(index);
  }

  /**
   * Updates the question prompt within the configured character limit.
   *
   * @param value The new prompt value.
   */
  protected updatePrompt(value: string): void {
    const prompt = value.slice(
      0,
      this.maxInputLength,
    );

    this.emitQuestion({
      ...this.question,
      prompt,
    });
  }

  /**
   * Updates one answer within the configured character limit.
   *
   * @param index The answer field index.
   * @param value The new answer value.
   */
  protected updateAnswer(
    index: number,
    value: string,
  ): void {
    const answers = {
      ...this.question.answers,
      [index]: value.slice(
        0,
        this.maxInputLength,
      ),
    };

    this.emitQuestion({
      ...this.question,
      answers,
    });
  }

  /**
   * Updates whether the question allows multiple answers.
   *
   * @param event The checkbox change event.
   */
  protected toggleMultiple(event: Event): void {
    const input =
      event.target as HTMLInputElement;

    this.emitQuestion({
      ...this.question,
      allowMultipleAnswers: input.checked,
    });
  }

  /**
   * Adds a new empty answer field when the limit is not reached.
   */
  protected addAnswer(): void {
    if (!this.canAddAnswer()) {
      return;
    }

    const nextIndex =
      this.getNextAnswerIndex();

    this.appendAnswer(nextIndex);
  }

  /**
   * Removes an answer field or clears it when only two remain.
   *
   * @param index The answer field index to remove.
   */
  protected removeAnswer(index: number): void {
    if (this.shouldKeepMinimumAnswers()) {
      this.updateAnswer(index, '');
      return;
    }

    this.removeAnswerField(index);
  }

  /**
   * Returns whether another answer field can be added.
   *
   * @returns Whether the configured answer limit has not been reached.
   */
  private canAddAnswer(): boolean {
    return (
      this.question.answerFieldIndexes.length <
      this.maxAnswerFields
    );
  }

  /**
   * Returns the next available answer field index.
   *
   * @returns The next answer index.
   */
  private getNextAnswerIndex(): number {
    if (!this.question.answerFieldIndexes.length) {
      return 0;
    }

    return (
      Math.max(
        ...this.question.answerFieldIndexes,
      ) + 1
    );
  }

  /**
   * Adds a new empty answer field.
   *
   * @param index The new answer field index.
   */
  private appendAnswer(index: number): void {
    this.emitQuestion({
      ...this.question,
      answerFieldIndexes: [
        ...this.question.answerFieldIndexes,
        index,
      ],
      answers: {
        ...this.question.answers,
        [index]: '',
      },
    });
  }

  /**
   * Returns whether the minimum number of answer fields must be kept.
   *
   * @returns Whether only two answer fields remain.
   */
  private shouldKeepMinimumAnswers(): boolean {
    return (
      this.question.answerFieldIndexes.length <= 2
    );
  }

  /**
   * Removes an answer field from the current question.
   *
   * @param index The answer field index to remove.
   */
  private removeAnswerField(index: number): void {
    const answers = {
      ...this.question.answers,
    };

    delete answers[index];

    this.emitQuestion({
      ...this.question,
      answerFieldIndexes:
        this.question.answerFieldIndexes.filter(
          (item) => item !== index,
        ),
      answers,
    });
  }

  /**
   * Emits the updated question draft to the parent component.
   *
   * @param question The updated question draft.
   */
  private emitQuestion(
    question: SurveyQuestionDraft,
  ): void {
    this.questionChange.emit(question);
  }
}