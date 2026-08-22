import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  ViewEncapsulation,
} from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
} from '@angular/router';
import { Subscription } from 'rxjs';

import { CreateSurveyPage } from '../create-survey/create-survey-page';
import { SurveyQuestionComponent } from '../../shared/components/survey-question/survey-question';
import {
  type Survey,
  type SurveyStats,
} from '../../shared/interfaces/survey.interface';
import { SurveyStorageService } from '../../shared/services/survey-storage.service';
import { SurveyVoteStateService } from '../../shared/services/survey-vote-state.service';

const RESULTS_MOBILE_BREAKPOINT = 740;

/**
 * Displays the detail view of a single survey.
 *
 * The component handles answer selection, live result previews,
 * survey completion, persisted statistics, responsive result visibility,
 * and navigation to newly created surveys.
 */
@Component({
  selector: 'app-single-survey-page',
  imports: [
    CreateSurveyPage,
    RouterLink,
    SurveyQuestionComponent,
  ],
  templateUrl: './single-survey-page.html',
  styleUrl: './single-survey-page.scss',
  encapsulation: ViewEncapsulation.None,
})
export class SingleSurveyPage implements OnDestroy {
  protected isCreatedOverlayVisible = false;
  protected isCreateSurveyDialogOpen = false;
  protected selectedAnswers: Partial<Record<number, number[]>> = {};
  protected totalResponses = 0;
  protected answerCounts: Record<number, number[]> = {};
  protected isResultsOpen = true;
  protected isResultsToggleVisible = false;
  protected survey: Survey | null = null;
  protected hasCompletedSurvey = false;
  protected isVoteConfirmationVisible = false;

