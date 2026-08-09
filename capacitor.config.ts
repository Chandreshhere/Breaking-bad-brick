import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration.
 *
 * `appId` is the bundle identifier. It is permanent once the app is published
 * — Apple and Google both key a listing to it forever — so change it now if
 * you want something else. Everything else here is safe to revise later.
 */
const config: CapacitorConfig = {
  appId: 'com.breakingbadbrick.game',
  appName: 'Breaking Bad Brick',
  webDir: 'dist',

  // The game draws its own background and handles its own safe areas via CSS
  // env() insets, so the shell should stay out of the way entirely.
  backgroundColor: '#04120a',

  android: {
    // The canvas is opaque and covers the screen; letting the webview be
    // transparent would composite an extra layer every frame for nothing.
    backgroundColor: '#04120a',
    // Mixed content stays off — everything the game loads is same-origin or
    // https, and allowing http would be a downgrade path on a hostile network.
    allowMixedContent: false,
  },

  ios: {
    backgroundColor: '#04120a',
    // The game already handles notch insets in CSS.
    contentInset: 'never',
  },

  plugins: {
    SplashScreen: {
      // WebGL plus a stadium rebuild takes a moment on a cold start; holding
      // the splash avoids a flash of empty canvas before the first frame.
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#04120a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
