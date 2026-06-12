export const mockPlaywright = {
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue({}),
        fill: vi.fn().mockResolvedValue({}),
        click: vi.fn().mockResolvedValue({}),
        waitForSelector: vi.fn().mockResolvedValue({}),
        $eval: vi.fn().mockResolvedValue({}),
        $$eval: vi.fn().mockResolvedValue([]),
        close: vi.fn().mockResolvedValue({})
      }),
      close: vi.fn().mockResolvedValue({})
    })
  }
};

vi.mock('playwright', () => mockPlaywright);
