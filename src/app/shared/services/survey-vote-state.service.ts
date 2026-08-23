import { Injectable } from '@angular/core';

const STORAGE_KEY = 'pollapp.completed-surveys';

/**
 * Stores and restores the completed-survey state for the current browser.
 *
 * Completed survey IDs are persisted in localStorage so the application
 * can prevent users from voting on the same survey more than once.
 */
@Injectable({
  providedIn: 'root',
})
export class SurveyVoteStateService {
  /**
   * Returns whether a survey has already been completed.
   *
   * @param surveyId The ID of the survey to check.
   * @returns Whether the survey is marked as completed.
   */
  hasCompleted(surveyId: number): boolean {
    return this.readIds().includes(surveyId);
  }

  /**
   * Marks a survey as completed and stores the updated state.
   *
   * @param surveyId The ID of the completed survey.
   */
  markCompleted(surveyId: number): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    const completedIds =
      this.createCompletedIdSet();

    completedIds.add(surveyId);

    this.writeIds(completedIds);
  }

  /**
   * Returns whether localStorage is available.
   *
   * @returns Whether browser storage can be used.
   */
  private isStorageAvailable(): boolean {
    return typeof localStorage !== 'undefined';
  }

  /**
   * Creates a mutable set from the currently stored survey IDs.
   *
   * @returns A set containing completed survey IDs.
   */
  private createCompletedIdSet(): Set<number> {
    return new Set(this.readIds());
  }

  /**
   * Reads all completed survey IDs from localStorage.
   *
   * Invalid or unavailable stored data results in an empty array.
   *
   * @returns The stored completed survey IDs.
   */
  private readIds(): number[] {
    if (!this.isStorageAvailable()) {
      return [];
    }

    try {
      return this.parseStoredIds(
        localStorage.getItem(STORAGE_KEY),
      );
    } catch {
      return [];
    }
  }

  /**
   * Parses stored survey IDs from a JSON value.
   *
   * @param storedValue The raw localStorage value.
   * @returns A validated array of numeric survey IDs.
   */
  private parseStoredIds(
    storedValue: string | null,
  ): number[] {
    const parsedValue = JSON.parse(
      storedValue ?? '[]',
    );

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (value): value is number =>
        typeof value === 'number' &&
        Number.isFinite(value),
    );
  }

  /**
   * Writes completed survey IDs to localStorage.
   *
   * @param completedIds The completed survey IDs to persist.
   */
  private writeIds(
    completedIds: Set<number>,
  ): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...completedIds]),
    );
  }
}