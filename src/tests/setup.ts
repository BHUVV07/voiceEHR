import '@testing-library/jest-dom';

// Chrome API polyfill for Vitest / JSDOM
(global as any).chrome = {
  storage: {
    local: {
      get: vi.fn().mockImplementation((keys) => {
        return Promise.resolve({});
      }),
      set: vi.fn().mockImplementation((items) => {
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    openOptionsPage: vi.fn(),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
};

// Clipboard API polyfill
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
});
