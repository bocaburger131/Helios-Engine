export const mockRedisClient = {
  connect: vi.fn().mockResolvedValue({}),
  disconnect: vi.fn().mockResolvedValue({}),
  on: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  lpush: vi.fn().mockResolvedValue(1),
  llen: vi.fn().mockResolvedValue(0),
  lrange: vi.fn().mockResolvedValue([]),
  lrem: vi.fn().mockResolvedValue(0),
  ltrim: vi.fn().mockResolvedValue('OK'),
  isOpen: true
};

export const mockRedisQueue = {
  add: vi.fn().mockResolvedValue({ id: 'test-job-123' }),
  process: vi.fn(),
  clean: vi.fn().mockResolvedValue({ cleaned: 0 }),
  getJobCounts: vi.fn().mockResolvedValue({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0
  })
};

vi.mock('redis', () => ({
  createClient: () => mockRedisClient
}));
