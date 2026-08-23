import { Injectable } from '@angular/core';
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import { type SurveyQuestion } from '../interfaces/survey.interface';

/**
 * Represents a survey row stored in Supabase.
 */
type SurveyRow = {
  id: number;
  category: string;
  title: string;
  description: string;
  days_left: number;
  questions: SurveyQuestion[];
  created_at: string;
};

/**
 * Represents a survey statistics row stored in Supabase.
 */
type SurveyStatsRow = {
  survey_id: number;
  total_responses: number;
  counts: Record<string, number[]>;
  updated_at: string;
};

/**
 * Defines the database structure used by the Supabase client.
 */
type Database = {
  public: {
    Tables: {
      surveys: {
        Row: SurveyRow;
        Insert: Omit<SurveyRow, 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<
          Omit<SurveyRow, 'id'>
        >;
        Relationships: [];
      };
      survey_stats: {
        Row: SurveyStatsRow;
        Insert: Omit<SurveyStatsRow, 'updated_at'> & {
          updated_at?: string;
        };
        Update: Partial<
          Omit<SurveyStatsRow, 'survey_id'>
        >;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/**
 * Provides the configured Supabase client for the application.
 *
 * The service validates the environment configuration before
 * creating a client connection.
 */
@Injectable({
  providedIn: 'root',
})
export class SupabaseClientService {
  readonly client: SupabaseClient<Database> | null =
    this.createConfiguredClient();

  /**
   * Returns whether a valid Supabase client is available.
   *
   * @returns Whether the Supabase configuration is valid.
   */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Creates a Supabase client when the environment is configured correctly.
   *
   * @returns The configured Supabase client or null.
   */
  private createConfiguredClient(): SupabaseClient<Database> | null {
    if (!this.hasConfig()) {
      return null;
    }

    return createClient<Database>(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
    );
  }

  /**
   * Checks whether the required Supabase configuration is valid.
   *
   * @returns Whether the URL and anonymous key are usable.
   */
  private hasConfig(): boolean {
    const hasUrl = this.hasValidUrl();
    const hasKey = this.hasValidKey();

    return hasUrl && hasKey;
  }

  /**
   * Checks whether the configured Supabase URL is valid.
   *
   * @returns Whether the URL is usable and not a placeholder.
   */
  private hasValidUrl(): boolean {
    return (
      environment.supabaseUrl.startsWith('https://') &&
      !environment.supabaseUrl.includes(
        'YOUR_PROJECT_REF',
      )
    );
  }

  /**
   * Checks whether the configured Supabase anonymous key is valid.
   *
   * @returns Whether the key is usable and not a placeholder.
   */
  private hasValidKey(): boolean {
    return (
      environment.supabaseAnonKey.length > 20 &&
      !environment.supabaseAnonKey.includes(
        'YOUR_SUPABASE_ANON_KEY',
      )
    );
  }
}