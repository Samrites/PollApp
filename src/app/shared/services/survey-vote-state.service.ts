import { Injectable } from '@angular/core';

const STORAGE_KEY = 'pollapp.completed-surveys';

@Injectable({ providedIn: 'root' })
export class SurveyVoteStateService {
  hasCompleted(surveyId: number): boolean {
    return this.readIds().includes(surveyId);
  }

  markCompleted(surveyId: number): void {
    if (typeof localStorage === 'undefined') return;
    const ids = new Set(this.readIds());
    ids.add(surveyId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  }

  private readIds(): number[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(value) ? value.filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }
}
