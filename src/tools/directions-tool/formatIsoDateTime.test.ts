import { formatIsoDateTime } from './formatIsoDateTime';

describe('formatIsoDateTime', () => {
  it('converts YYYY-MM-DDThh:mm:ss to YYYY-MM-DDThh:mm by removing seconds', () => {
    const input = '2025-06-05T10:30:45';
    const expected = '2025-06-05T10:30';

    expect(formatIsoDateTime(input)).toBe(expected);
  });

  it('leaves YYYY-MM-DDThh:mm:ssZ format unchanged', () => {
    const input = '2025-06-05T10:30:45Z';

    expect(formatIsoDateTime(input)).toBe(input);
  });

  it('leaves YYYY-MM-DDThh:mm:ss±hh:mm format unchanged', () => {
    const input = '2025-06-05T10:30:45+02:00';

    expect(formatIsoDateTime(input)).toBe(input);
  });

  it('leaves YYYY-MM-DDThh:mm format unchanged', () => {
    const input = '2025-06-05T10:30';

    expect(formatIsoDateTime(input)).toBe(input);
  });

  it('handles edge cases with zeros in seconds', () => {
    const input = '2025-06-05T10:30:00';
    const expected = '2025-06-05T10:30';

    expect(formatIsoDateTime(input)).toBe(expected);
  });
});
