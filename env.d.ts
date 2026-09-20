// Declare process.env for Expo public env vars (Babel replaces these at build time)
declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    [key: string]: string | undefined;
  };
};
