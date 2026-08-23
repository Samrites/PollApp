import { DOCUMENT } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { Router } from '@angular/router';

import {
  CATEGORY_PLACEHOLDER_LABEL,
  SURVEY_CATEGORIES,
} from '../../shared/constants/survey-categories';
import { CreateSurveyQuestionComponent } from '../../shared/components/create-survey-question/create-survey-question';
import {
  type Survey,
  type SurveyQuestionDraft,
} from '../../shared/interfaces/survey.interface';
import { SurveyStorageService } from '../../shared/services/survey-storage.service';

const MAX_INPUT_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 1000;
const DEFAULT_DAYS_LEFT = 30;
const MS_PER_DAY = 86_400_000;
const BODY_SCROLL_LOCK_CLASS = 'overlay-scroll-lock';

/**
 * Handles the create-survey form and dialog workflow.
 *
 * The component manages form values, validation, questions,
 * category selection, publishing, and dialog behavior.
 */
@Component({
  selector: 'app-create-survey-page',
  imports: [CreateSurveyQuestionComponent],
  templateUrl: './create-survey-page.html',
  styleUrl: './create-survey-page.scss',
  encapsulation: ViewEncapsulation.None,
})
export class CreateSurveyPage implements OnChanges, OnDestroy {
  @Input() isDialog = false;

  @Output() closeRequested = new EventEmitter<void>();
  @Output() surveyPublished = new EventEmitter<Survey>();

  protected isCategoryDropdownOpen = false;
  protected selectedCategory = CATEGORY_PLACEHOLDER_LABEL;

  protected readonly minEndDate = this.getTodayIsoDate();
  protected readonly maxInputLength = MAX_INPUT_LENGTH;
  protected readonly maxDescriptionLength = MAX_DESCRIPTION_LENGTH;
  protected readonly categories = SURVEY_CATEGORIES;
  protected readonly maxAnswerFields = 6;
  protected readonly maxQuestions = 6;

  protected surveyTitle = '';
  protected surveyDescription = '';
  protected endDate = '';

  protected showValidationErrors = false;
  protected isSurveyTitleTouched = false;
  protected isPublishSuccessVisible = false;

  protected questions: SurveyQuestionDraft[] = [
    this.createQuestionItem(1),
  ];

  private hasBodyScrollLock = false;

  /**
   * Creates the create-survey component.
   *
   * @param router Angular router used for navigation.
   * @param surveyStorage Service used to persist surveys.
   * @param document Browser document used for body scroll locking.
   */
  constructor(
    private readonly router: Router,
    private readonly surveyStorage: SurveyStorageService,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  /**
   * Returns whether the component is currently displayed as a dialog.
   *
   * @returns Whether dialog mode is active.
   */
  @HostBinding('class.create-survey-dialog-mode')
  protected get isCreateSurveyDialogMode(): boolean {
    return this.isDialog;
  }

  /**
   * Updates the body scroll lock when the dialog mode changes.
   *
   * @param changes The changed input properties.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isDialog']) {
      this.updateBodyScrollLock();
    }
  }

  /**
   * Removes the body scroll lock when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  /**
   * Closes the dialog or navigates back to the home page.
   */
  protected closeCreateSurvey(): void {
    if (this.isDialog) {
      this.closeRequested.emit();
      return;
    }

    void this.router.navigate(['/']);
  }

  /**
   * Closes the dialog when the user clicks directly on the backdrop.
   *
   * @param event The backdrop click event.
   */
  protected handleBackdropClick(event: MouseEvent): void {
    if (
      this.isDialog &&
      event.target === event.currentTarget
    ) {
      this.closeCreateSurvey();
    }
  }

  /**
   * Opens or closes the category dropdown.
   */
  protected toggleCategoryDropdown(): void {
    this.isCategoryDropdownOpen =
      !this.isCategoryDropdownOpen;
  }

  /**
   * Selects a survey category and closes the dropdown.
   *
   * @param category The selected category.
   */
  protected selectCategory(category: string): void {
    this.selectedCategory = category;
    this.isCategoryDropdownOpen = false;
  }

  /**
   * Clears the value of an input or textarea element.
   *
   * @param control The form control to clear.
   */
  protected clearField(
    control: HTMLInputElement | HTMLTextAreaElement,
  ): void {
    control.value = '';
  }

  /**
   * Updates the survey title within the configured character limit.
   *
   * @param value The current title value.
   */
  protected updateSurveyTitle(value: string): void {
    this.surveyTitle = value.slice(
      0,
      MAX_INPUT_LENGTH,
    );
  }

  /**
   * Marks the survey title as touched for blur validation.
   */
  protected markSurveyTitleTouched(): void {
    this.isSurveyTitleTouched = true;
  }

  /**
   * Updates the survey description within the configured character limit.
   *
   * @param value The current description value.
   */
  protected updateSurveyDescription(value: string): void {
    this.surveyDescription = value.slice(
      0,
      MAX_DESCRIPTION_LENGTH,
    );
  }

  /**
   * Updates the optional survey end date.
   *
   * @param value The selected ISO date value.
   */
  protected updateEndDate(value: string): void {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      this.endDate = '';
      return;
    }

    this.endDate = this.resolveValidEndDate(
      trimmedValue,
    );
  }

