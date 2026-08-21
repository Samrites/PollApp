import { ChangeDetectorRef, Component, HostListener, OnDestroy, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CreateSurveyPage } from '../create-survey/create-survey-page';
import { SurveyQuestionComponent } from '../../shared/components/survey-question/survey-question';
import { type Survey, type SurveyStats } from '../../shared/interfaces/survey.interface';
import { SurveyStorageService } from '../../shared/services/survey-storage.service';
import { SurveyVoteStateService } from '../../shared/services/survey-vote-state.service';

const RESULTS_MOBILE_BREAKPOINT = 740;

@Component({
  selector: 'app-single-survey-page',
  imports: [CreateSurveyPage, RouterLink, SurveyQuestionComponent],
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
    this.routeParamSubscription = this.route.paramMap.subscribe((params) => {
      void this.loadSurveyById(params.get('id'));
    });
  }

  protected get isPastSurvey(): boolean { return !!this.survey && this.survey.daysLeft < 0; }
  protected get isVotingDisabled(): boolean { return this.isPastSurvey || this.hasCompletedSurvey; }
  protected get hasPreviewResults(): boolean { return this.totalResponses > 0 || this.hasSelections(); }
  protected get canCompleteSurvey(): boolean {
    return !!this.survey && this.survey.questions.every((question) => (this.selectedAnswers[question.id]?.length ?? 0) > 0);
  }

  ngOnDestroy(): void {
    this.routeParamSubscription?.unsubscribe();
    this.unsubscribeFromSurveyStats();
    this.clearCreatedOverlayTimer();
    this.clearVoteConfirmationTimer();
  }

  protected toggleAnswer(questionId: number, answerIndex: number): void {
    if (!this.survey || this.isVotingDisabled) return;
    const question = this.survey.questions.find((item) => item.id === questionId);
    if (!question) return;
    const current = this.selectedAnswers[questionId] ?? [];
    const next = question.allowMultiple
      ? current.includes(answerIndex)
        ? current.filter((id) => id !== answerIndex)
        : [...current, answerIndex]
      : current[0] === answerIndex ? [] : [answerIndex];
    this.selectedAnswers = { ...this.selectedAnswers, [questionId]: next };
  }

  protected async completeSurvey(): Promise<void> {
    if (!this.survey || this.isVotingDisabled || !this.canCompleteSurvey) return;
    try {
      const stats = await this.surveyStorage.saveSurveyResponse(
        this.survey.id,
        this.survey.questions,
        this.selectedAnswers as Record<number, number[]>,
      );
      this.voteState.markCompleted(this.survey.id);
      this.hasCompletedSurvey = true;
      this.showVoteConfirmation();
      this.applyStats(stats);
      this.selectedAnswers = {};
      this.scheduleChangeDetection();
    } catch (error) {
      console.error('Could not complete survey:', error);
    }
  }

  protected getResultPercent(questionId: number, answerIndex: number): number {
    const questionHasSelection = (this.selectedAnswers[questionId]?.length ?? 0) > 0;
    const previewVote = this.selectedAnswers[questionId]?.includes(answerIndex) ? 1 : 0;
    const previewResponse = questionHasSelection ? 1 : 0;
    const total = this.totalResponses + previewResponse;
    if (!total) return 0;
    const votes = (this.answerCounts[questionId]?.[answerIndex] ?? 0) + previewVote;
    return Math.max(0, Math.min(Math.round((votes / total) * 100), 100));
  }

  protected getAnswerLabel(index: number): string { return String.fromCharCode(65 + index); }
  protected toggleResults(): void {
    if (this.isResultsToggleVisible) this.isResultsOpen = !this.isResultsOpen;
  }
  protected openCreateSurveyDialog(): void { this.isCreateSurveyDialogOpen = true; }
  protected closeCreateSurveyDialog(): void { this.isCreateSurveyDialogOpen = false; }

  protected handleSurveyPublished(survey: Survey): void {
    this.pendingPublishedSurveyId = survey.id;
    this.isCreatedOverlayVisible = true;
    this.closeCreateSurveyDialog();
    this.startCreatedOverlayTimer();
  }

  protected hideCreatedOverlay(): void {
    this.isCreatedOverlayVisible = false;
    this.clearCreatedOverlayTimer();
    void this.navigateToPublishedSurvey();
  }

  @HostListener('window:resize') protected onWindowResize(): void { this.updateResultsToggleVisibility(); }
  @HostListener('document:keydown.escape') protected closeCreateSurveyDialogOnEscape(): void {
    if (this.isCreateSurveyDialogOpen) this.closeCreateSurveyDialog();
  }

  private async loadSurveyById(idParam: string | null): Promise<void> {
    const id = Number(idParam);
    const surveys = await this.surveyStorage.getAllSurveys();
    this.survey = surveys.find((item) => item.id === id) ?? null;
    if (!this.survey) {
      this.clearStateForMissingSurvey();
      return;
    }
    this.selectedAnswers = {};
    this.hasCompletedSurvey = this.voteState.hasCompleted(this.survey.id);
    this.applyStats(await this.surveyStorage.getSurveyStats(this.survey.id));
    this.subscribeToCurrentSurveyStats();
    this.scheduleChangeDetection();
  }

  private subscribeToCurrentSurveyStats(): void {
    this.unsubscribeFromSurveyStats();
    if (!this.survey) return;
    this.unsubscribeSurveyStats = this.surveyStorage.subscribeToSurveyStats(this.survey.id, (stats) => {
      this.applyStats(stats);
      this.scheduleChangeDetection();
    });
  }

  private unsubscribeFromSurveyStats(): void {
    this.unsubscribeSurveyStats?.();
    this.unsubscribeSurveyStats = null;
  }
  private applyStats(stats: SurveyStats): void {
    this.answerCounts = { ...stats.counts };
    this.totalResponses = stats.total;
  }
  private hasSelections(): boolean {
    return Object.values(this.selectedAnswers).some((ids) => (ids?.length ?? 0) > 0);
  }
  private updateResultsToggleVisibility(): void {
    if (typeof window === 'undefined') {
      this.isResultsToggleVisible = false;
      this.isResultsOpen = true;
      return;
    }
    this.isResultsToggleVisible = window.innerWidth <= RESULTS_MOBILE_BREAKPOINT;
    if (!this.isResultsToggleVisible) this.isResultsOpen = true;
  }
  private clearStateForMissingSurvey(): void {
    this.survey = null;
    this.selectedAnswers = {};
    this.answerCounts = {};
    this.totalResponses = 0;
    this.hasCompletedSurvey = false;
    this.unsubscribeFromSurveyStats();
    this.scheduleChangeDetection();
  }
  private startCreatedOverlayTimer(): void {
    this.clearCreatedOverlayTimer();
    this.createdOverlayTimeoutId = setTimeout(() => {
      this.isCreatedOverlayVisible = false;
      this.createdOverlayTimeoutId = null;
      void this.navigateToPublishedSurvey();
      this.scheduleChangeDetection();
    }, 3000);
  }
  private clearCreatedOverlayTimer(): void {
    if (!this.createdOverlayTimeoutId) return;
    clearTimeout(this.createdOverlayTimeoutId);
    this.createdOverlayTimeoutId = null;
  }
  private async navigateToPublishedSurvey(): Promise<void> {
    if (this.pendingPublishedSurveyId === null) return;
    const id = this.pendingPublishedSurveyId;
    this.pendingPublishedSurveyId = null;
    await this.router.navigate(['/single-survey', id]);
  }
  private showVoteConfirmation(): void {
    this.clearVoteConfirmationTimer();
    this.isVoteConfirmationVisible = true;
    this.voteConfirmationTimeoutId = setTimeout(() => {
      this.isVoteConfirmationVisible = false;
      this.voteConfirmationTimeoutId = null;
      this.scheduleChangeDetection();
    }, 2600);
  }
  private clearVoteConfirmationTimer(): void {
    if (!this.voteConfirmationTimeoutId) return;
    clearTimeout(this.voteConfirmationTimeoutId);
    this.voteConfirmationTimeoutId = null;
  }
  private scheduleChangeDetection(): void { setTimeout(() => this.cdr.detectChanges()); }
}
