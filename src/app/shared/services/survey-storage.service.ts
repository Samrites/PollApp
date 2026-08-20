import { Injectable } from '@angular/core';
import {
  type RealtimeChannel,
  type RealtimePostgresChangesPayload, } from '@supabase/supabase-js';
import { normalizeSurveyCategory } from '../constants/survey-categories';
import {
  type Survey,
  type SurveyQuestion,
  type SurveyStats, } from '../interfaces/survey.interface';
import { SupabaseClientService } from './supabase-client.service';
type DbSurveyRow = {
  id: number;
  category: string;
  title: string;
  description: string;
  days_left: number;
  questions: SurveyQuestion[];
};
type DbStatsRow = {
  survey_id: number;
  total_responses: number;
  counts: Record<string, number[]>;
};
type DbStatsUpdate = {
  total_responses: number;
  counts: Record<string, number[]>;
};
type SurveyChangeListener = (surveys: Survey[]) => void;
type SurveyStatsChangeListener = (stats: SurveyStats) => void;
@Injectable({
  providedIn: 'root', })
export class SurveyStorageService {
  private readonly surveyListeners = new Set<SurveyChangeListener>();
  private readonly surveyStatsListeners = new Map<number, Set<SurveyStatsChangeListener>>();
  private surveysChannel: RealtimeChannel | null = null;
  private surveyStatsChannel: RealtimeChannel | null = null;
  constructor(
    private readonly supabaseService: SupabaseClientService, ) {}
  async getAllSurveys(): Promise<Survey[]> {
    const supabase = this.supabaseService.client;
    if (!supabase) {
      return [];
    }
    const { data, error } = await supabase .from('surveys') .select( 'id, category, title, description, days_left, questions', )
      .order('days_left', { ascending: true }) .order('id', { ascending: true });
    if (error || !data) {
      if (error) {
        console.error( 'Could not load surveys:', error, );
      }
      return [];
    }
    return data.map((row) => this.mapDbSurveyToSurvey( row as DbSurveyRow, ), );
  }
  async addSurvey( survey: Survey, ): Promise<void> {
    const supabase = this.supabaseService.client;
    if (!supabase) {
      throw new Error( 'Supabase client is not available.', );
    }
    const payload = this.mapSurveyToDb(survey);
    const { error } = await supabase .from('surveys') .insert(payload);
    if (error) {
      console.error( 'Could not save survey:', error, );
      throw error;
    }
    await this.notifySurveyListeners();
  }
  async nextSurveyId(): Promise<number> {
    const supabase = this.supabaseService.client;
    if (!supabase) {
      throw new Error( 'Supabase client is not available.', );
    }
    const { data, error } = await supabase .from('surveys') .select('id') .order('id', {
        ascending: false, }) .limit(1);
    if (error) {
      console.error( 'Could not determine next survey id:', error, );
      throw error;
    }
    if (!data?.length) {
      return 1;
    }
    const currentId = Number( data[0].id, );
    if (!Number.isFinite(currentId)) {
      return 1;
    }
    return currentId + 1;
  }
  async getSurveyStats( surveyId: number, ): Promise<SurveyStats> {
    const supabase = this.supabaseService.client;
    if (!supabase) {
      return this.createEmptySurveyStats();
    }
    const { data, error } = await supabase .from('survey_stats') .select( 'survey_id, total_responses, counts', )
      .eq('survey_id', surveyId) .limit(1);
    if (error) {
      console.error( `Could not load survey stats for survey ${surveyId}:`, error, );
      return this.createEmptySurveyStats();
    }
    if (!data?.length) {
      return this.createEmptySurveyStats();
    }
    return this.mapDbStatsToSurveyStats( data[0] as DbStatsRow, );
  }
  async saveSurveyResponse( surveyId: number, questions: SurveyQuestion[], selectedAnswers: Record<number, number[]>,
  ): Promise<SurveyStats> {
    const current = await this.getSurveyStats( surveyId, );
    const next = this.applySurveyVote( current, questions, selectedAnswers, );
    const saved = await this.persistSurveyStats( surveyId, next, );
    if (!saved) {
      throw new Error( `Could not save response for survey ${surveyId}.`, );
    }
    this.notifySurveyStatsListenersWithValue( surveyId, next, );
    return next;
  }
  subscribeToSurveyChanges( listener: SurveyChangeListener, ): () => void {
    this.surveyListeners.add(listener);
    this.ensureSurveyRealtimeChannel();
    return () => {
      this.surveyListeners.delete( listener, );
      this.maybeRemoveSurveyRealtimeChannel();
    };
  }
  subscribeToSurveyStats( surveyId: number, listener: SurveyStatsChangeListener, ): () => void {
    const listeners = this.surveyStatsListeners.get( surveyId, ) ?? new Set<SurveyStatsChangeListener>();
    listeners.add(listener);
    this.surveyStatsListeners.set( surveyId, listeners, );
    this.ensureSurveyStatsRealtimeChannel();
    return () => {
      this.unsubscribeSurveyStatsListener( surveyId, listener, );
    };
  }
  private async persistSurveyStats( surveyId: number, stats: SurveyStats, ): Promise<boolean> {
    const supabase = this.supabaseService.client;
    if (!supabase) {
      return false;
    }
    const updatePayload = this.mapSurveyStatsToDbUpdate( stats, );
    const {
      data: updatedRows, error: updateError, } = await supabase .from('survey_stats') .update(updatePayload)
      .eq('survey_id', surveyId) .select('survey_id');
    if (updateError) {
      console.error( `Could not update survey stats for survey ${surveyId}:`, updateError, );
      return false;
    }
    if (updatedRows?.length) {
      return true;
    }
    const insertPayload = {
      id: Date.now(), survey_id: surveyId, total_responses: stats.total, counts: this.convertStatsCountsToDb( stats.counts, ), };
    const typedInsertPayload = insertPayload as unknown as {
        survey_id: number;
        total_responses: number;
        counts: Record<string, number[]>;
      };
    const { error: insertError } = await supabase .from('survey_stats') .insert(typedInsertPayload);
    if (!insertError) {
      return true;
    }
    if (insertError.code === '23505') {
      const { error: retryError } = await supabase .from('survey_stats') .update(updatePayload) .eq('survey_id', surveyId);
      if (!retryError) {
        return true;
      }
      console.error( `Could not retry survey stats update for survey ${surveyId}:`, retryError, );
      return false;
    }
    console.error( `Could not insert survey stats for survey ${surveyId}:`, insertError, );
    return false;
  }
  private async notifySurveyListeners(): Promise<void> {
    if (!this.surveyListeners.size) {
      return;
    }
    const surveys = await this.getAllSurveys();
    this.surveyListeners.forEach( (listener) => listener(surveys), );
  }
  private async notifySurveyStatsListeners( surveyId: number, ): Promise<void> {
    const listeners = this.surveyStatsListeners.get( surveyId, );
    if (!listeners?.size) {
      return;
    }
    const stats = await this.getSurveyStats( surveyId, );
    listeners.forEach( (listener) => listener(stats), );
  }
  private notifySurveyStatsListenersWithValue( surveyId: number, stats: SurveyStats, ): void {
    const listeners = this.surveyStatsListeners.get( surveyId, );
    if (!listeners?.size) {
      return;
    }
    listeners.forEach( (listener) => listener(stats), );
  }
  private async notifyAllSurveyStatsListeners(): Promise<void> {
    const ids = [ ...this.surveyStatsListeners.keys(), ];
    await Promise.all( ids.map((surveyId) => this.notifySurveyStatsListeners( surveyId, ), ), );
  }
  private ensureSurveyRealtimeChannel(): void {
    const supabase = this.supabaseService.client;
    if ( !supabase || this.surveysChannel || !this.surveyListeners.size ) {
      return;
    }
    this.surveysChannel = supabase .channel( 'surveys-changes-channel', ) .on( 'postgres_changes', {
            event: '*', schema: 'public', table: 'surveys', }, () => {
            void this.notifySurveyListeners();
          }, ) .subscribe();
  }
  private maybeRemoveSurveyRealtimeChannel(): void {
    const supabase = this.supabaseService.client;
    if ( !supabase || this.surveyListeners.size || !this.surveysChannel ) {
      return;
    }
    void supabase.removeChannel( this.surveysChannel, );
    this.surveysChannel = null;
  }
  private ensureSurveyStatsRealtimeChannel(): void {
    const supabase = this.supabaseService.client;
    if ( !supabase || this.surveyStatsChannel || !this.surveyStatsListeners.size ) {
      return;
    }
    this.surveyStatsChannel = supabase .channel( 'survey-stats-changes-channel', ) .on( 'postgres_changes', {
            event: '*', schema: 'public', table: 'survey_stats', }, (payload) => {
            this.handleSurveyStatsRealtimePayload( payload, );
          }, ) .subscribe();
  }
  private handleSurveyStatsRealtimePayload( payload: RealtimePostgresChangesPayload< Record<string, unknown> >, ): void {
    const surveyId = this.getChangedSurveyId( payload, );
    if (surveyId === null) {
      void this.notifyAllSurveyStatsListeners();
      return;
    }
    void this.notifySurveyStatsListeners( surveyId, );
  }
  private unsubscribeSurveyStatsListener( surveyId: number, listener: SurveyStatsChangeListener, ): void {
    const listeners = this.surveyStatsListeners.get( surveyId, );
    if (!listeners) {
      return;
    }
    listeners.delete(listener);
    if (!listeners.size) {
      this.surveyStatsListeners.delete( surveyId, );
    }
    const supabase = this.supabaseService.client;
    if ( !supabase || this.surveyStatsListeners.size || !this.surveyStatsChannel ) {
      return;
    }
    void supabase.removeChannel( this.surveyStatsChannel, );
    this.surveyStatsChannel = null;
  }
  private getChangedSurveyId( payload: RealtimePostgresChangesPayload< Record<string, unknown> >, ): number | null {
    const newValue = this.readPayloadValue( payload.new, 'survey_id', );
    const oldValue = this.readPayloadValue( payload.old, 'survey_id', );
    return this.parseNumericId( newValue ?? oldValue, );
  }
  private readPayloadValue( payload: unknown, key: string, ): unknown {
    if ( !payload || typeof payload !== 'object' ) {
      return null;
    }
    return ( payload as Record<string, unknown> )[key];
  }
  private parseNumericId( value: unknown, ): number | null {
    if ( typeof value === 'number' && Number.isFinite(value) ) {
      return value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  private mapDbSurveyToSurvey( row: DbSurveyRow, ): Survey {
    return {
      id: row.id, category: normalizeSurveyCategory( row.category, ), title: row.title, description: row.description, daysLeft:
        row.days_left, questions: row.questions, };
  }
  private mapSurveyToDb( survey: Survey, ): DbSurveyRow {
    return {
      id: survey.id, category: normalizeSurveyCategory( survey.category, ), title: survey.title, description: survey.description,
      days_left: survey.daysLeft, questions: survey.questions, };
  }
  private mapDbStatsToSurveyStats( row: DbStatsRow, ): SurveyStats {
    return {
      total: row.total_responses ?? 0, counts: this.normalizeStatsCounts( row.counts ?? {}, ), };
  }
  private mapSurveyStatsToDbUpdate( stats: SurveyStats, ): DbStatsUpdate {
    return {
      total_responses: stats.total, counts: this.convertStatsCountsToDb( stats.counts, ), };
  }
  private convertStatsCountsToDb( counts: Record<number, number[]>, ): Record<string, number[]> {
    return Object.fromEntries( Object.entries(counts).map( ([key, values]) => [ String(key), [...values], ], ), );
  }
  private applySurveyVote( current: SurveyStats, questions: SurveyQuestion[], selectedAnswers: Record<number, number[]>,
  ): SurveyStats {
    const counts = Object.fromEntries( Object.entries( current.counts, ).map( ([key, values]) => [ Number(key), [...values], ], ),
      ) as Record<number, number[]>;
    questions.forEach( (question) => {
        const selected = selectedAnswers[ question.id ] ?? [];
        const existingValues = counts[question.id];
        const values = existingValues ? [...existingValues] : Array( question.answers.length, ).fill(0);
        selected.forEach( (answerIndex) => {
            if ( answerIndex >= 0 && answerIndex < values.length ) {
              values[ answerIndex ] += 1;
            }
          }, );
        counts[ question.id ] = values;
      }, );
    return {
      total: current.total + 1, counts, };
  }
  private normalizeStatsCounts( counts: Record<string, number[]>, ): Record<number, number[]> {
    return Object.fromEntries( Object.entries( counts, ).map( ([key, values]) => [ Number(key), Array.isArray(values)
            ? [...values] : [], ], ), ) as Record<number, number[]>;
  }
  private createEmptySurveyStats(): SurveyStats {
    return {
      total: 0, counts: {}, };
  }
}
