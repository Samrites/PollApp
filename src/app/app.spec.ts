import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

/**
 * Tests the root App component.
 */
describe('App', () => {
  /**
   * Configures the Angular testing module before each test.
   */
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  /**
   * Verifies that the root component can be created.
   */
  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  /**
   * Verifies that the router outlet is rendered.
   */
  it('should render router outlet', async () => {
    const fixture = TestBed.createComponent(App);

    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(
      compiled.querySelector('router-outlet'),
    ).toBeTruthy();
  });
});