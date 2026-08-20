import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { CreateSurveyPage } from '../create-survey/create-survey-page';
import { SurveyCardComponent } from '../../shared/components/survey-card/survey-card';
import { SURVEY_CATEGORIES } from '../../shared/constants/survey-categories';
import { type Survey } from '../../shared/interfaces/survey.interface';
import { SurveyStorageService } from '../../shared/services/survey-storage.service';

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

  ngOnInit(): void {
    void this.loadSurveys();
    this.unsubscribeSurveyChanges = this.surveyStorage.subscribeToSurveyChanges((surveys) => {
      this.surveys = this.sortByDays(surveys);
      this.scheduleChangeDetection();
    });
  }

  ngOnDestroy(): void {
    this.clearCreatedOverlayTimer();
    this.unsubscribeSurveyChanges?.();
    this.unsubscribeSurveyChanges = null;
  }

  @HostListener('document:click', ['$event'])
  protected closeSortMenuOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.sort-menu')) this.isSortMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  protected closeCreateSurveyDialogOnEscape(): void {
    if (this.isCreateSurveyDialogOpen) this.closeCreateSurveyDialog();
  }

  protected openCreateSurveyDialog(): void { this.isCreateSurveyDialogOpen = true; }
  protected closeCreateSurveyDialog(): void { this.isCreateSurveyDialogOpen = false; }

  protected async handleSurveyPublished(survey: Survey): Promise<void> {
    this.pendingPublishedSurveyId = survey.id;
    this.isCreatedOverlayVisible = true;
    this.closeCreateSurveyDialog();
    await this.loadSurveys();
    this.startCreatedOverlayTimer();
  }

  protected hideCreatedOverlay(): void {
    this.isCreatedOverlayVisible = false;
    this.clearCreatedOverlayTimer();
    void this.navigateToPublishedSurvey();
  }

  protected selectCategory(category: string): void {
    this.selectedSortCategory = category;
    this.isSortMenuOpen = false;
  }

  protected get sortCategories(): readonly string[] { return SURVEY_CATEGORIES; }
  protected get activeSurveys(): Survey[] {
    return this.filterByCategory(this.surveys.filter((survey) => survey.daysLeft >= 0));
  }
  protected get pastSurveys(): Survey[] {
    return this.filterByCategory(this.surveys.filter((survey) => survey.daysLeft < 0));
  }
  protected get endingSoonSurveys(): Survey[] { return this.activeSurveys.slice(0, 3); }
  protected get regularActiveSurveys(): Survey[] { return this.activeSurveys.slice(3); }
  protected get visibleSurveys(): Survey[] { return this.isPastView ? this.pastSurveys : this.regularActiveSurveys; }

  private async loadSurveys(): Promise<void> {
    this.surveys = this.sortByDays(await this.surveyStorage.getAllSurveys());
    this.scheduleChangeDetection();
  }
  private sortByDays(items: Survey[]): Survey[] {
    return [...items].sort((a, b) => a.daysLeft - b.daysLeft || a.id - b.id);
  }
  private filterByCategory(items: Survey[]): Survey[] {
    return this.selectedSortCategory ? items.filter((survey) => survey.category === this.selectedSortCategory) : items;
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
  private scheduleChangeDetection(): void { setTimeout(() => this.cdr.detectChanges()); }
}
