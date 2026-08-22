import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { Router } from '@angular/router';

import { CreateSurveyPage } from '../create-survey/create-survey-page';
import { SurveyCardComponent } from '../../shared/components/survey-card/survey-card';
import { SURVEY_CATEGORIES } from '../../shared/constants/survey-categories';
import { type Survey } from '../../shared/interfaces/survey.interface';
import { SurveyStorageService } from '../../shared/services/survey-storage.service';

/**
 * Displays the PollApp home page.
 *
 * Handles survey loading, category filtering, active and past survey views,
 * create-survey dialog state, and navigation to newly published surveys.
 */
@Component({
  selector: 'app-home-page',
  imports: [CreateSurveyPage, SurveyCardComponent],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  encapsulation: ViewEncapsulation.None,
})
export class HomePage implements OnInit, OnDestroy {
  protected isCreatedOverlayVisible = false;
  protected isCreateSurveyDialogOpen = false;
  protected isPastView = false;
  protected isSortMenuOpen = false;
  protected selectedSortCategory = '';
  protected surveys: Survey[] = [];

  private createdOverlayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeSurveyChanges: (() => void) | null = null;
  private pendingPublishedSurveyId: number | null = null;

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly surveyStorage: SurveyStorageService,
  ) {}

  /**
   * Loads all surveys and subscribes to survey updates.
   */
  ngOnInit(): void {
    void this.loadSurveys();

    this.unsubscribeSurveyChanges =
      this.surveyStorage.subscribeToSurveyChanges((surveys) => {
        this.surveys = this.sortByDays(surveys);
        this.scheduleChangeDetection();
      });
  }

  /**
   * Clears timers and subscriptions when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.clearCreatedOverlayTimer();

    this.unsubscribeSurveyChanges?.();
    this.unsubscribeSurveyChanges = null;
  }

  /**
   * Closes the sort menu when the user clicks outside of it.
   *
   * @param event The document click event.
   */
  @HostListener('document:click', ['$event'])
  protected closeSortMenuOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.sort-menu')) {
      this.isSortMenuOpen = false;
    }
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
   * Handles a successfully published survey.
   *
   * Reloads the survey list and navigates to the newly created survey.
   *
   * @param survey The survey that was published.
   */
  protected async handleSurveyPublished(survey: Survey): Promise<void> {
    this.closeCreateSurveyDialog();
    await this.loadSurveys();
    await this.router.navigate(['/single-survey', survey.id]);
  }

  /**
   * Hides the created-survey overlay and navigates to the published survey.
   */
  protected hideCreatedOverlay(): void {
    this.isCreatedOverlayVisible = false;
    this.clearCreatedOverlayTimer();

    void this.navigateToPublishedSurvey();
  }

  /**
   * Selects a survey category for filtering.
   *
   * @param category The category selected by the user.
   */
  protected selectCategory(category: string): void {
    this.selectedSortCategory = category;
    this.isSortMenuOpen = false;
  }

  /**
   * Returns all available survey categories.
   */
  protected get sortCategories(): readonly string[] {
    return SURVEY_CATEGORIES;
  }

  /**
   * Returns active surveys filtered by the selected category.
   */
  protected get activeSurveys(): Survey[] {
    const activeSurveys = this.surveys.filter(
      (survey) => survey.daysLeft >= 0,
    );

    return this.filterByCategory(activeSurveys);
  }

  /**
   * Returns past surveys filtered by the selected category.
   */
  protected get pastSurveys(): Survey[] {
    const pastSurveys = this.surveys.filter(
      (survey) => survey.daysLeft < 0,
    );

    return this.filterByCategory(pastSurveys);
  }

  /**
   * Returns the first three active surveys that end soon.
   */
  protected get endingSoonSurveys(): Survey[] {
    return this.activeSurveys.slice(0, 3);
  }

  /**
   * Returns active surveys excluding the ending-soon section.
   */
  protected get regularActiveSurveys(): Survey[] {
    return this.activeSurveys.slice(3);
  }

  /**
   * Returns the surveys currently visible in the selected view.
   */
  protected get visibleSurveys(): Survey[] {
    return this.isPastView
      ? this.pastSurveys
      : this.regularActiveSurveys;
  }

  /**
   * Loads all surveys from storage and sorts them by remaining days.
   */
  private async loadSurveys(): Promise<void> {
    const surveys = await this.surveyStorage.getAllSurveys();

    this.surveys = this.sortByDays(surveys);
    this.scheduleChangeDetection();
  }

  /**
   * Sorts surveys by remaining days and then by survey ID.
   *
   * @param items The surveys to sort.
   * @returns A new sorted survey array.
   */
  private sortByDays(items: Survey[]): Survey[] {
    return [...items].sort(
      (a, b) => a.daysLeft - b.daysLeft || a.id - b.id,
    );
  }

  /**
   * Filters surveys by the currently selected category.
   *
   * @param items The surveys to filter.
   * @returns The filtered surveys or all surveys if no category is selected.
   */
  private filterByCategory(items: Survey[]): Survey[] {
    if (!this.selectedSortCategory) {
      return items;
    }

    return items.filter(
      (survey) => survey.category === this.selectedSortCategory,
    );
  }

  /**
   * Starts the timer for the created-survey confirmation overlay.
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
   * Navigates to the newly published survey if an ID is available.
   */
  private async navigateToPublishedSurvey(): Promise<void> {
    if (this.pendingPublishedSurveyId === null) {
      return;
    }

    const id = this.pendingPublishedSurveyId;

    this.pendingPublishedSurveyId = null;

    await this.router.navigate(['/single-survey', id]);
  }

  /**
   * Schedules Angular change detection after asynchronous updates.
   */
  private scheduleChangeDetection(): void {
    setTimeout(() => this.cdr.detectChanges());
  }
}