  private routeParamSubscription: Subscription | null = null;
  private unsubscribeSurveyStats: (() => void) | null = null;
  private createdOverlayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingPublishedSurveyId: number | null = null;
  private voteConfirmationTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly surveyStorage: SurveyStorageService,
    private readonly voteState: SurveyVoteStateService,
  ) {
    this.updateResultsToggleVisibility();

    this.routeParamSubscription =
      this.route.paramMap.subscribe((params) => {
        void this.loadSurveyById(params.get('id'));
      });
  }

  /**
   * Returns whether the currently displayed survey has already ended.
   */
  protected get isPastSurvey(): boolean {
    return !!this.survey && this.survey.daysLeft < 0;
  }

  /**
   * Returns whether voting is disabled for the current survey.
   *
   * Voting is disabled for past surveys and surveys that the user
   * has already completed.
   */
  protected get isVotingDisabled(): boolean {
    return this.isPastSurvey || this.hasCompletedSurvey;
  }

  /**
   * Returns whether result data or temporary answer selections exist.
   */
  protected get hasPreviewResults(): boolean {
    return this.totalResponses > 0 || this.hasSelections();
  }

  /**
   * Returns whether every survey question currently has a selected answer.
   */
  protected get canCompleteSurvey(): boolean {
    if (!this.survey) {
      return false;
    }

    return this.survey.questions.every(
      (question) =>
        (this.selectedAnswers[question.id]?.length ?? 0) > 0,
    );
  }

  /**
   * Cleans up subscriptions and active timers.
   */
  ngOnDestroy(): void {
    this.routeParamSubscription?.unsubscribe();

    this.unsubscribeFromSurveyStats();
    this.clearCreatedOverlayTimer();
    this.clearVoteConfirmationTimer();
  }

  /**
   * Toggles an answer selection for a survey question.
   *
   * Multiple-answer questions allow several active answers.
   * Single-answer questions only keep one selected answer.
   *
   * @param questionId The ID of the survey question.
   * @param answerIndex The index of the selected answer.
   */
  protected toggleAnswer(
    questionId: number,
    answerIndex: number,
  ): void {
    if (!this.survey || this.isVotingDisabled) {
      return;
    }

    const question = this.survey.questions.find(
      (item) => item.id === questionId,
    );

    if (!question) {
      return;
    }

    const currentAnswers =
      this.selectedAnswers[questionId] ?? [];

    const nextAnswers = question.allowMultiple
      ? this.toggleMultipleAnswer(currentAnswers, answerIndex)
      : this.toggleSingleAnswer(currentAnswers, answerIndex);

    this.selectedAnswers = {
      ...this.selectedAnswers,
      [questionId]: nextAnswers,
    };
  }

  /**
   * Saves the selected survey answers and marks the survey as completed.
   */
  protected async completeSurvey(): Promise<void> {
    if (
      !this.survey ||
      this.isVotingDisabled ||
      !this.canCompleteSurvey
    ) {
      return;
    }

    try {
      const stats = await this.saveCurrentSurveyResponse();

      this.voteState.markCompleted(this.survey.id);
      this.hasCompletedSurvey = true;
      this.selectedAnswers = {};

      this.showVoteConfirmation();
      this.applyStats(stats);
      this.scheduleChangeDetection();
    } catch (error) {
      console.error(
        'Could not complete survey:',
        error,
      );
    }
  }

  /**
   * Calculates the percentage for a result option.
   *
   * Current answer selections are included as a temporary live preview
   * before the survey is submitted.
   *
   * @param questionId The ID of the survey question.
   * @param answerIndex The index of the answer.
   * @returns The result percentage from 0 to 100.
   */
  protected getResultPercent(
    questionId: number,
    answerIndex: number,
  ): number {
    const questionHasSelection =
      (this.selectedAnswers[questionId]?.length ?? 0) > 0;

    const previewVote =
      this.selectedAnswers[questionId]?.includes(answerIndex)
        ? 1
        : 0;

    const previewResponse =
      questionHasSelection ? 1 : 0;

    const total =
      this.totalResponses + previewResponse;

    if (!total) {
      return 0;
    }

    const votes =
      (this.answerCounts[questionId]?.[answerIndex] ?? 0) +
      previewVote;

    return Math.max(
      0,
      Math.min(
        Math.round((votes / total) * 100),
        100,
      ),
    );
  }

  /**
   * Converts an answer index to its alphabetical label.
   *
   * @param index The zero-based answer index.
   * @returns A label such as A, B, C, or D.
   */
  protected getAnswerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  /**
   * Opens or closes the result panel on mobile screens.
   */
  protected toggleResults(): void {
    if (!this.isResultsToggleVisible) {
      return;
    }

    this.isResultsOpen = !this.isResultsOpen;
  }

  /**
   * Opens the create-survey dialog.
   */
  protected openCreateSurveyDialog(): void {
    this.isCreateSurveyDialogOpen = true;
  }

  /**
   * Closes the create-survey dialog.
   */
  protected closeCreateSurveyDialog(): void {
    this.isCreateSurveyDialogOpen = false;
  }

  /**
   * Handles a newly published survey and opens its detail page.
   *
   * @param survey The newly published survey.
   */
  protected handleSurveyPublished(survey: Survey): void {
    this.closeCreateSurveyDialog();

    void this.router.navigate([
      '/single-survey',
      survey.id,
    ]);
  }

  /**
   * Hides the created-survey overlay and continues navigation.
   */
  protected hideCreatedOverlay(): void {
    this.isCreatedOverlayVisible = false;

    this.clearCreatedOverlayTimer();
    void this.navigateToPublishedSurvey();
  }

  /**
   * Updates the mobile result toggle after a viewport resize.
   */
  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.updateResultsToggleVisibility();
  }

  /**
   * Closes the create-survey dialog when Escape is pressed.
   */
  @HostListener('document:keydown.escape')
  protected closeCreateSurveyDialogOnEscape(): void {
    if (this.isCreateSurveyDialogOpen) {
      this.closeCreateSurveyDialog();
    }
  }

  /**
   * Loads a survey from storage using the route parameter.
   *
   * @param idParam The route parameter containing the survey ID.
   */
  private async loadSurveyById(
    idParam: string | null,
  ): Promise<void> {
    const id = Number(idParam);
    const surveys =
      await this.surveyStorage.getAllSurveys();

    this.survey =
      surveys.find((item) => item.id === id) ?? null;

    if (!this.survey) {
      this.clearStateForMissingSurvey();
      return;
    }

    await this.initializeLoadedSurvey();
  }

  /**
   * Initializes voting state and statistics for the loaded survey.
   */
  private async initializeLoadedSurvey(): Promise<void> {
    if (!this.survey) {
      return;
    }

    this.selectedAnswers = {};

    this.hasCompletedSurvey =
      this.voteState.hasCompleted(this.survey.id);

    const stats =
      await this.surveyStorage.getSurveyStats(
        this.survey.id,
      );

    this.applyStats(stats);
    this.subscribeToCurrentSurveyStats();
    this.scheduleChangeDetection();
  }

  /**
   * Saves the response for the currently loaded survey.
   *
   * @returns The updated survey statistics.
   */
  private async saveCurrentSurveyResponse(): Promise<SurveyStats> {
    if (!this.survey) {
      throw new Error('No survey is currently loaded.');
    }

    return this.surveyStorage.saveSurveyResponse(
      this.survey.id,
      this.survey.questions,
      this.selectedAnswers as Record<number, number[]>,
    );
  }

  /**
   * Toggles an answer in a multiple-choice answer collection.
   *
   * @param currentAnswers The currently selected answer indexes.
   * @param answerIndex The answer index to toggle.
   * @returns The updated answer indexes.
   */
  private toggleMultipleAnswer(
    currentAnswers: number[],
    answerIndex: number,
  ): number[] {
    if (currentAnswers.includes(answerIndex)) {
      return currentAnswers.filter(
        (id) => id !== answerIndex,
      );
    }

    return [...currentAnswers, answerIndex];
  }

  /**
   * Toggles the selected answer for a single-choice question.
   *
   * @param currentAnswers The current answer selection.
   * @param answerIndex The selected answer index.
   * @returns The updated single-answer selection.
   */
  private toggleSingleAnswer(
    currentAnswers: number[],
    answerIndex: number,
  ): number[] {
    return currentAnswers[0] === answerIndex
      ? []
      : [answerIndex];
  }

  /**
   * Subscribes to live statistics for the current survey.
   */
  private subscribeToCurrentSurveyStats(): void {
    this.unsubscribeFromSurveyStats();

    if (!this.survey) {
      return;
    }

    this.unsubscribeSurveyStats =
      this.surveyStorage.subscribeToSurveyStats(
        this.survey.id,
        (stats) => {
          this.applyStats(stats);
          this.scheduleChangeDetection();
        },
      );
  }

  /**
   * Removes the current live survey-statistics subscription.
   */
  private unsubscribeFromSurveyStats(): void {
    this.unsubscribeSurveyStats?.();
    this.unsubscribeSurveyStats = null;
  }

  /**
   * Applies survey statistics to the local component state.
   *
   * @param stats The survey statistics to apply.
   */
  private applyStats(stats: SurveyStats): void {
    this.answerCounts = {
      ...stats.counts,
    };

    this.totalResponses = stats.total;
  }

  /**
   * Returns whether the user currently has any selected answers.
   */
  private hasSelections(): boolean {
    return Object.values(this.selectedAnswers).some(
      (ids) => (ids?.length ?? 0) > 0,
    );
  }

  /**
   * Updates whether the mobile result-toggle control should be visible.
   */
  private updateResultsToggleVisibility(): void {
    if (typeof window === 'undefined') {
      this.isResultsToggleVisible = false;
      this.isResultsOpen = true;
      return;
    }

    this.isResultsToggleVisible =
      window.innerWidth <= RESULTS_MOBILE_BREAKPOINT;

    if (!this.isResultsToggleVisible) {
      this.isResultsOpen = true;
    }
  }

  /**
   * Resets the view when the requested survey cannot be found.
   */
  private clearStateForMissingSurvey(): void {
    this.survey = null;
    this.selectedAnswers = {};
    this.answerCounts = {};
    this.totalResponses = 0;
    this.hasCompletedSurvey = false;

    this.unsubscribeFromSurveyStats();
    this.scheduleChangeDetection();
  }

  /**
   * Starts the created-survey overlay timer.
   */
  private startCreatedOverlayTimer(): void {
    this.clearCreatedOverlayTimer();

    this.createdOverlayTimeoutId = setTimeout(() => {
      this.isCreatedOverlayVisible = false;
      this.createdOverlayTimeoutId = null;

      void this.navigateToPublishedSurvey();
      this.scheduleChangeDetection();
    }, 3000);
  }

  /**
   * Clears the created-survey overlay timer if it is active.
   */
  private clearCreatedOverlayTimer(): void {
    if (!this.createdOverlayTimeoutId) {
      return;
    }

    clearTimeout(this.createdOverlayTimeoutId);
    this.createdOverlayTimeoutId = null;
  }

  /**
   * Navigates to the pending newly published survey.
   */
  private async navigateToPublishedSurvey(): Promise<void> {
    if (this.pendingPublishedSurveyId === null) {
      return;
    }

    const id = this.pendingPublishedSurveyId;

    this.pendingPublishedSurveyId = null;

    await this.router.navigate([
      '/single-survey',
      id,
    ]);
  }

  /**
   * Displays the vote-confirmation message for a short period.
   */
  private showVoteConfirmation(): void {
    this.clearVoteConfirmationTimer();
    this.isVoteConfirmationVisible = true;

    this.voteConfirmationTimeoutId = setTimeout(() => {
      this.isVoteConfirmationVisible = false;
      this.voteConfirmationTimeoutId = null;

      this.scheduleChangeDetection();
    }, 2600);
  }

  /**
   * Clears the vote-confirmation timer if it is active.
   */
  private clearVoteConfirmationTimer(): void {
    if (!this.voteConfirmationTimeoutId) {
      return;
    }

    clearTimeout(this.voteConfirmationTimeoutId);
    this.voteConfirmationTimeoutId = null;
  }

  /**
   * Schedules Angular change detection after asynchronous updates.
   */
  private scheduleChangeDetection(): void {
    setTimeout(() => this.cdr.detectChanges());
  }
}