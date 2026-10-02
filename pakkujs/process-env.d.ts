declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAKKU_CHANNEL: 'chrome' | 'edg' | 'firefox' | 'safari';
    }
  }
}

export {}