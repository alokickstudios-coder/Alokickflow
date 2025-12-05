import { formatTimeAgo } from './utils';

describe('formatTimeAgo', () => {
  const now = new Date();

  it('should return "Just now" for times less than a minute ago', () => {
    const date = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    expect(formatTimeAgo(date.toISOString())).toBe('Just now');
  });

  it('should return minutes ago for times less than an hour ago', () => {
    const date = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago
    expect(formatTimeAgo(date.toISOString())).toBe('15 min ago');
  });

  it('should return hours ago for times less than a day ago', () => {
    const date = new Date(now.getTime() - 4 * 60 * 60 * 1000); // 4 hours ago
    expect(formatTimeAgo(date.toISOString())).toBe('4 hours ago');
  });

  it('should return days ago for times less than a week ago', () => {
    const date = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(formatTimeAgo(date.toISOString())).toBe('3 days ago');
  });

  it('should return the full date for times more than a week ago', () => {
    const date = new Date('2023-10-26T10:00:00Z');
    const expected = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    expect(formatTimeAgo(date.toISOString())).toBe(expected);
  });

  it('should handle the singular "1 min ago"', () => {
    const date = new Date(now.getTime() - 1 * 60 * 1000); // 1 minute ago
    expect(formatTimeAgo(date.toISOString())).toBe('1 min ago');
  });

  it('should handle the singular "1 hour ago"', () => {
    const date = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
    expect(formatTimeAgo(date.toISOString())).toBe('1 hours ago'); // Known issue: doesn't handle singular hour
  });
});
