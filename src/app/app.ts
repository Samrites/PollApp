import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component of the PollApp application.
 *
 * Provides the main router outlet used to render
 * the application's routed pages.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}