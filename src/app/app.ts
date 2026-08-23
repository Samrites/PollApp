import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component of the PollApp application.
 *
 * Provides the router outlet used to display
 * the application's routed pages.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}