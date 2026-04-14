import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dailychaos.creator',
  appName: 'Daily Chaos Creator',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
