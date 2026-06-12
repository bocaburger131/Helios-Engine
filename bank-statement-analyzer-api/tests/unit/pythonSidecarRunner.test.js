import { describe, it, expect } from 'vitest';
import { parseStdoutJson } from '../../src/services/extraction/pythonSidecarRunner.js';

describe('pythonSidecarRunner.parseStdoutJson', () => {
  it('parses valid JSON stdout', () => {
    const { json, parseError } = parseStdoutJson('{"transactions":[],"openingBalance":1}');
    expect(parseError).toBeNull();
    expect(json?.openingBalance).toBe(1);
  });

  it('extracts JSON from noisy stdout', () => {
    const { json, parseError } = parseStdoutJson('warn\n{"transactions":[]}\n');
    expect(parseError).toBeNull();
    expect(json).toEqual({ transactions: [] });
  });

  it('rejects traceback in stdout', () => {
    const { json, parseError } = parseStdoutJson('Traceback (most recent call last):\n');
    expect(json).toBeNull();
    expect(parseError).toBe('python_traceback_in_stdout');
  });

  it('rejects empty stdout', () => {
    const { json, parseError } = parseStdoutJson('');
    expect(json).toBeNull();
    expect(parseError).toBe('empty_stdout');
  });
});
