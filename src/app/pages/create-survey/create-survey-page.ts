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
import { CATEGORY_PLACEHOLDER_LABEL, SURVEY_CATEGORIES } from '../../shared/constants/survey-categories';
import { CreateSurveyQuestionComponent } from '../../shared/components/create-survey-question/create-survey-question';
import { type Survey, type SurveyQuestionDraft } from '../../shared/interfaces/survey.interface';
import { SurveyStorageService } from '../../shared/services/survey-storage.service';

const MAX_INPUT_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 1000;
const DEFAULT_DAYS_LEFT = 30;
const MS_PER_DAY = 86_400_000;
const BODY_SCROLL_LOCK_CLASS = 'overlay-scroll-lock';

/** Create-survey dialog and form workflow. */
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
  protected questions: SurveyQuestionDraft[] = [this.createQuestionItem(1)];

  private hasBodyScrollLock = false;

  constructor(
    private readonly router: Router,
    private readonly surveyStorage: SurveyStorageService,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  @HostBinding('class.create-survey-dialog-mode')
  protected get isCreateSurveyDialogMode(): boolean { return this.isDialog; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isDialog']) this.updateBodyScrollLock();
  }

  ngOnDestroy(): void { this.unlockBodyScroll(); }

  protected closeCreateSurvey(): void {
    if (this.isDialog) {
      this.closeRequested.emit();
      return;
    }
    void this.router.navigate(['/']);
  }

  protected handleBackdropClick(event: MouseEvent): void {
    if (this.isDialog && event.target === event.currentTarget) this.closeCreateSurvey();
  }

  protected toggleCategoryDropdown(): void { this.isCategoryDropdownOpen = !this.isCategoryDropdownOpen; }
  protected selectCategory(category: string): void {
    this.selectedCategory = category;
    this.isCategoryDropdownOpen = false;
  }
  /** Clears a form control without changing unrelated form data. */
  protected clearField(control: HTMLInputElement | HTMLTextAreaElement): void { control.value = ''; }
  /** Updates the survey title while respecting the configured character limit. */
  protected updateSurveyTitle(value: string): void { this.surveyTitle = value.slice(0, MAX_INPUT_LENGTH); }

  /** Marks the survey title as touched so blur validation can be shown immediately. */
  protected markSurveyTitleTouched(): void { this.isSurveyTitleTouched = true; }
  protected updateSurveyDescription(value: string): void {
    this.surveyDescription = value.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  /** Keeps the optional date input empty until the user chooses a date. */
  protected updateEndDate(value: string): void {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      this.endDate = '';
      return;
    }
    this.endDate = this.isPastDate(trimmedValue) ? this.minEndDate : trimmedValue;
  }

  protected updateQuestion(updatedQuestion: SurveyQuestionDraft): void {
    this.questions = this.questions.map((question) =>
      question.id === updatedQuestion.id ? updatedQuestion : question,
    );
  }

  protected addQuestion(): void {
    if (this.questions.length >= this.maxQuestions) return;
    this.questions = [...this.questions, this.createQuestionItem(this.getNextQuestionId())];
  }

  /** Clears only the question text first and preserves already entered answers. */
  protected handleQuestionDelete(questionIndex: number): void {
    const question = this.questions[questionIndex];
    if (!question) return;
    if (question.prompt.trim()) {
      this.replaceQuestion(questionIndex, { ...question, prompt: '' });
      return;
    }
    if (this.questions.length === 1) return;
    this.questions = this.questions.filter((_, index) => index !== questionIndex);
  }

  protected isSurveyTitleInvalid(): boolean {
    return (this.showValidationErrors || this.isSurveyTitleTouched) && !this.surveyTitle.trim();
  }

  /** Publishes a valid survey, shows in-form feedback, then opens the new survey. */
  protected async publishSurvey(): Promise<void> {
    this.showValidationErrors = true;
    if (!this.hasValidRequiredFields()) return;
    try {
      const survey = await this.buildSurvey();
      await this.surveyStorage.addSurvey(survey);
      this.showPublishSuccess(survey);
    } catch (error) {
      console.error('Could not publish survey:', error);
    }
  }

  private showPublishSuccess(survey: Survey): void {
    this.isPublishSuccessVisible = true;
    setTimeout(() => {
      this.isPublishSuccessVisible = false;
      if (this.isDialog) this.surveyPublished.emit(survey);
      else void this.router.navigate(['/single-survey', survey.id]);
    }, 1400);
  }

  protected get formattedEndDate(): string {
    if (!this.endDate) return '--.--.----';
    const [year, month, day] = this.endDate.split('-');
    return day && month && year ? `${day}.${month}.${year}` : '--.--.----';
  }

  @HostListener('document:keydown.escape')
  protected closeDialogOnEscape(): void {
    if (this.isDialog) this.closeCreateSurvey();
  }

  @HostListener('document:click', ['$event'])
  protected closeCategoryDropdownOnOutsideClick(event: MouseEvent): void {
    if (!this.isCategoryDropdownOpen) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.category-dropdown')) this.isCategoryDropdownOpen = false;
  }

  private async buildSurvey(): Promise<Survey> {
    return {
      id: await this.surveyStorage.nextSurveyId(),
      category: this.resolveCategory(),
      title: this.surveyTitle.trim(),
      description: this.surveyDescription.trim(),
      daysLeft: this.getDaysLeft(),
      questions: this.questions.map((question, index) => ({
        id: index + 1,
        prompt: question.prompt.trim(),
        allowMultiple: question.allowMultipleAnswers,
        answers: question.answerFieldIndexes.map((answerIndex) =>
          question.answers[answerIndex]?.trim() ?? '',
        ),
      })),
    };
  }

  private hasValidRequiredFields(): boolean {
    if (!this.surveyTitle.trim()) return false;
    return this.questions.every((question) => {
      const answers = question.answerFieldIndexes.map((index) =>
        (question.answers[index] ?? '').trim(),
      );
      return question.prompt.trim().length > 0 && answers.length >= 2 && answers.every(Boolean);
    });
  }

  private resolveCategory(): string {
    return this.selectedCategory === CATEGORY_PLACEHOLDER_LABEL ? '' : this.selectedCategory;
  }

  private getDaysLeft(): number {
    if (!this.endDate) return DEFAULT_DAYS_LEFT;
    const end = new Date(`${this.endDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / MS_PER_DAY));
  }

  private isPastDate(value: string): boolean {
    const selectedDate = new Date(`${value}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate.getTime() < today.getTime();
  }

  private getTodayIsoDate(): string { return this.toIsoDate(new Date()); }
  private toIsoDate(date: Date): string {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  private getNextQuestionId(): number {
    return this.questions.length ? Math.max(...this.questions.map((question) => question.id)) + 1 : 1;
  }

  private replaceQuestion(index: number, question: SurveyQuestionDraft): void {
    this.questions = this.questions.map((item, itemIndex) =>
      itemIndex === index ? question : item,
    );
  }

  private createQuestionItem(id: number): SurveyQuestionDraft {
    return {
      id,
      allowMultipleAnswers: false,
      answerFieldIndexes: [0, 1],
      prompt: '',
      answers: { 0: '', 1: '' },
    };
  }
  private updateBodyScrollLock(): void {
    if (this.isDialog) this.lockBodyScroll();
    else this.unlockBodyScroll();
  }
  private lockBodyScroll(): void {
    if (this.hasBodyScrollLock) return;
    this.document.body.classList.add(BODY_SCROLL_LOCK_CLASS);
    this.hasBodyScrollLock = true;
  }
  private unlockBodyScroll(): void {
    if (!this.hasBodyScrollLock) return;
    this.document.body.classList.remove(BODY_SCROLL_LOCK_CLASS);
    this.hasBodyScrollLock = false;
  }
}