  /**
   * Replaces an existing question with its updated state.
   *
   * @param updatedQuestion The updated question draft.
   */
  protected updateQuestion(
    updatedQuestion: SurveyQuestionDraft,
  ): void {
    this.questions = this.questions.map(
      (question) =>
        question.id === updatedQuestion.id
          ? updatedQuestion
          : question,
    );
  }

  /**
   * Adds a new empty question when the maximum has not been reached.
   */
  protected addQuestion(): void {
    if (this.questions.length >= this.maxQuestions) {
      return;
    }

    this.questions = [
      ...this.questions,
      this.createQuestionItem(
        this.getNextQuestionId(),
      ),
    ];
  }

  /**
   * Clears or removes a survey question.
   *
   * @param questionIndex The index of the question to clear or remove.
   */
  protected handleQuestionDelete(
    questionIndex: number,
  ): void {
    const question = this.questions[questionIndex];

    if (!question) {
      return;
    }

    this.processQuestionDelete(
      questionIndex,
      question,
    );
  }

  /**
   * Returns whether the survey title should currently display an error.
   *
   * @returns Whether the title is invalid.
   */
  protected isSurveyTitleInvalid(): boolean {
    return (
      (
        this.showValidationErrors ||
        this.isSurveyTitleTouched
      ) &&
      !this.surveyTitle.trim()
    );
  }

  /**
   * Publishes the survey when all required fields are valid.
   */
  protected async publishSurvey(): Promise<void> {
    this.showValidationErrors = true;

    if (!this.hasValidRequiredFields()) {
      return;
    }

    await this.publishValidSurvey();
  }

  /**
   * Returns the selected end date in display format.
   *
   * @returns The formatted date or an empty placeholder.
   */
  protected get formattedEndDate(): string {
    if (!this.endDate) {
      return '--.--.----';
    }

    return this.formatEndDate(this.endDate);
  }

  /**
   * Closes the dialog when the Escape key is pressed.
   */
  @HostListener('document:keydown.escape')
  protected closeDialogOnEscape(): void {
    if (this.isDialog) {
      this.closeCreateSurvey();
    }
  }

  /**
   * Closes the category dropdown when the user clicks outside of it.
   *
   * @param event The document click event.
   */
  @HostListener('document:click', ['$event'])
  protected closeCategoryDropdownOnOutsideClick(
    event: MouseEvent,
  ): void {
    if (!this.isCategoryDropdownOpen) {
      return;
    }

    if (this.isOutsideCategoryDropdown(event)) {
      this.isCategoryDropdownOpen = false;
    }
  }

  /**
   * Resolves a valid end date.
   *
   * @param value The selected date value.
   * @returns The selected date or today's date when the value is in the past.
   */
  private resolveValidEndDate(value: string): string {
    return this.isPastDate(value)
      ? this.minEndDate
      : value;
  }

  /**
   * Applies the delete behavior for an existing question.
   *
   * @param questionIndex The index of the question.
   * @param question The question to clear or remove.
   */
  private processQuestionDelete(
    questionIndex: number,
    question: SurveyQuestionDraft,
  ): void {
    if (question.prompt.trim()) {
      this.clearQuestionPrompt(
        questionIndex,
        question,
      );
      return;
    }

    this.removeQuestion(questionIndex);
  }

  /**
   * Clears only the question prompt while preserving existing answers.
   *
   * @param questionIndex The index of the question.
   * @param question The question whose prompt should be cleared.
   */
  private clearQuestionPrompt(
    questionIndex: number,
    question: SurveyQuestionDraft,
  ): void {
    this.replaceQuestion(questionIndex, {
      ...question,
      prompt: '',
    });
  }

