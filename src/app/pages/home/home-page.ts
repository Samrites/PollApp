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
 * create-survey dialog state, and navigation to published surveys.
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

  /**
   * Creates the home page component.
   *
   * @param router Angular router used for navigation.
   * @param cdr Change detector used after asynchronous updates.
   * @param surveyStorage Service used to load and observe surveys.
   */
  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly surveyStorage: SurveyStorageService,
  ) {}

  /**
   * Loads surveys and subscribes to realtime survey changes.
   */
  ngOnInit(): void {
    void this.loadSurveys();

    this.subscribeToSurveyChanges();
  }

  /**
   * Clears active timers and subscriptions when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.clearCreatedOverlayTimer();
    this.unsubscribeFromSurveyChanges();
  }

  /**
   * Closes the sort menu when the user clicks outside of it.
   *
   * @param event The document click event.
   */
  @HostListener('document:click', ['$event'])
  protected closeSortMenuOnOutsideClick(
    event: MouseEvent,
  ): void {
    if (this.isOutsideSortMenu(event)) {
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
   * @param survey The newly published survey.
   */
  protected async handleSurveyPublished(
    survey: Survey,
  ): Promise<void> {
    this.closeCreateSurveyDialog();

    await this.loadSurveys();
    await this.navigateToSurvey(survey.id);
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
   * Selects a category for filtering surveys.
   *
   * @param category The selected category.
   */
  protected selectCategory(category: string): void {
    this.selectedSortCategory = category;
    this.isSortMenuOpen = false;
  }

  /**
   * Returns all available survey categories.
   *
   * @returns The configured survey categories.
   */
  protected get sortCategories(): readonly string[] {
    return SURVEY_CATEGORIES;
  }

  /**
   * Returns active surveys filtered by category.
   *
   * @returns The filtered active surveys.
   */
  protected get activeSurveys(): Survey[] {
    const activeSurveys = this.surveys.filter(
      (survey) => survey.daysLeft >= 0,
    );

    return this.filterByCategory(activeSurveys);
  }

  /**
   * Returns past surveys filtered by category.
   *
   * @returns The filtered past surveys.
   */
  protected get pastSurveys(): Survey[] {
    const pastSurveys = this.surveys.filter(
      (survey) => survey.daysLeft < 0,
    );

    return this.filterByCategory(pastSurveys);
  }

  /**
   * Returns the first three active surveys.
   *
   * @returns Surveys displayed in the ending-soon section.
   */
  protected get endingSoonSurveys(): Survey[] {
    return this.activeSurveys.slice(0, 3);
  }

  /**
   * Returns active surveys outside the ending-soon section.
   *
   * @returns The remaining active surveys.
   */
  protected get regularActiveSurveys(): Survey[] {
    return this.activeSurveys.slice(3);
  }

  /**
   * Returns surveys for the currently selected active or past view.
   *
   * @returns The currently visible surveys.
   */
  protected get visibleSurveys(): Survey[] {
    return this.isPastView
      ? this.pastSurveys
      : this.regularActiveSurveys;
  }

  /**
   * Loads all surveys and sorts them by remaining days.
   */
  private async loadSurveys(): Promise<void> {
    const surveys =
      await this.surveyStorage.getAllSurveys();

    this.updateSurveyList(surveys);
  }

  /**
   * Subscribes to realtime survey changes.
   */
  private subscribeToSurveyChanges(): void {
    this.unsubscribeSurveyChanges =
      this.surveyStorage.subscribeToSurveyChanges(
        (surveys) => {
          this.handleSurveyChanges(surveys);
        },
      );
  }

  /**
   * Handles an updated survey collection.
   *
   * @param surveys The updated surveys.
   */
  private handleSurveyChanges(
    surveys: Survey[],
  ): void {
    this.updateSurveyList(surveys);
  }

  /**
   * Updates and sorts the local survey collection.
   *
   * @param surveys The surveys to store.
   */
  private updateSurveyList(
    surveys: Survey[],
  ): void {
    this.surveys = this.sortByDays(surveys);

    this.scheduleChangeDetection();
  }

  /**
   * Removes the active survey-change subscription.
   */
  private unsubscribeFromSurveyChanges(): void {
    this.unsubscribeSurveyChanges?.();
    this.unsubscribeSurveyChanges = null;
  }

  /**
   * Sorts surveys by remaining days and then by ID.
   *
   * @param items The surveys to sort.
   * @returns A new sorted survey array.
   */
  private sortByDays(items: Survey[]): Survey[] {
    return [...items].sort(
      (a, b) =>
        a.daysLeft - b.daysLeft ||
        a.id - b.id,
    );
  }

  /**
   * Filters surveys by the selected category.
   *
   * @param items The surveys to filter.
   * @returns The filtered survey collection.
   */
  private filterByCategory(
    items: Survey[],
  ): Survey[] {
    if (!this.selectedSortCategory) {
      return items;
    }

    return items.filter(
      (survey) =>
        survey.category ===
        this.selectedSortCategory,
    );
  }

  /**
   * Starts the created-survey confirmation timer.
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

    const surveyId = this.pendingPublishedSurveyId;

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
   * Returns whether a click happened outside the sort menu.
   *
   * @param event The document click event.
   * @returns Whether the click was outside the sort menu.
   */
  private isOutsideSortMenu(
    event: MouseEvent,
  ): boolean {
    const target =
      event.target as HTMLElement | null;

    return !target?.closest('.sort-menu');
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