import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * Bootstraps the PollApp application.
 *
 * Starts the root App component with the
 * configured application providers.
 */
bootstrapApplication(
  App,
  appConfig,
).catch((error) => {
  console.error(
    'Could not bootstrap the application:',
    error,
  );
});