  /**
   * Removes an empty question when another question remains.
   *
   * @param questionIndex The index of the question to remove.
   */
  private removeQuestion(questionIndex: number): void {
    if (this.questions.length === 1) {
      return;
    }

    this.questions = this.questions.filter(
      (_, index) => index !== questionIndex,
    );
  }

  /**
   * Publishes the current valid survey.
   */
  private async publishValidSurvey(): Promise<void> {
    try {
      const survey = await this.buildSurvey();

      await this.surveyStorage.addSurvey(survey);
      this.showPublishSuccess(survey);
    } catch (error) {
      console.error(
        'Could not publish survey:',
        error,
      );
    }
  }

  /**
   * Shows the publish confirmation before continuing the workflow.
   *
   * @param survey The newly published survey.
   */
  private showPublishSuccess(survey: Survey): void {
    this.isPublishSuccessVisible = true;

    setTimeout(() => {
      this.finishPublishSuccess(survey);
    }, 1400);
  }

  /**
   * Finishes the publish workflow.
   *
   * @param survey The newly published survey.
   */
  private finishPublishSuccess(survey: Survey): void {
    this.isPublishSuccessVisible = false;

    if (this.isDialog) {
      this.surveyPublished.emit(survey);
      return;
    }

    void this.navigateToSurvey(survey.id);
  }

  /**
   * Navigates to a survey detail page.
   *
   * @param surveyId The survey ID.
   */
  private async navigateToSurvey(
    surveyId: number,
  ): Promise<void> {
    await this.router.navigate([
      '/single-survey',
      surveyId,
    ]);
  }

  /**
   * Builds the final survey object from the current form state.
   *
   * @returns The completed survey object.
   */
  private async buildSurvey(): Promise<Survey> {
    return {
      id: await this.surveyStorage.nextSurveyId(),
      category: this.resolveCategory(),
      title: this.surveyTitle.trim(),
      description: this.surveyDescription.trim(),
      daysLeft: this.getDaysLeft(),
      questions: this.buildSurveyQuestions(),
    };
  }

  /**
   * Builds the final survey questions from the current drafts.
   *
   * @returns The mapped survey questions.
   */
  private buildSurveyQuestions(): Survey['questions'] {
    return this.questions.map(
      (question, index) =>
        this.buildSurveyQuestion(
          question,
          index,
        ),
    );
  }

  /**
   * Builds one published survey question.
   *
   * @param question The question draft.
   * @param index The question index.
   * @returns The published question.
   */
  private buildSurveyQuestion(
    question: SurveyQuestionDraft,
    index: number,
  ): Survey['questions'][number] {
    return {
      id: index + 1,
      prompt: question.prompt.trim(),
      allowMultiple: question.allowMultipleAnswers,
      answers: this.buildQuestionAnswers(question),
    };
  }

  /**
   * Builds the published answer list for a question.
   *
   * @param question The question draft.
   * @returns The trimmed answers.
   */
  private buildQuestionAnswers(
    question: SurveyQuestionDraft,
  ): string[] {
    return question.answerFieldIndexes.map(
      (answerIndex) =>
        question.answers[answerIndex]?.trim() ?? '',
    );
  }

  /**
   * Returns whether all required survey fields are valid.
   *
   * @returns Whether the form is valid.
   */
  private hasValidRequiredFields(): boolean {
    if (!this.surveyTitle.trim()) {
      return false;
    }

    return this.questions.every(
      (question) =>
        this.isQuestionValid(question),
    );
  }

  /**
   * Validates one survey question.
   *
   * @param question The question draft to validate.
   * @returns Whether the question is valid.
   */
  private isQuestionValid(
    question: SurveyQuestionDraft,
  ): boolean {
    const answers = this.getTrimmedAnswers(
      question,
    );

    return (
      question.prompt.trim().length > 0 &&
      answers.length >= 2 &&
      answers.every(Boolean)
    );
  }

  /**
   * Returns all trimmed answers for a question.
   *
   * @param question The question draft.
   * @returns The trimmed answers.
   */
  private getTrimmedAnswers(
    question: SurveyQuestionDraft,
  ): string[] {
    return question.answerFieldIndexes.map(
      (index) =>
        (question.answers[index] ?? '').trim(),
    );
  }

  /**
   * Resolves the optional category selection.
   *
   * @returns An empty string when no category was selected.
   */
  private resolveCategory(): string {
    return this.selectedCategory ===
      CATEGORY_PLACEHOLDER_LABEL
      ? ''
      : this.selectedCategory;
  }

