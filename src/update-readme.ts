import type { Octokit } from 'octokit';
import type { GitHubFileContent } from './types.js';
import * as core from '@actions/core';

/**
 * Updates the first H1 heading in the repository's README to match the repo name.
 *
 * Uses GET /repos/{owner}/{repo}/contents/README.md to fetch the current content,
 * replaces the first `# ...` line, then commits it back via PUT.
 *
 * Note: GitHub populates template repository contents asynchronously after the
 * repo is created, so this function retries the README fetch until it appears.
 */
export async function updateReadmeHeading(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
): Promise<void> {
	core.info(`  Updating README heading to "${repo}"...`);

	const file = await fetchReadmeWithRetry(octokit, { owner, repo }, options);

	if (!file) {
		core.warning(`  ⚠ No README found after retries — skipping heading update.`);
		return;
	}

	if (file.type !== 'file' || !file.content) {
		core.warning(`  ⚠ README is not a regular file — skipping heading update.`);
		return;
	}

	const original = Buffer.from(file.content, 'base64').toString('utf8');

	// Replace only the first H1 line (# Title)
	const updated = original.replace(/^#\s+.+$/m, `# ${repo}`);

	if (updated === original) {
		core.warning(`  ⚠ No H1 heading found in README — skipping heading update.`);
		return;
	}

	await octokit.rest.repos.createOrUpdateFileContents({
		owner,
		repo,
		path: file.path,
		message: `chore(docs): rename README.md heading to ${repo} [skip ci]`,
		content: Buffer.from(updated).toString('base64'),
		sha: file.sha,
	});

	core.info(`  ✓ README heading updated.`);
}

/**
 * Retries fetching the README every 5 seconds for up to 100 seconds.
 * GitHub populates template contents asynchronously, so the file may not
 * exist immediately after createUsingTemplate resolves.
 */
async function fetchReadmeWithRetry(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
): Promise<GitHubFileContent | null> {
	const candidates = ['README.md', 'readme.md', 'Readme.md'];
	const maxAttempts = options?.maxRetries ?? 20;
	const delayMs = options?.retryDelayMs ?? 5000;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		for (const path of candidates) {
			try {
				const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
				return data as GitHubFileContent;
			} catch (err) {
				if ((err as { status?: number }).status !== 404) throw err;
			}
		}

		if (attempt < maxAttempts) {
			core.info(`  Waiting for template contents to be ready (attempt ${attempt}/${maxAttempts})...`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return null;
}
