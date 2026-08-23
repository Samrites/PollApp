/**
 * Represents a published survey question.
 *
 * Contains the question text, available answers,
 * and information about whether multiple answers are allowed.
 */
export type SurveyQuestion = {
  /** Unique identifier of the question. */
  id: number;

  /** Text displayed as the survey question. */
  prompt: string;

  /** Determines whether multiple answers can be selected. */
  allowMultiple: boolean;

  /** Available answer options for the question. */
  answers: string[];
};

/**
 * Represents a question while a survey is being created.
 *
 * Stores the editable state of a question before
 * it is converted into a published survey question.
 */
export type SurveyQuestionDraft = {
  /** Unique identifier of the question draft. */
  id: number;

  /** Determines whether multiple answers may be selected. */
  allowMultipleAnswers: boolean;

  /** Indexes of the currently visible answer fields. */
  answerFieldIndexes: number[];

  /** Editable question text. */
  prompt: string;

  /** Editable answer values indexed by their field number. */
  answers: Record<number, string>;
};

/**
 * Represents a complete published survey.
 *
 * Contains the survey metadata and all questions
 * belonging to the survey.
 */
export type Survey = {
  /** Unique identifier of the survey. */
  id: number;

  /** Category assigned to the survey. */
  category: string;

  /** Title displayed for the survey. */
  title: string;

  /** Detailed description of the survey. */
  description: string;

  /** Number of days remaining until the survey ends. */
  daysLeft: number;

  /** Questions belonging to the survey. */
  questions: SurveyQuestion[];
};

/**
 * Represents aggregated voting statistics for a survey.
 *
 * Stores the total number of submitted responses
 * and the vote counts for each answer of each question.
 */
export type SurveyStats = {
  /** Total number of submitted survey responses. */
  total: number;

  /**
   * Vote counts grouped by question ID.
   *
   * Each array position represents the number of votes
   * received by the corresponding answer option.
   */
  counts: Record<number, number[]>;
};