  /**
   * Calculates the remaining number of survey days.
   *
   * @returns The remaining days or the default value.
   */
  private getDaysLeft(): number {
    if (!this.endDate) {
      return DEFAULT_DAYS_LEFT;
    }

    return this.calculateDaysUntil(
      this.endDate,
    );
  }

  /**
   * Calculates the number of days until the selected date.
   *
   * @param endDate The selected end date.
   * @returns The remaining day count.
   */
  private calculateDaysUntil(
    endDate: string,
  ): number {
    const end = new Date(
      `${endDate}T00:00:00`,
    );

    const today = this.getStartOfToday();

    return Math.max(
      0,
      Math.ceil(
        (end.getTime() - today.getTime()) /
          MS_PER_DAY,
      ),
    );
  }

  /**
   * Checks whether a selected date is in the past.
   *
   * @param value The ISO date value to check.
   * @returns Whether the date is before today.
   */
  private isPastDate(value: string): boolean {
    const selectedDate = new Date(
      `${value}T00:00:00`,
    );

    return (
      selectedDate.getTime() <
      this.getStartOfToday().getTime()
    );
  }

  /**
   * Returns today's date at midnight.
   *
   * @returns Today's normalized Date object.
   */
  private getStartOfToday(): Date {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return today;
  }

  /**
   * Returns today's date in ISO format.
   *
   * @returns Today's ISO date string.
   */
  private getTodayIsoDate(): string {
    return this.toIsoDate(new Date());
  }

  /**
   * Converts a Date object to YYYY-MM-DD format.
   *
   * @param date The date to convert.
   * @returns The ISO date string.
   */
  private toIsoDate(date: Date): string {
    const year = String(date.getFullYear());

    const month = String(
      date.getMonth() + 1,
    ).padStart(2, '0');

    const day = String(
      date.getDate(),
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Formats an ISO date for display.
   *
   * @param value The ISO date value.
   * @returns The formatted date.
   */
  private formatEndDate(value: string): string {
    const [year, month, day] =
      value.split('-');

    return day && month && year
      ? `${day}.${month}.${year}`
      : '--.--.----';
  }

  /**
   * Returns the next available question ID.
   *
   * @returns The next question ID.
   */
  private getNextQuestionId(): number {
    if (!this.questions.length) {
      return 1;
    }

    return this.getHighestQuestionId() + 1;
  }

  /**
   * Returns the highest existing question ID.
   *
   * @returns The highest question ID.
   */
  private getHighestQuestionId(): number {
    return Math.max(
      ...this.questions.map(
        (question) => question.id,
      ),
    );
  }

  /**
   * Replaces a question at the specified index.
   *
   * @param index The question array index.
   * @param question The replacement question.
   */
  private replaceQuestion(
    index: number,
    question: SurveyQuestionDraft,
  ): void {
    this.questions = this.questions.map(
      (item, itemIndex) =>
        itemIndex === index
          ? question
          : item,
    );
  }

  /**
   * Creates an empty question draft with two required answers.
   *
   * @param id The ID assigned to the question.
   * @returns A new question draft.
   */
  private createQuestionItem(
    id: number,
  ): SurveyQuestionDraft {
    return {
      id,
      allowMultipleAnswers: false,
      answerFieldIndexes: [0, 1],
      prompt: '',
      answers: {
        0: '',
        1: '',
      },
    };
  }

  /**
   * Returns whether a click occurred outside the category dropdown.
   *
   * @param event The document click event.
   * @returns Whether the click was outside the dropdown.
   */
  private isOutsideCategoryDropdown(
    event: MouseEvent,
  ): boolean {
    const target =
      event.target as HTMLElement | null;

    return !target?.closest(
      '.category-dropdown',
    );
  }

  /**
   * Updates the background scroll behavior based on dialog mode.
   */
  private updateBodyScrollLock(): void {
    if (this.isDialog) {
      this.lockBodyScroll();
      return;
    }

    this.unlockBodyScroll();
  }

  /**
   * Prevents the page behind the dialog from scrolling.
   */
  private lockBodyScroll(): void {
    if (this.hasBodyScrollLock) {
      return;
    }

    this.document.body.classList.add(
      BODY_SCROLL_LOCK_CLASS,
    );

    this.hasBodyScrollLock = true;
  }

  /**
   * Restores normal page scrolling.
   */
  private unlockBodyScroll(): void {
    if (!this.hasBodyScrollLock) {
      return;
    }

    this.document.body.classList.remove(
      BODY_SCROLL_LOCK_CLASS,
    );

    this.hasBodyScrollLock = false;
  }
}