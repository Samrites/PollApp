import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { type SurveyQuestion } from '../interfaces/survey.interface';

type SurveyRow = {
  id: number;
  category: string;
  title: string;
  description: string;
  days_left: number;
  questions: SurveyQuestion[];
  created_at: string;
};

type SurveyStatsRow = {
  survey_id: number;
  total_responses: number;
  counts: Record<string, number[]>;
  updated_at: string;
};

type Database = {
  public: {
    Tables: {
      surveys: {
        Row: SurveyRow;
        Insert: Omit<SurveyRow, 'created_at'> & { created_at?: string };
        Update: Partial<Omit<SurveyRow, 'id'>>;
        Relationships: [];
      };
      survey_stats: {
        Row: SurveyStatsRow;
        Insert: Omit<SurveyStatsRow, 'updated_at'> & { updated_at?: string };
        Update: Partial<Omit<SurveyStatsRow, 'survey_id'>>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  readonly client: SupabaseClient<Database> | null = this.hasConfig()
    ? createClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey)
    : null;

  get isConfigured(): boolean {
    return this.client !== null;
  }

  private hasConfig(): boolean {
    const hasUrl = environment.supabaseUrl.startsWith('https://');
    const hasKey = environment.supabaseAnonKey.length > 20;
    const hasPlaceholderUrl = environment.supabaseUrl.includes('YOUR_PROJECT_REF');
    const hasPlaceholderKey = environment.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY');
    return hasUrl && hasKey && !hasPlaceholderUrl && !hasPlaceholderKey;
  }
}
