/**
 * GitHub Actions entrypoint for the create-repository action.
 *
 * Reads inputs via @actions/core instead of CLI args/env vars, then delegates
 * to the same createRepository orchestrator used by the CLI (src/index.ts).
 *
 * Outputs:
 *   repo-url  - HTML URL of the created repository (e.g. https://github.com/org/repo)
 *   repo-name - Full name of the created repository (e.g. org/repo)
 *   repo-id   - Numeric ID of the created repository
 */

import * as core from '@actions/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RepoSettings, RulesetConfig } from './types.js';
import { createGitHubClient } from './github-client.js';
import { createRepository } from './create-repository.js';
import { repoDefaults, rulesetDefaults } from './repo-defaults.js';

/**
 * Loads and parses a JSON config override file.
 */
function loadConfigFile(configPath: string): { settings?: RepoSettings; rulesets?: RulesetConfig[] } {
	let raw: string;
	try {
		raw = readFileSync(configPath, 'utf8');
	} catch {
		throw new Error(`Cannot read config file: "${configPath}"`);
	}
	try {
		return JSON.parse(raw) as { settings?: RepoSettings; rulesets?: RulesetConfig[] };
	} catch {
		throw new Error(`Config file is not valid JSON: "${configPath}"`);
	}
}

async function run(): Promise<void> {
	const token = core.getInput('github-token', { required: true });
	const org = core.getInput('org', { required: true });
	const name = core.getInput('name', { required: true });
	const configInput = core.getInput('repo-config');
	const templateOwner = core.getInput('template-owner');
	const templateRepo = core.getInput('template-repo');
	const includeAllBranches = core.getBooleanInput('include-all-branches');
	const visibilityInput = core.getInput('visibility') as 'private' | 'internal' | 'public' | '';

	// Resolve config file path relative to the Actions workspace root
	const overrides = configInput ? loadConfigFile(resolve(process.env.GITHUB_WORKSPACE ?? '.', configInput)) : {};

	const settings: RepoSettings = { ...repoDefaults, ...overrides.settings };
	const rulesets: RulesetConfig[] = overrides.rulesets ?? rulesetDefaults;

	// Action inputs take precedence over config-file settings
	if (visibilityInput) {
		const allowed = ['private', 'internal', 'public'];
		if (!allowed.includes(visibilityInput)) {
			throw new Error(`Invalid visibility "${visibilityInput}". Must be one of: ${allowed.join(', ')}.`);
		}
		settings.visibility = visibilityInput;
	}

	// Action inputs take precedence over config-file template settings
	if (templateOwner || templateRepo) {
		if (!templateOwner || !templateRepo) {
			throw new Error('Both template-owner and template-repo inputs are required when using a template.');
		}
		settings.template = {
			owner: templateOwner,
			repo: templateRepo,
			includeAllBranches,
		};
	}

	const octokit = createGitHubClient(token);
	const repo = (await createRepository(octokit, { org, name, settings, rulesets })) as {
		html_url: string;
		full_name: string;
		id: number;
	};

	core.setOutput('repo-url', repo.html_url);
	core.setOutput('repo-name', repo.full_name);
	core.setOutput('repo-id', String(repo.id));
}

run().catch((err: Error) => {
	core.setFailed(err.message);
});
