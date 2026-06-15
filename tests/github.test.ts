import { describe, expect, it } from 'vitest';
import { parseGitHubRef, refLabel } from '@/core/github';
import { ReplicaxError } from '@/utils/errors';

describe('parseGitHubRef', () => {
  it('parses an owner/repo shorthand', () => {
    expect(parseGitHubRef('khanalsaroj/typegenctl')).toEqual({
      owner: 'khanalsaroj',
      repo: 'typegenctl',
    });
  });

  it('parses a full https URL, with or without .git', () => {
    const expected = { owner: 'khanalsaroj', repo: 'typegenctl' };
    expect(parseGitHubRef('https://github.com/khanalsaroj/typegenctl')).toEqual(expected);
    expect(parseGitHubRef('https://github.com/khanalsaroj/typegenctl.git')).toEqual(expected);
    expect(parseGitHubRef('github.com/khanalsaroj/typegenctl')).toEqual(expected);
  });

  it('parses a ref from a /tree/ URL', () => {
    expect(parseGitHubRef('https://github.com/khanalsaroj/typegenctl/tree/develop')).toEqual({
      owner: 'khanalsaroj',
      repo: 'typegenctl',
      ref: 'develop',
    });
  });

  it('keeps multi-segment branch names from /tree/ URLs', () => {
    expect(parseGitHubRef('https://github.com/o/r/tree/feature/new-thing')).toEqual({
      owner: 'o',
      repo: 'r',
      ref: 'feature/new-thing',
    });
  });

  it('parses #branch and @tag shorthands', () => {
    expect(parseGitHubRef('khanalsaroj/typegenctl#main')).toEqual({
      owner: 'khanalsaroj',
      repo: 'typegenctl',
      ref: 'main',
    });
    expect(parseGitHubRef('khanalsaroj/typegenctl@v1.2.3')).toEqual({
      owner: 'khanalsaroj',
      repo: 'typegenctl',
      ref: 'v1.2.3',
    });
  });

  it('parses an ssh-style remote', () => {
    expect(parseGitHubRef('git@github.com:khanalsaroj/typegenctl.git')).toEqual({
      owner: 'khanalsaroj',
      repo: 'typegenctl',
    });
  });

  it('rejects input without a repo', () => {
    expect(() => parseGitHubRef('khanalsaroj')).toThrow(ReplicaxError);
    expect(() => parseGitHubRef('')).toThrow(ReplicaxError);
  });

  it('rejects paths with unsafe characters', () => {
    expect(() => parseGitHubRef('../etc/passwd')).toThrow(ReplicaxError);
  });

  it('formats a label with the optional ref', () => {
    expect(refLabel({ owner: 'a', repo: 'b' })).toBe('a/b');
    expect(refLabel({ owner: 'a', repo: 'b', ref: 'main' })).toBe('a/b@main');
  });
});
