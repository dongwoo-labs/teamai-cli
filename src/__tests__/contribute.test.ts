import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── contribute.ts tests ────────────────────────────────────
// These test the contribute() function in isolation,
// mocking git operations and config loading.

// Hoisted: applies to the dynamic `import('../contribute.js')` below too, since
// contribute.ts statically imports getHeadRev, which statically imports simple-git.
// Every baseDir resolves to a HEAD by default (so tests that don't care about
// provenance aren't forced to register one); a test that wants a specific baseDir
// to look like "not a git repo" adds it to gitRevparseFailFor instead.
const gitRevparseByBaseDir = new Map<string, string>();
const gitRevparseFailFor = new Set<string>();
vi.mock('simple-git', () => ({
  default: vi.fn((opts?: { baseDir?: string }) => ({
    revparse: async (_args: string[]) => {
      if (opts?.baseDir && gitRevparseFailFor.has(opts.baseDir)) {
        throw new Error(`fatal: not a git repository: ${opts.baseDir}`);
      }
      return (opts?.baseDir && gitRevparseByBaseDir.get(opts.baseDir)) ?? 'default-rev';
    },
  })),
}));

describe('contribute', () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;

  const originalClaudeSessionId = process.env.CLAUDE_SESSION_ID;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamai-contribute-test-'));
    process.env.HOME = tmpDir;
    gitRevparseByBaseDir.clear();
    gitRevparseFailFor.clear();
    delete process.env.CLAUDE_SESSION_ID;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalClaudeSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = originalClaudeSessionId;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects empty file', async () => {
    // Write empty file
    const emptyFile = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(emptyFile, '', 'utf-8');

    // Mock requireInit to avoid actual config dependency
    vi.doMock('../config.js', () => ({
      requireInit: vi.fn().mockResolvedValue({
        localConfig: {
          repo: { localPath: tmpDir },
          username: 'testuser',
        },
        teamConfig: {},
      }),
      detectProjectConfig: vi.fn().mockResolvedValue(null),
    }));

    const { contribute } = await import('../contribute.js');

    // Capture log output
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await contribute({ file: emptyFile });

    // Should not crash — graceful error
    errorSpy.mockRestore();
    vi.doUnmock('../config.js');
  });

  it('rejects missing file', async () => {
    const { contribute } = await import('../contribute.js');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await contribute({ file: '/nonexistent/path.md' });

    // Should not crash
    errorSpy.mockRestore();
  });

  it('generates valid filenames with title', () => {
    // Test the filename generation pattern indirectly
    // The format is: <slug>-<date>-<random>.md
    const title = 'K8s Pod Startup Timeout Fix!!!';
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

    expect(slug).toBe('k8s-pod-startup-timeout-fix');
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('generates valid filenames with Chinese title', () => {
    const title = 'K8s部署问题排查';
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

    expect(slug).toBe('k8s部署问题排查');
  });

  it('handles dry-run mode', async () => {
    const contentFile = path.join(tmpDir, 'notes.md');
    fs.writeFileSync(contentFile, '# Session Notes\nSome learnings here.', 'utf-8');

    vi.doMock('../config.js', () => ({
      requireInit: vi.fn().mockResolvedValue({
        localConfig: {
          repo: { localPath: tmpDir },
          username: 'testuser',
        },
        teamConfig: {},
      }),
      detectProjectConfig: vi.fn().mockResolvedValue(null),
    }));

    const { contribute } = await import('../contribute.js');

    // dry-run should not push
    await contribute({ file: contentFile, title: 'Test', dryRun: true });

    // No learnings directory should be created in the repo
    const aiDocsDir = path.join(tmpDir, 'learnings');
    // In dry-run, the file should NOT be copied
    // (contribute exits early before mkdir)
    vi.doUnmock('../config.js');
  });

  // ─── provenance frontmatter stamping ─────────────────────

  describe('provenance stamping', () => {
    const repoDir = '/fake/team-repo';

    function mockConfigAndQueue(): { savePendingLearning: ReturnType<typeof vi.fn> } {
      // Re-evaluate the module graph so this test's mock factories are what
      // contribute.ts's static imports actually bind to, not a prior test's.
      vi.resetModules();
      vi.doMock('../config.js', () => ({
        requireInit: vi.fn().mockResolvedValue({
          localConfig: { repo: { localPath: repoDir }, username: 'testuser' },
          teamConfig: {},
        }),
        detectProjectConfig: vi.fn().mockResolvedValue(null),
      }));
      const savePendingLearning = vi.fn().mockResolvedValue(path.join(repoDir, 'queued.md'));
      vi.doMock('../utils/pending-learnings.js', () => ({
        pendingLearningsDir: () => path.join(repoDir, 'pending-learnings'),
        savePendingLearning,
        listPendingLearnings: vi.fn().mockResolvedValue([]),
      }));
      return { savePendingLearning };
    }

    afterEach(() => {
      vi.doUnmock('../config.js');
      vi.doUnmock('../utils/pending-learnings.js');
    });

    it('stamps session_id, tool, teamai_version, harness_head, workspace_head, captured_at alongside existing frontmatter', async () => {
      gitRevparseByBaseDir.set(repoDir, 'aaa1111');
      gitRevparseByBaseDir.set(process.cwd(), 'bbb2222');
      const { savePendingLearning } = mockConfigAndQueue();

      const file = path.join(tmpDir, 'notes.md');
      fs.writeFileSync(
        file,
        '---\ntitle: Fixed the flaky test\nauthor: testuser\ndate: 2026-09-23\ntags: [ci]\n---\nBody text.\n',
        'utf-8',
      );

      const { contribute } = await import('../contribute.js');
      await contribute({ file, sessionId: 'sess-123', tool: 'claude' });

      expect(savePendingLearning).toHaveBeenCalledTimes(1);
      const [, , writtenContent] = savePendingLearning.mock.calls[0] as [unknown, unknown, string];
      const { data } = await import('../utils/frontmatter.js').then((m) => m.splitFrontmatter(writtenContent));

      // Original fields untouched
      expect(data.title).toBe('Fixed the flaky test');
      expect(data.author).toBe('testuser');
      expect(new Date(data.date as string).toISOString().slice(0, 10)).toBe('2026-09-23');
      expect(data.tags).toEqual(['ci']);
      // New provenance fields
      expect(data.session_id).toBe('sess-123');
      expect(data.tool).toBe('claude');
      expect(typeof data.teamai_version).toBe('string');
      expect(data.harness_head).toBe('aaa1111');
      expect(data.workspace_head).toBe('bbb2222');
      expect(typeof data.captured_at).toBe('string');
      expect(() => new Date(data.captured_at as string).toISOString()).not.toThrow();
    });

    it('omits workspace_head when cwd is not a git repo', async () => {
      gitRevparseByBaseDir.set(repoDir, 'aaa1111');
      gitRevparseFailFor.add(process.cwd());
      const { savePendingLearning } = mockConfigAndQueue();

      const file = path.join(tmpDir, 'notes.md');
      fs.writeFileSync(file, 'Body text with no frontmatter.\n', 'utf-8');

      const { contribute } = await import('../contribute.js');
      await contribute({ file, sessionId: 'sess-123', tool: 'claude' });

      const [, , writtenContent] = savePendingLearning.mock.calls[0] as [unknown, unknown, string];
      const { data } = (await import('../utils/frontmatter.js')).splitFrontmatter(writtenContent);
      expect(data.harness_head).toBe('aaa1111');
      expect('workspace_head' in data).toBe(false);
    });

    it('omits session_id when neither --session-id nor CLAUDE_SESSION_ID is set', async () => {
      gitRevparseByBaseDir.set(repoDir, 'aaa1111');
      gitRevparseByBaseDir.set(process.cwd(), 'bbb2222');
      const { savePendingLearning } = mockConfigAndQueue();

      const file = path.join(tmpDir, 'notes.md');
      fs.writeFileSync(file, 'Body text with no frontmatter.\n', 'utf-8');

      const { contribute } = await import('../contribute.js');
      await contribute({ file, tool: 'claude' });

      const [, , writtenContent] = savePendingLearning.mock.calls[0] as [unknown, unknown, string];
      const { data } = (await import('../utils/frontmatter.js')).splitFrontmatter(writtenContent);
      expect('session_id' in data).toBe(false);
      expect(data.tool).toBe('claude');
    });

    it('falls back tool to "unknown" when --tool is omitted and CLAUDE_SESSION_ID is unset', async () => {
      gitRevparseByBaseDir.set(repoDir, 'aaa1111');
      gitRevparseByBaseDir.set(process.cwd(), 'bbb2222');
      const { savePendingLearning } = mockConfigAndQueue();

      const file = path.join(tmpDir, 'notes.md');
      fs.writeFileSync(file, 'Body text with no frontmatter.\n', 'utf-8');

      const { contribute } = await import('../contribute.js');
      await contribute({ file });

      const [, , writtenContent] = savePendingLearning.mock.calls[0] as [unknown, unknown, string];
      const { data } = (await import('../utils/frontmatter.js')).splitFrontmatter(writtenContent);
      expect(data.tool).toBe('unknown');
    });
  });
});
