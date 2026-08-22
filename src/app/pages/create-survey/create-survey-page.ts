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

  constructor(
    private readonly router: Router,
    private readonly surveyStorage: SurveyStorageService,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  /**
   * Returns whether the component is currently displayed as a dialog.
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
   * The field remains empty until the user selects a date.
   *
   * @param value The selected ISO date value.
   */
  protected updateEndDate(value: string): void {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      this.endDate = '';
      return;
    }

    this.endDate = this.isPastDate(trimmedValue)
      ? this.minEndDate
      : trimmedValue;
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
   * Clears only the question text on the first delete action.
   *
   * Existing answers remain untouched. An empty question can be removed
   * when more than one question exists.
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

    if (question.prompt.trim()) {
      this.replaceQuestion(
        questionIndex,
        {
          ...question,
          prompt: '',
        },
      );
      return;
    }

    if (this.questions.length === 1) {
      return;
    }

    this.questions = this.questions.filter(
      (_, index) => index !== questionIndex,
    );
  }

  /**
   * Returns whether the survey title should currently display an error.
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
   *
   * After publishing, a success message is shown before navigation.
   */
  protected async publishSurvey(): Promise<void> {
    this.showValidationErrors = true;

    if (!this.hasValidRequiredFields()) {
      return;
    }

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
   * Returns the selected end date in display format.
   */
  protected get formattedEndDate(): string {
    if (!this.endDate) {
      return '--.--.----';
    }

    const [year, month, day] =
      this.endDate.split('-');

    return day && month && year
      ? `${day}.${month}.${year}`
      : '--.--.----';
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

    const target =
      event.target as HTMLElement | null;

    if (!target?.closest('.category-dropdown')) {
      this.isCategoryDropdownOpen = false;
    }
  }

  /**
   * Shows the publish confirmation and opens the new survey.
   *
   * @param survey The newly published survey.
   */
  private showPublishSuccess(survey: Survey): void {
    this.isPublishSuccessVisible = true;

    setTimeout(() => {
      this.isPublishSuccessVisible = false;

      if (this.isDialog) {
        this.surveyPublished.emit(survey);
        return;
      }

      void this.router.navigate([
        '/single-survey',
        survey.id,
      ]);
    }, 1400);
  }

  /**
   * Builds the final survey object from the current form state.
   *
   * @returns The completed survey object.
   */
  private async buildSurvey(): Promise<Survey> {
    return {
      id:
        await this.surveyStorage.nextSurveyId(),

      category:
        this.resolveCategory(),

      title:
        this.surveyTitle.trim(),

      description:
        this.surveyDescription.trim(),

      daysLeft:
        this.getDaysLeft(),

      questions:
        this.buildSurveyQuestions(),
    };
  }

  /**
   * Builds the final survey questions from the current drafts.
   *
   * @returns The mapped survey questions.
   */
  private buildSurveyQuestions(): Survey['questions'] {
    return this.questions.map(
      (question, index) => ({
        id: index + 1,
        prompt: question.prompt.trim(),
        allowMultiple:
          question.allowMultipleAnswers,
        answers:
          question.answerFieldIndexes.map(
            (answerIndex) =>
              question.answers[
                answerIndex
              ]?.trim() ?? '',
          ),
      }),
    );
  }

  /**
   * Returns whether all required survey fields are valid.
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
   * Validates one survey question including all required answers.
   *
   * @param question The question draft to validate.
   * @returns Whether the question is valid.
   */
  private isQuestionValid(
    question: SurveyQuestionDraft,
  ): boolean {
    const answers =
      question.answerFieldIndexes.map(
        (index) =>
          (
            question.answers[index] ?? ''
          ).trim(),
      );

    return (
      question.prompt.trim().length > 0 &&
      answers.length >= 2 &&
      answers.every(Boolean)
    );
  }

  /**
   * Resolves the optional category selection.
   *
   * @returns An empty string when no category was selected.
   */
  private resolveCategory(): string {
    return (
      this.selectedCategory ===
      CATEGORY_PLACEHOLDER_LABEL
    )
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

    const end = new Date(
      `${this.endDate}T00:00:00`,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.max(
      0,
      Math.ceil(
        (
          end.getTime() -
          today.getTime()
        ) / MS_PER_DAY,
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
      selectedDate.getTime() <
      today.getTime()
    );
  }

  /**
   * Returns today's date in ISO format.
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
    const year = String(
      date.getFullYear(),
    );

    const month = String(
      date.getMonth() + 1,
    ).padStart(2, '0');

    const day = String(
      date.getDate(),
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Returns the next available question ID.
   */
  private getNextQuestionId(): number {
    if (!this.questions.length) {
      return 1;
    }

    return (
      Math.max(
        ...this.questions.map(
          (question) => question.id,
        ),
      ) + 1
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