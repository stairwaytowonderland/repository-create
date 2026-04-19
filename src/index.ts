/**
 * Entry point for the create-repository CLI.
 *
 * Usage:
 *   node src/index.ts --org <org> --name <repo-name> [options]
 *
 * Options:
 *   --org <name>               Target GitHub organization
 *   --name <name>              Repository name to create
 *   --repo-config <path>       Path to a JSON settings/rulesets override file
 *   --template-owner <owner>   Owner of the template repository
 *   --template-repo <repo>     Name of the template repository
 *   --include-all-branches     Copy all template branches (default: main only)
 *
 * Environment variables (see env.sample):
 *   GITHUB_TOKEN  - Personal Access Token with repo + admin:org scopes
 *   GITHUB_ORG    - Target organization (fallback when --org is not provided)
 *   REPO_NAME     - Repository name (fallback when --name is not provided)
 *   REPO_CONFIG   - Path to a JSON settings/rulesets override file (alternative to --repo-config)
 */

import { readFileSync } from 'node:fs';
import type { RepoSettings, RulesetConfig } from './types.js';
import { createGitHubClient } from './github-client.js';
import { createRepository } from './create-repository.js';
import { repoDefaults, rulesetDefaults } from './repo-defaults.js';

/**
 * Parses --key value pairs from process.argv.
 */
function parseArgs(argv: string[]): Record<string, string | true> {
	const args: Record<string, string | true> = {};
	for (let i = 2; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const key = argv[i].slice(2);
			const next = argv[i + 1];
			args[key] = next && !next.startsWith('--') ? argv[++i] : true;
		}
	}
	return args;
}

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

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	const org = args.org ?? process.env.GITHUB_ORG;
	const name = args.name ?? process.env.REPO_NAME;
	const token = process.env.GITHUB_TOKEN;

	if (!org) {
		throw new Error('Organization name is required. Use --org <name> or set GITHUB_ORG.');
	}
	if (!name) {
		throw new Error('Repository name is required. Use --name <name> or set REPO_NAME.');
	}
	if (!token) {
		throw new Error('GitHub token is required. Set the GITHUB_TOKEN environment variable.');
	}

	// Optional JSON config file to override defaults (flag takes precedence over env var)
	const configPath = args['repo-config'] ?? process.env.REPO_CONFIG;
	const overrides = configPath ? loadConfigFile(String(configPath)) : {};

	const settings: RepoSettings = { ...repoDefaults, ...overrides.settings };
	const rulesets: RulesetConfig[] = overrides.rulesets ?? rulesetDefaults;

	// CLI template flags take precedence over config-file template settings
	if (args['template-owner'] || args['template-repo']) {
		if (!args['template-owner'] || !args['template-repo']) {
			throw new Error('Both --template-owner and --template-repo are required when using a template.');
		}
		settings.template = {
			owner: String(args['template-owner']),
			repo: String(args['template-repo']),
			includeAllBranches: args['include-all-branches'] === true,
		};
	}

	const octokit = createGitHubClient(token);

	await createRepository(octokit, { org: String(org), name: String(name), settings, rulesets });
}

main().catch((err: Error) => {
	console.error(`\nError: ${err.message}`);
	process.exit(1);
});
