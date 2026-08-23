import { Injectable } from '@angular/core';
import {
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { normalizeSurveyCategory } from '../constants/survey-categories';
import {
  type Survey,
  type SurveyQuestion,
  type SurveyStats,
} from '../interfaces/survey.interface';
import { SupabaseClientService } from './supabase-client.service';

/**
 * Represents a survey row as stored in the database.
 *
 * Uses the database naming convention for fields that differ
 * from the application survey model.
 */
type DbSurveyRow = {
  /** Unique identifier of the survey. */
  id: number;

  /** Category assigned to the survey. */
  category: string;

  /** Title of the survey. */
  title: string;

  /** Description of the survey. */
  description: string;

  /** Number of remaining days stored in the database. */
  days_left: number;

  /** Questions belonging to the survey. */
  questions: SurveyQuestion[];
};

/**
 * Represents a survey statistics row stored in the database.
 */
type DbStatsRow = {
  /** ID of the survey associated with the statistics. */
  survey_id: number;

  /** Total number of submitted survey responses. */
  total_responses: number;

  /** Vote counts grouped by question ID. */
  counts: Record<string, number[]>;
};

/**
 * Represents the database payload used to update survey statistics.
 */
type DbStatsUpdate = {
  /** Updated total number of survey responses. */
  total_responses: number;

  /** Updated vote counts grouped by question ID. */
  counts: Record<string, number[]>;
};

/**
 * Represents the database payload used to insert survey statistics.
 */
type DbStatsInsert = DbStatsUpdate & {
  /** Unique identifier of the statistics row. */
  id: number;

  /** ID of the related survey. */
  survey_id: number;
};

/**
 * Defines a listener that receives an updated survey collection.
 *
 * @param surveys The updated surveys.
 */
type SurveyChangeListener = (
  surveys: Survey[],
) => void;

/**
 * Defines a listener that receives updated survey statistics.
 *
 * @param stats The updated survey statistics.
 */
type SurveyStatsChangeListener = (
  stats: SurveyStats,
) => void;

/**
 * Handles survey persistence, result statistics, and realtime updates.
 *
 * Surveys and their statistics are stored in Supabase.
 * The service also manages realtime listeners for survey
 * and statistics changes.
 */
@Injectable({
  providedIn: 'root',
})
export class SurveyStorageService {
  private readonly surveyListeners =
    new Set<SurveyChangeListener>();

  private readonly surveyStatsListeners =
    new Map<
      number,
      Set<SurveyStatsChangeListener>
    >();

  private surveysChannel: RealtimeChannel | null = null;
  private surveyStatsChannel: RealtimeChannel | null = null;

  /**
   * Creates the survey storage service.
   *
   * @param supabaseService Service providing the configured Supabase client.
   */
  constructor(
    private readonly supabaseService: SupabaseClientService,
  ) {}

  /**
   * Loads all surveys from Supabase.
   *
   * @returns The stored surveys sorted by remaining days and ID.
   */
  async getAllSurveys(): Promise<Survey[]> {
    const supabase = this.supabaseService.client;

    if (!supabase) {
      return [];
    }

    const { data, error } =
      await this.loadSurveyRows(supabase);

    if (error || !data) {
      this.logSurveyLoadError(error);
      return [];
    }

    return data.map(
      (row) =>
        this.mapDbSurveyToSurvey(
          row as DbSurveyRow,
        ),
    );
  }

  /**
   * Stores a newly created survey.
   *
   * @param survey The survey to persist.
   */
  async addSurvey(survey: Survey): Promise<void> {
    const supabase =
      this.requireSupabaseClient();

    const payload =
      this.mapSurveyToDb(survey);

    const { error } = await supabase
      .from('surveys')
      .insert(payload);

    if (error) {
      console.error(
        'Could not save survey:',
        error,
      );

      throw error;
    }

    await this.notifySurveyListeners();
  }

  /**
   * Determines the next available numeric survey ID.
   *
   * @returns The next survey ID.
   */
  async nextSurveyId(): Promise<number> {
    const supabase =
      this.requireSupabaseClient();

    const { data, error } = await supabase
      .from('surveys')
      .select('id')
      .order('id', {
        ascending: false,
      })
      .limit(1);

    if (error) {
      console.error(
        'Could not determine next survey id:',
        error,
      );

      throw error;
    }

    return this.resolveNextSurveyId(data);
  }

  /**
   * Loads statistics for a survey.
   *
   * @param surveyId The survey ID.
   * @returns The stored statistics or an empty statistics object.
   */
  async getSurveyStats(
    surveyId: number,
  ): Promise<SurveyStats> {
    const supabase =
      this.supabaseService.client;

    if (!supabase) {
      return this.createEmptySurveyStats();
    }

    const { data, error } = await supabase
      .from('survey_stats')
      .select(
        'survey_id, total_responses, counts',
      )
      .eq('survey_id', surveyId)
      .limit(1);

    return this.resolveSurveyStatsResult(
      surveyId,
      data,
      error,
    );
  }

  /**
   * Saves a completed survey response.
   *
   * @param surveyId The survey ID.
   * @param questions The survey questions.
   * @param selectedAnswers The selected answer indexes.
   * @returns The updated survey statistics.
   */
  async saveSurveyResponse(
    surveyId: number,
    questions: SurveyQuestion[],
    selectedAnswers: Record<
      number,
      number[]
    >,
  ): Promise<SurveyStats> {
    const current =
      await this.getSurveyStats(surveyId);

    const next = this.applySurveyVote(
      current,
      questions,
      selectedAnswers,
    );

    await this.ensureSurveyStatsPersisted(
      surveyId,
      next,
    );

    this.notifySurveyStatsListenersWithValue(
      surveyId,
      next,
    );

    return next;
  }

  /**
   * Subscribes to changes of the survey collection.
   *
   * @param listener The callback to execute after survey changes.
   * @returns A function that removes the subscription.
   */
  subscribeToSurveyChanges(
    listener: SurveyChangeListener,
  ): () => void {
    this.surveyListeners.add(listener);
    this.ensureSurveyRealtimeChannel();

    return () => {
      this.surveyListeners.delete(listener);
      this.maybeRemoveSurveyRealtimeChannel();
    };
  }

  /**
   * Subscribes to realtime statistics changes for one survey.
   *
   * @param surveyId The survey ID.
   * @param listener The statistics change callback.
   * @returns A function that removes the subscription.
   */
  subscribeToSurveyStats(
    surveyId: number,
    listener: SurveyStatsChangeListener,
  ): () => void {
    const listeners =
      this.getOrCreateStatsListeners(
        surveyId,
      );

    listeners.add(listener);

    this.surveyStatsListeners.set(
      surveyId,
      listeners,
    );

    this.ensureSurveyStatsRealtimeChannel();

    return () => {
      this.unsubscribeSurveyStatsListener(
        surveyId,
        listener,
      );
    };
  }

  /**
   * Loads the survey rows used by the application.
   *
   * @param supabase The active Supabase client.
   * @returns The Supabase query result.
   */
  private loadSurveyRows(
    supabase: NonNullable<
      SupabaseClientService['client']
    >,
  ) {
    return supabase
      .from('surveys')
      .select(
        'id, category, title, description, days_left, questions',
      )
      .order('days_left', {
        ascending: true,
      })
      .order('id', {
        ascending: true,
      });
  }

  /**
   * Logs an error that occurred while loading surveys.
   *
   * @param error The returned database error.
   */
  private logSurveyLoadError(
    error: unknown,
  ): void {
    if (!error) {
      return;
    }

    console.error(
      'Could not load surveys:',
      error,
    );
  }

  /**
   * Returns an available Supabase client.
   *
   * @returns The initialized Supabase client.
   * @throws When Supabase is unavailable.
   */
  private requireSupabaseClient(): NonNullable<
    SupabaseClientService['client']
  > {
    const supabase =
      this.supabaseService.client;

    if (!supabase) {
      throw new Error(
        'Supabase client is not available.',
      );
    }

    return supabase;
  }

  /**
   * Resolves the next survey ID from a database result.
   *
   * @param data The returned ID rows.
   * @returns The next numeric survey ID.
   */
  private resolveNextSurveyId(
    data: Array<{ id: unknown }> | null,
  ): number {
    if (!data?.length) {
      return 1;
    }

    const currentId = Number(
      data[0].id,
    );

    return Number.isFinite(currentId)
      ? currentId + 1
      : 1;
  }

  /**
   * Converts a survey statistics query result to the application model.
   *
   * @param surveyId The requested survey ID.
   * @param data The returned database rows.
   * @param error The returned database error.
   * @returns The resolved survey statistics.
   */
  private resolveSurveyStatsResult(
    surveyId: number,
    data: unknown[] | null,
    error: unknown,
  ): SurveyStats {
    if (error) {
      console.error(
        `Could not load survey stats for survey ${surveyId}:`,
        error,
      );

      return this.createEmptySurveyStats();
    }

    if (!data?.length) {
      return this.createEmptySurveyStats();
    }

    return this.mapDbStatsToSurveyStats(
      data[0] as DbStatsRow,
    );
  }

  /**
   * Ensures that updated survey statistics are stored successfully.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics to persist.
   * @throws When the statistics could not be stored.
   */
  private async ensureSurveyStatsPersisted(
    surveyId: number,
    stats: SurveyStats,
  ): Promise<void> {
    const saved =
      await this.persistSurveyStats(
        surveyId,
        stats,
      );

    if (!saved) {
      throw new Error(
        `Could not save response for survey ${surveyId}.`,
      );
    }
  }

  /**
   * Persists survey statistics using update or insert.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics to persist.
   * @returns Whether persistence succeeded.
   */
  private async persistSurveyStats(
    surveyId: number,
    stats: SurveyStats,
  ): Promise<boolean> {
    const supabase =
      this.supabaseService.client;

    if (!supabase) {
      return false;
    }

    const updated =
      await this.updateSurveyStats(
        surveyId,
        stats,
      );

    if (updated !== null) {
      return updated;
    }

    return this.insertSurveyStats(
      surveyId,
      stats,
    );
  }

  /**
   * Updates an existing statistics database row.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics to update.
   * @returns True if updated, false on error, or null when no row exists.
   */
  private async updateSurveyStats(
    surveyId: number,
    stats: SurveyStats,
  ): Promise<boolean | null> {
    const supabase =
      this.supabaseService.client;

    if (!supabase) {
      return false;
    }

    const payload =
      this.mapSurveyStatsToDbUpdate(
        stats,
      );

    const { data, error } = await supabase
      .from('survey_stats')
      .update(payload)
      .eq('survey_id', surveyId)
      .select('survey_id');

    if (error) {
      this.logStatsUpdateError(
        surveyId,
        error,
      );

      return false;
    }

    return data?.length
      ? true
      : null;
  }

  /**
   * Inserts a statistics row when none exists yet.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics to insert.
   * @returns Whether insertion succeeded.
   */
  private async insertSurveyStats(
    surveyId: number,
    stats: SurveyStats,
  ): Promise<boolean> {
    const supabase =
      this.supabaseService.client;

    if (!supabase) {
      return false;
    }

    const payload =
      this.createStatsInsertPayload(
        surveyId,
        stats,
      );

    const { error } = await supabase
      .from('survey_stats')
      .insert(payload);

    return this.handleStatsInsertResult(
      surveyId,
      stats,
      error,
    );
  }

  /**
   * Handles an insert result and retries duplicate rows as updates.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics being persisted.
   * @param error The insert error.
   * @returns Whether the operation succeeded.
   */
  private async handleStatsInsertResult(
    surveyId: number,
    stats: SurveyStats,
    error: { code?: string } | null,
  ): Promise<boolean> {
    if (!error) {
      return true;
    }

    if (error.code === '23505') {
      return this.retrySurveyStatsUpdate(
        surveyId,
        stats,
      );
    }

    console.error(
      `Could not insert survey stats for survey ${surveyId}:`,
      error,
    );

    return false;
  }

  /**
   * Retries an update after a duplicate insert conflict.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics to update.
   * @returns Whether the retry succeeded.
   */
  private async retrySurveyStatsUpdate(
    surveyId: number,
    stats: SurveyStats,
  ): Promise<boolean> {
    const supabase =
      this.supabaseService.client;

    if (!supabase) {
      return false;
    }

    const payload =
      this.mapSurveyStatsToDbUpdate(
        stats,
      );

    const { error } = await supabase
      .from('survey_stats')
      .update(payload)
      .eq('survey_id', surveyId);

    if (!error) {
      return true;
    }

    console.error(
      `Could not retry survey stats update for survey ${surveyId}:`,
      error,
    );

    return false;
  }

  /**
   * Logs a survey statistics update error.
   *
   * @param surveyId The survey ID.
   * @param error The database error.
   */
  private logStatsUpdateError(
    surveyId: number,
    error: unknown,
  ): void {
    console.error(
      `Could not update survey stats for survey ${surveyId}:`,
      error,
    );
  }

  /**
   * Creates a database insert payload for survey statistics.
   *
   * @param surveyId The survey ID.
   * @param stats The survey statistics.
   * @returns The database insert payload.
   */
  private createStatsInsertPayload(
    surveyId: number,
    stats: SurveyStats,
  ): DbStatsInsert {
    return {
      id: Date.now(),
      survey_id: surveyId,
      total_responses: stats.total,
      counts:
        this.convertStatsCountsToDb(
          stats.counts,
        ),
    };
  }

  /**
   * Notifies all listeners interested in survey changes.
   */
  private async notifySurveyListeners(): Promise<void> {
    if (!this.surveyListeners.size) {
      return;
    }

    const surveys =
      await this.getAllSurveys();

    this.surveyListeners.forEach(
      (listener) => {
        listener(surveys);
      },
    );
  }

  /**
   * Loads and sends current statistics to one survey's listeners.
   *
   * @param surveyId The survey ID.
   */
  private async notifySurveyStatsListeners(
    surveyId: number,
  ): Promise<void> {
    const listeners =
      this.surveyStatsListeners.get(
        surveyId,
      );

    if (!listeners?.size) {
      return;
    }

    const stats =
      await this.getSurveyStats(
        surveyId,
      );

    listeners.forEach((listener) => {
      listener(stats);
    });
  }

  /**
   * Sends already available statistics to registered listeners.
   *
   * @param surveyId The survey ID.
   * @param stats The statistics to send.
   */
  private notifySurveyStatsListenersWithValue(
    surveyId: number,
    stats: SurveyStats,
  ): void {
    const listeners =
      this.surveyStatsListeners.get(
        surveyId,
      );

    listeners?.forEach((listener) => {
      listener(stats);
    });
  }

  /**
   * Refreshes statistics for every survey that has active listeners.
   */
  private async notifyAllSurveyStatsListeners(): Promise<void> {
    const ids = [
      ...this.surveyStatsListeners.keys(),
    ];

    await Promise.all(
      ids.map((surveyId) =>
        this.notifySurveyStatsListeners(
          surveyId,
        ),
      ),
    );
  }

  /**
   * Creates the realtime channel for survey changes when needed.
   */
  private ensureSurveyRealtimeChannel(): void {
    const supabase =
      this.supabaseService.client;

    if (
      !supabase ||
      this.surveysChannel ||
      !this.surveyListeners.size
    ) {
      return;
    }

    this.surveysChannel = supabase
      .channel(
        'surveys-changes-channel',
      )
      .on(
        'postgres_changes',
        this.createSurveyChangesConfig(),
        () => {
          void this.notifySurveyListeners();
        },
      )
      .subscribe();
  }

  /**
   * Creates the realtime configuration used for survey changes.
   *
   * @returns The Supabase realtime configuration.
   */
  private createSurveyChangesConfig() {
    return {
      event: '*' as const,
      schema: 'public',
      table: 'surveys',
    };
  }

  /**
   * Removes the survey realtime channel when no listener remains.
   */
  private maybeRemoveSurveyRealtimeChannel(): void {
    const supabase =
      this.supabaseService.client;

    if (
      !supabase ||
      this.surveyListeners.size ||
      !this.surveysChannel
    ) {
      return;
    }

    void supabase.removeChannel(
      this.surveysChannel,
    );

    this.surveysChannel = null;
  }

  /**
   * Creates the realtime channel for survey statistics when required.
   */
  private ensureSurveyStatsRealtimeChannel(): void {
    const supabase =
      this.supabaseService.client;

    if (
      !supabase ||
      this.surveyStatsChannel ||
      !this.surveyStatsListeners.size
    ) {
      return;
    }

    this.surveyStatsChannel = supabase
      .channel(
        'survey-stats-changes-channel',
      )
      .on(
        'postgres_changes',
        this.createStatsChangesConfig(),
        (payload) => {
          this.handleSurveyStatsRealtimePayload(
            payload,
          );
        },
      )
      .subscribe();
  }

  /**
   * Creates the realtime configuration used for statistics changes.
   *
   * @returns The Supabase realtime configuration.
   */
  private createStatsChangesConfig() {
    return {
      event: '*' as const,
      schema: 'public',
      table: 'survey_stats',
    };
  }

  /**
   * Handles a realtime statistics payload.
   *
   * @param payload The Supabase realtime payload.
   */
  private handleSurveyStatsRealtimePayload(
    payload: RealtimePostgresChangesPayload<
      Record<string, unknown>
    >,
  ): void {
    const surveyId =
      this.getChangedSurveyId(payload);

    if (surveyId === null) {
      void this.notifyAllSurveyStatsListeners();
      return;
    }

    void this.notifySurveyStatsListeners(
      surveyId,
    );
  }

  /**
   * Removes one statistics listener.
   *
   * @param surveyId The survey ID.
   * @param listener The listener to remove.
   */
  private unsubscribeSurveyStatsListener(
    surveyId: number,
    listener: SurveyStatsChangeListener,
  ): void {
    const listeners =
      this.surveyStatsListeners.get(
        surveyId,
      );

    if (!listeners) {
      return;
    }

    listeners.delete(listener);

    this.removeEmptyStatsListenerSet(
      surveyId,
      listeners,
    );

    this.maybeRemoveStatsRealtimeChannel();
  }

  /**
   * Deletes an empty statistics listener collection.
   *
   * @param surveyId The survey ID.
   * @param listeners The listener collection.
   */
  private removeEmptyStatsListenerSet(
    surveyId: number,
    listeners: Set<
      SurveyStatsChangeListener
    >,
  ): void {
    if (listeners.size) {
      return;
    }

    this.surveyStatsListeners.delete(
      surveyId,
    );
  }

  /**
   * Removes the statistics realtime channel when it is no longer needed.
   */
  private maybeRemoveStatsRealtimeChannel(): void {
    const supabase =
      this.supabaseService.client;

    if (
      !supabase ||
      this.surveyStatsListeners.size ||
      !this.surveyStatsChannel
    ) {
      return;
    }

    void supabase.removeChannel(
      this.surveyStatsChannel,
    );

    this.surveyStatsChannel = null;
  }

  /**
   * Returns an existing statistics listener set or creates a new one.
   *
   * @param surveyId The survey ID.
   * @returns The listener collection.
   */
  private getOrCreateStatsListeners(
    surveyId: number,
  ): Set<SurveyStatsChangeListener> {
    return (
      this.surveyStatsListeners.get(
        surveyId,
      ) ??
      new Set<SurveyStatsChangeListener>()
    );
  }

  /**
   * Reads the changed survey ID from a realtime payload.
   *
   * @param payload The realtime payload.
   * @returns The survey ID or null.
   */
  private getChangedSurveyId(
    payload: RealtimePostgresChangesPayload<
      Record<string, unknown>
    >,
  ): number | null {
    const newValue =
      this.readPayloadValue(
        payload.new,
        'survey_id',
      );

    const oldValue =
      this.readPayloadValue(
        payload.old,
        'survey_id',
      );

    return this.parseNumericId(
      newValue ?? oldValue,
    );
  }

  /**
   * Safely reads a value from an unknown realtime payload.
   *
   * @param payload The payload object.
   * @param key The property name.
   * @returns The stored value or null.
   */
  private readPayloadValue(
    payload: unknown,
    key: string,
  ): unknown {
    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      return null;
    }

    return (
      payload as Record<
        string,
        unknown
      >
    )[key];
  }

  /**
   * Converts an unknown ID value into a number.
   *
   * @param value The value to parse.
   * @returns A numeric ID or null.
   */
  private parseNumericId(
    value: unknown,
  ): number | null {
    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  /**
   * Maps a database survey row to the application survey model.
   *
   * @param row The database row.
   * @returns The mapped survey.
   */
  private mapDbSurveyToSurvey(
    row: DbSurveyRow,
  ): Survey {
    return {
      id: row.id,
      category:
        normalizeSurveyCategory(
          row.category,
        ),
      title: row.title,
      description: row.description,
      daysLeft: row.days_left,
      questions: row.questions,
    };
  }

  /**
   * Maps an application survey to the database representation.
   *
   * @param survey The survey to map.
   * @returns The database survey row.
   */
  private mapSurveyToDb(
    survey: Survey,
  ): DbSurveyRow {
    return {
      id: survey.id,
      category:
        normalizeSurveyCategory(
          survey.category,
        ),
      title: survey.title,
      description: survey.description,
      days_left: survey.daysLeft,
      questions: survey.questions,
    };
  }

  /**
   * Maps stored database statistics to the application model.
   *
   * @param row The database statistics row.
   * @returns The application statistics.
   */
  private mapDbStatsToSurveyStats(
    row: DbStatsRow,
  ): SurveyStats {
    return {
      total:
        row.total_responses ?? 0,
      counts:
        this.normalizeStatsCounts(
          row.counts ?? {},
        ),
    };
  }

  /**
   * Maps application statistics to an update payload.
   *
   * @param stats The statistics to map.
   * @returns The database update payload.
   */
  private mapSurveyStatsToDbUpdate(
    stats: SurveyStats,
  ): DbStatsUpdate {
    return {
      total_responses: stats.total,
      counts:
        this.convertStatsCountsToDb(
          stats.counts,
        ),
    };
  }

  /**
   * Converts numeric statistics keys to database string keys.
   *
   * @param counts The application statistics counts.
   * @returns Counts formatted for the database.
   */
  private convertStatsCountsToDb(
    counts: Record<
      number,
      number[]
    >,
  ): Record<string, number[]> {
    return Object.fromEntries(
      Object.entries(counts).map(
        ([key, values]) => [
          String(key),
          [...values],
        ],
      ),
    );
  }

  /**
   * Applies one completed response to existing survey statistics.
   *
   * @param current The current statistics.
   * @param questions The survey questions.
   * @param selectedAnswers The selected answers.
   * @returns The updated statistics.
   */
  private applySurveyVote(
    current: SurveyStats,
    questions: SurveyQuestion[],
    selectedAnswers: Record<
      number,
      number[]
    >,
  ): SurveyStats {
    const counts =
      this.cloneStatsCounts(
        current.counts,
      );

    questions.forEach((question) => {
      this.applyQuestionVote(
        counts,
        question,
        selectedAnswers[
          question.id
        ] ?? [],
      );
    });

    return {
      total: current.total + 1,
      counts,
    };
  }

  /**
   * Clones survey result counts.
   *
   * @param counts The counts to clone.
   * @returns A mutable cloned count object.
   */
  private cloneStatsCounts(
    counts: Record<
      number,
      number[]
    >,
  ): Record<number, number[]> {
    return Object.fromEntries(
      Object.entries(counts).map(
        ([key, values]) => [
          Number(key),
          [...values],
        ],
      ),
    ) as Record<number, number[]>;
  }

  /**
   * Applies selected answers for one question.
   *
   * @param counts The result counts.
   * @param question The survey question.
   * @param selected The selected answer indexes.
   */
  private applyQuestionVote(
    counts: Record<
      number,
      number[]
    >,
    question: SurveyQuestion,
    selected: number[],
  ): void {
    const values =
      this.createQuestionCounts(
        counts[question.id],
        question.answers.length,
      );

    selected.forEach(
      (answerIndex) => {
        this.incrementAnswerCount(
          values,
          answerIndex,
        );
      },
    );

    counts[question.id] = values;
  }

  /**
   * Creates the mutable answer counts for one question.
   *
   * @param existing The existing counts.
   * @param answerCount The number of answers.
   * @returns The answer count array.
   */
  private createQuestionCounts(
    existing: number[] | undefined,
    answerCount: number,
  ): number[] {
    return existing
      ? [...existing]
      : Array(answerCount).fill(0);
  }

  /**
   * Increments a valid answer count.
   *
   * @param values The answer count array.
   * @param answerIndex The answer index.
   */
  private incrementAnswerCount(
    values: number[],
    answerIndex: number,
  ): void {
    if (
      answerIndex < 0 ||
      answerIndex >= values.length
    ) {
      return;
    }

    values[answerIndex] += 1;
  }

  /**
   * Converts database statistics keys to numeric keys.
   *
   * @param counts The database statistics counts.
   * @returns Normalized application counts.
   */
  private normalizeStatsCounts(
    counts: Record<
      string,
      number[]
    >,
  ): Record<number, number[]> {
    return Object.fromEntries(
      Object.entries(counts).map(
        ([key, values]) => [
          Number(key),
          Array.isArray(values)
            ? [...values]
            : [],
        ],
      ),
    ) as Record<number, number[]>;
  }

  /**
   * Creates an empty survey statistics value.
   *
   * @returns Empty statistics.
   */
  private createEmptySurveyStats(): SurveyStats {
    return {
      total: 0,
      counts: {},
    };
  }
}