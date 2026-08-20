import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home-page';
import { SingleSurveyPage } from './pages/single-survey/single-survey-page';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'create-survey', redirectTo: '', pathMatch: 'full' },
  { path: 'single-survey', redirectTo: 'single-survey/1', pathMatch: 'full' },
  { path: 'single-survey/:id', component: SingleSurveyPage },
  { path: '**', redirectTo: '' },
];
