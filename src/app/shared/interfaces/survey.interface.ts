export type SurveyQuestion = {
  id: number;
  prompt: string;
  allowMultiple: boolean;
  answers: string[];
};

export type SurveyQuestionDraft = {
  id: number;
  allowMultipleAnswers: boolean;
  answerFieldIndexes: number[];
  prompt: string;
  answers: Record<number, string>;
};

export type Survey = {
  id: number;
  category: string;
  title: string;
  description: string;
  daysLeft: number;
  questions: SurveyQuestion[];
};

export type SurveyStats = {
  total: number;
  counts: Record<number, number[]>;
};
