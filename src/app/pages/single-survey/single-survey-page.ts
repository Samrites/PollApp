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
 * Handles answer selection, result previews, survey completion,
 * realtime statistics, responsive result visibility,
 * and navigation to newly published surveys.
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
  protected answerCounts: Record<number, number[]> = {};
  protected totalResponses = 0;

  protected isResultsOpen = true;
  protected isResultsToggleVisible = false;

  protected survey: Survey | null = null;
  protected hasCompletedSurvey = false;
  protected isVoteConfirmationVisible = false;

  private routeParamSubscription: Subscription | null = null;
  private unsubscribeSurveyStats: (() => void) | null = null;

  private createdOverlayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private voteConfirmationTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private pendingPublishedSurveyId: number | null = null;

  /**
   * Creates the single-survey page.
   *
   * Initializes responsive result visibility and subscribes
   * to survey ID changes from the current route.
   *
   * @param route The active route containing the survey ID.
   * @param router Angular router used for navigation.
   * @param cdr Change detector used after asynchronous updates.
   * @param surveyStorage Service used to load surveys and statistics.
   * @param voteState Service used to track completed surveys.
   */
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly surveyStorage: SurveyStorageService,
    private readonly voteState: SurveyVoteStateService,
  ) {
    this.updateResultsToggleVisibility();
    this.subscribeToRouteChanges();
  }

  /**
   * Returns whether the currently displayed survey has already ended.
   *
   * @returns Whether the survey is in the past.
   */
  protected get isPastSurvey(): boolean {
    return !!this.survey && this.survey.daysLeft < 0;
  }

  /**
   * Returns whether voting is disabled.
   *
   * Voting is disabled for past surveys and surveys
   * that have already been completed.
   *
   * @returns Whether answer selection is disabled.
   */
  protected get isVotingDisabled(): boolean {
    return this.isPastSurvey || this.hasCompletedSurvey;
  }

  /**
   * Returns whether result data or temporary selections exist.
   *
   * @returns Whether result preview data is available.
   */
  protected get hasPreviewResults(): boolean {
    return this.totalResponses > 0 || this.hasSelections();
  }

  /**
   * Returns whether every question has at least one selected answer.
   *
   * @returns Whether the survey can be completed.
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
    this.unsubscribeFromRouteChanges();
    this.unsubscribeFromSurveyStats();
    this.clearCreatedOverlayTimer();
    this.clearVoteConfirmationTimer();
  }

  /**
   * Toggles an answer selection for a survey question.
   *
   * @param questionId The ID of the survey question.
   * @param answerIndex The index of the selected answer.
   */
  protected toggleAnswer(
    questionId: number,
    answerIndex: number,
  ): void {
    if (!this.canToggleAnswer()) {
      return;
    }

    const question = this.findQuestion(questionId);

    if (!question) {
      return;
    }

    this.updateAnswerSelection(
      questionId,
      answerIndex,
      question.allowMultiple,
    );
  }

  /**
   * Saves the selected answers and marks the survey as completed.
   */
  protected async completeSurvey(): Promise<void> {
    if (!this.canSubmitSurvey()) {
      return;
    }

    try {
      await this.processSurveyCompletion();
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
   * @param questionId The ID of the survey question.
   * @param answerIndex The index of the answer.
   * @returns The result percentage from 0 to 100.
   */
  protected getResultPercent(
    questionId: number,
    answerIndex: number,
  ): number {
    const total = this.getPreviewTotal(questionId);

    if (!total) {
      return 0;
    }

    const votes = this.getPreviewVotes(
      questionId,
      answerIndex,
    );

    return this.calculatePercentage(
      votes,
      total,
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
   * Opens or closes the results panel on mobile screens.
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

    void this.navigateToSurvey(survey.id);
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
   * Updates mobile result visibility after a viewport resize.
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
   * Subscribes to route parameter changes.
   */
  private subscribeToRouteChanges(): void {
    this.routeParamSubscription =
      this.route.paramMap.subscribe((params) => {
        void this.loadSurveyById(params.get('id'));
      });
  }

  /**
   * Removes the route parameter subscription.
   */
  private unsubscribeFromRouteChanges(): void {
    this.routeParamSubscription?.unsubscribe();
    this.routeParamSubscription = null;
  }

  /**
   * Returns whether an answer can currently be toggled.
   *
   * @returns Whether answer selection is allowed.
   */
  private canToggleAnswer(): boolean {
    return !!this.survey && !this.isVotingDisabled;
  }

  /**
   * Finds a question by ID.
   *
   * @param questionId The question ID.
   * @returns The matching question or undefined.
   */
  private findQuestion(
    questionId: number,
  ): Survey['questions'][number] | undefined {
    return this.survey?.questions.find(
      (question) => question.id === questionId,
    );
  }

  /**
   * Updates the selected answers for one question.
   *
   * @param questionId The question ID.
   * @param answerIndex The selected answer index.
   * @param allowMultiple Whether multiple answers are allowed.
   */
  private updateAnswerSelection(
    questionId: number,
    answerIndex: number,
    allowMultiple: boolean,
  ): void {
    const currentAnswers =
      this.selectedAnswers[questionId] ?? [];

    const nextAnswers = allowMultiple
      ? this.toggleMultipleAnswer(currentAnswers, answerIndex)
      : this.toggleSingleAnswer(currentAnswers, answerIndex);

    this.selectedAnswers = {
      ...this.selectedAnswers,
      [questionId]: nextAnswers,
    };
  }

  /**
   * Returns whether the current survey can be submitted.
   *
   * @returns Whether survey completion is allowed.
   */
  private canSubmitSurvey(): boolean {
    return (
      !!this.survey &&
      !this.isVotingDisabled &&
      this.canCompleteSurvey
    );
  }

  /**
   * Processes a valid survey completion.
   */
  private async processSurveyCompletion(): Promise<void> {
    const stats = await this.saveCurrentSurveyResponse();

    this.markSurveyCompleted();
    this.applyStats(stats);

    this.showVoteConfirmation();
    this.scheduleChangeDetection();
  }

  /**
   * Marks the current survey as completed locally.
   */
  private markSurveyCompleted(): void {
    if (!this.survey) {
      return;
    }

    this.voteState.markCompleted(this.survey.id);
    this.hasCompletedSurvey = true;
    this.selectedAnswers = {};
  }

  /**
   * Returns the preview response total for one question.
   *
   * @param questionId The question ID.
   * @returns The total responses including the current preview.
   */
  private getPreviewTotal(questionId: number): number {
    const hasSelection =
      (this.selectedAnswers[questionId]?.length ?? 0) > 0;

    return this.totalResponses + (hasSelection ? 1 : 0);
  }

  /**
   * Returns preview vote count for one answer.
   *
   * @param questionId The question ID.
   * @param answerIndex The answer index.
   * @returns The stored and preview vote count.
   */
  private getPreviewVotes(
    questionId: number,
    answerIndex: number,
  ): number {
    const storedVotes =
      this.answerCounts[questionId]?.[answerIndex] ?? 0;

    const previewVote =
      this.selectedAnswers[questionId]?.includes(answerIndex)
        ? 1
        : 0;

    return storedVotes + previewVote;
  }

  /**
   * Calculates a bounded percentage.
   *
   * @param votes The vote count.
   * @param total The response total.
   * @returns A percentage from 0 to 100.
   */
  private calculatePercentage(
    votes: number,
    total: number,
  ): number {
    const percentage =
      Math.round((votes / total) * 100);

    return Math.max(
      0,
      Math.min(percentage, 100),
    );
  }

  /**
   * Loads a survey using the route parameter.
   *
   * @param idParam The route parameter containing the survey ID.
   */
  private async loadSurveyById(
    idParam: string | null,
  ): Promise<void> {
    const survey = await this.findSurveyById(idParam);

    if (!survey) {
      this.clearStateForMissingSurvey();
      return;
    }

    this.survey = survey;

    await this.initializeLoadedSurvey();
  }

  /**
   * Finds a survey using a route parameter.
   *
   * @param idParam The route parameter containing the survey ID.
   * @returns The matching survey or null.
   */
  private async findSurveyById(
    idParam: string | null,
  ): Promise<Survey | null> {
    const id = Number(idParam);
    const surveys =
      await this.surveyStorage.getAllSurveys();

    return (
      surveys.find((survey) => survey.id === id) ??
      null
    );
  }

  /**
   * Initializes voting state and statistics for the loaded survey.
   */
  private async initializeLoadedSurvey(): Promise<void> {
    if (!this.survey) {
      return;
    }

    this.resetSelectedAnswers();
    this.restoreCompletedState();

    await this.loadCurrentSurveyStats();

    this.subscribeToCurrentSurveyStats();
    this.scheduleChangeDetection();
  }

  /**
   * Clears the current answer selections.
   */
  private resetSelectedAnswers(): void {
    this.selectedAnswers = {};
  }

  /**
   * Restores the completed state of the current survey.
   */
  private restoreCompletedState(): void {
    if (!this.survey) {
      return;
    }

    this.hasCompletedSurvey =
      this.voteState.hasCompleted(this.survey.id);
  }

  /**
   * Loads statistics for the current survey.
   */
  private async loadCurrentSurveyStats(): Promise<void> {
    if (!this.survey) {
      return;
    }

    const stats =
      await this.surveyStorage.getSurveyStats(
        this.survey.id,
      );

    this.applyStats(stats);
  }

  /**
   * Saves the response for the currently loaded survey.
   *
   * @returns The updated survey statistics.
   */
  private async saveCurrentSurveyResponse(): Promise<SurveyStats> {
    if (!this.survey) {
      throw new Error(
        'No survey is currently loaded.',
      );
    }

    return this.surveyStorage.saveSurveyResponse(
      this.survey.id,
      this.survey.questions,
      this.selectedAnswers as Record<number, number[]>,
    );
  }

  /**
   * Toggles an answer for a multiple-choice question.
   *
   * @param currentAnswers The current answer indexes.
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
   * @returns The updated answer selection.
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
   * Subscribes to realtime statistics for the current survey.
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
          this.handleSurveyStatsUpdate(stats);
        },
      );
  }

  /**
   * Handles updated survey statistics.
   *
   * @param stats The updated statistics.
   */
  private handleSurveyStatsUpdate(
    stats: SurveyStats,
  ): void {
    this.applyStats(stats);
    this.scheduleChangeDetection();
  }

  /**
   * Removes the current survey-statistics subscription.
   */
  private unsubscribeFromSurveyStats(): void {
    this.unsubscribeSurveyStats?.();
    this.unsubscribeSurveyStats = null;
  }

  /**
   * Applies survey statistics to local state.
   *
   * @param stats The survey statistics.
   */
  private applyStats(stats: SurveyStats): void {
    this.answerCounts = {
      ...stats.counts,
    };

    this.totalResponses = stats.total;
  }

  /**
   * Returns whether the user currently has selected answers.
   *
   * @returns Whether at least one answer is selected.
   */
  private hasSelections(): boolean {
    return Object.values(this.selectedAnswers).some(
      (ids) => (ids?.length ?? 0) > 0,
    );
  }

  /**
   * Updates whether the mobile result toggle is visible.
   */
  private updateResultsToggleVisibility(): void {
    if (typeof window === 'undefined') {
      this.setDesktopResultsState();
      return;
    }

    this.isResultsToggleVisible =
      window.innerWidth <= RESULTS_MOBILE_BREAKPOINT;

    if (!this.isResultsToggleVisible) {
      this.isResultsOpen = true;
    }
  }

  /**
   * Sets the non-browser result state.
   */
  private setDesktopResultsState(): void {
    this.isResultsToggleVisible = false;
    this.isResultsOpen = true;
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

    this.createdOverlayTimeoutId = setTimeout(
      () => {
        this.finishCreatedOverlay();
      },
      3000,
    );
  }

  /**
   * Finishes the created-survey overlay workflow.
   */
  private finishCreatedOverlay(): void {
    this.isCreatedOverlayVisible = false;
    this.createdOverlayTimeoutId = null;

    void this.navigateToPublishedSurvey();
    this.scheduleChangeDetection();
  }

  /**
   * Clears the created-survey overlay timer.
   */
  private clearCreatedOverlayTimer(): void {
    if (!this.createdOverlayTimeoutId) {
      return;
    }

    clearTimeout(this.createdOverlayTimeoutId);
    this.createdOverlayTimeoutId = null;
  }

  /**
   * Navigates to the pending published survey.
   */
  private async navigateToPublishedSurvey(): Promise<void> {
    if (this.pendingPublishedSurveyId === null) {
      return;
    }

    const surveyId =
      this.pendingPublishedSurveyId;

    this.pendingPublishedSurveyId = null;

    await this.navigateToSurvey(surveyId);
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
   * Displays the vote-confirmation message.
   */
  private showVoteConfirmation(): void {
    this.clearVoteConfirmationTimer();
    this.isVoteConfirmationVisible = true;

    this.voteConfirmationTimeoutId = setTimeout(
      () => {
        this.hideVoteConfirmation();
      },
      2600,
    );
  }

  /**
   * Hides the vote-confirmation message.
   */
  private hideVoteConfirmation(): void {
    this.isVoteConfirmationVisible = false;
    this.voteConfirmationTimeoutId = null;

    this.scheduleChangeDetection();
  }

  /**
   * Clears the vote-confirmation timer.
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
    setTimeout(() => {
      this.cdr.detectChanges();
    });
  }
}