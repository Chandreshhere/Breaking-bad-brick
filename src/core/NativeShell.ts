/**
 * Native-shell behaviour that a browser gets for free but an app does not.
 *
 * Three things a store reviewer (and every player) expects:
 *
 *  1. **Backgrounding pauses the game.** A rally continuing while the app is
 *     off screen means coming back to a lost life you never saw. Audio must
 *     stop too — a game still playing music behind another app is the single
 *     most complained-about behaviour on mobile.
 *  2. **Back never exits mid-run.** On Android, back is expected to step back
 *     through the game's own screens; quitting the app straight out of a
 *     rally loses the run.
 *  3. **The splash hides once there is something to look at**, not before.
 *
 * All of it no-ops on the web build, so there is one code path, not two.
 */

export interface ShellHooks {
  /** True if the game handled the back press itself. */
  onBack: () => boolean;
  onPause: () => void;
  onResume: () => void;
}

type AppPlugin = {
  addListener(
    event: 'appStateChange',
    cb: (s: { isActive: boolean }) => void
  ): Promise<{ remove: () => void }>;
  addListener(event: 'backButton', cb: () => void): Promise<{ remove: () => void }>;
  exitApp(): Promise<void>;
};

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export class NativeShell {
  private listeners: Array<{ remove: () => void }> = [];

  async attach(hooks: ShellHooks): Promise<void> {
    // The browser still benefits from pausing on tab-hide, so this is wired
    // everywhere rather than only in the shell.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hooks.onPause();
      else hooks.onResume();
    });

    if (!isNative()) return;

    try {
      const spec = '@capacitor/app';
      const { App } = (await import(/* @vite-ignore */ spec)) as unknown as { App: AppPlugin };

      this.listeners.push(
        await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) hooks.onResume();
          else hooks.onPause();
        })
      );

      this.listeners.push(
        await App.addListener('backButton', () => {
          // Only leave the app when the game says there is nothing left to
          // back out of — i.e. we are already at the top menu.
          if (!hooks.onBack()) void App.exitApp();
        })
      );
    } catch {
      /* plugin missing — web build, nothing to attach */
    }

    try {
      const spec = '@capacitor/splash-screen';
      const { SplashScreen } = (await import(/* @vite-ignore */ spec)) as unknown as {
        SplashScreen: { hide(): Promise<void> };
      };
      await SplashScreen.hide();
    } catch {
      /* no splash plugin */
    }
  }

  dispose(): void {
    this.listeners.forEach((l) => l.remove());
    this.listeners = [];
  }
}
