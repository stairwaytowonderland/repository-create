# Contributing Guidelines

Thank you for contributing to the [Organization Name] [Repository Type] repository! This guide will help you understand
our workflow and best practices.

## Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/descriptive-name
```

Branch naming conventions:

- `feature/` - New documentation or materials
- `update/` - Updates to existing content
- `fix/` - Corrections or bug fixes
- `template/` - New or updated templates

### 2. Make Your Changes

- Work in the appropriate directory ([folder1], [folder2], etc.)
- Commit frequently with clear messages
- Keep related changes together in a single commit

### 3. Commit Messages

Use clear, descriptive commit messages:

```none
Good examples:
- "Add client presentation template"
- "Update project status for Q4 initiatives"
- "Fix typos in onboarding documentation"

Avoid:
- "Updates"
- "Changes"
- "Fix stuff"
```

### 4. Push and Create Pull Request

```bash
git push origin your-branch-name
```

Then create a pull request on GitHub with:

- A clear title summarizing the changes
- A description explaining what and why
- Links to any related issues

### 5. Code Review

- At least one team member should review your PR
- Address feedback promptly
- Use comments to discuss suggestions
- Once approved, merge your PR

## Development Guidelines

**Creating a *virtual environment* is <ins>highly recommended</ins>**

```bash
python3 -m venv path/to/venv # e.g. `python3 -m venv .venv`
. path/to/venv/bin/activate  # e.g. `. .venv/bin/activate`
```

> [!NOTE]
> Typically, *'path/to/venv'* is *'.venv'* in the current directory.
>
> Run `deactivate` to deactivate the *virtual environment*.

Please see the [official documentation](https://packaging.python.org/en/latest/tutorials/installing-packages/#optionally-create-a-virtual-environment)
for more information.

### Code Style Guidelines

- Ensure your code is well-commented and self-documenting.
- The project enforces code formatting through its [pre-commits](.pre-commit-config.yaml) configuration.
  Do **NOT** turn off this feature and make sure your `pre-commit run` command works successfully
  (see [below](#pre-commit) for more details).

#### `pre-commit`

This project uses [pre-commit](https://pre-commit.com/), a framework for managing and maintaining git hooks.
Pre-commit can be used to manage the hooks that run on every commit to automatically point out issues in code such as
missing semicolons, trailing whitespace, and debug statements. By using these hooks, you can ensure code quality and
prevent bad code from being uploaded.

To install `pre-commit`, you can use `pip`:

```bash
pip3 install pre-commit
```

After installation, you can set up your git hooks with this command at the root of this repository:

```bash
pre-commit install
```

This will add a pre-commit script to your `.git/hooks/` directory. This script will run whenever you run `git commit`.

For more details on how to configure and use pre-commit, please refer to the official documentation.

### Commit Message Guidelines

- Write clear, concise commit messages that follow the
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard.
- The allowed tags for this project are the following:

```json
[
  "build",
  "chore",
  "ci",
  "debug",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "remove",
  "style",
  "test"
]
```

## Content Guidelines

### Markdown Best Practices

- Use headers hierarchically (H1 → H2 → H3)
- Include a table of contents for longer documents
- Use code blocks with language specification: ```javascript
- Add alt text to images: `![Description](image.png)`
- Use relative links for internal references

### File Organization

- **[folder1]/**: [Description]
- **[folder2]/**: [Description]
- **[folder3]/**: [Description]
- **[folder4]/**: [Description]

### Naming Conventions

- Use lowercase with hyphens: `client-proposal-template.md`
- Be descriptive: `q4-2024-project-status.md` not `status.md`
- Include dates for time-sensitive materials: `2024-11-marketing-brief.md`

## What NOT to Commit

The `.gitignore` file prevents these from being committed:

- [File type 1] (.extension)
- [File type 2] (.extension)
- [File type 3] (.extension)
- [File type 4] (.extension)
- Large binary files

**[Important Note]**: [Any important notes, e.g., Final deliverables should be stored elsewhere].

## Review Checklist

Before submitting a PR, ensure:

- [ ] Content is well-organized and in the correct folder
- [ ] File names follow naming conventions
- [ ] Markdown is properly formatted
- [ ] Links work correctly
- [ ] No final deliverable files are included
- [ ] Commit messages are clear and descriptive
- [ ] PR description explains the changes

## Getting Help

- **[Question Label]**: Open an issue with the [question] label
- **[Suggestion Label]**: Open an issue with the [enhancement] label
- **[Problem Label]**: Open an issue with the [bug] label

## Release Flow

This project uses [semantic-release](https://semantic-release.gitbook.io/) with a trunk-based workflow.
Releases are triggered automatically on every push to `main` based on conventional commit messages.

```mermaid
flowchart TD
    A([Push to main]) --> B[release.yaml triggered]
    B --> C[Checkout full history<br>fetch-depth: 0]
    C --> D[npm ci]
    D --> E[npm run build<br>dist/index.cjs]
    E --> F[npx semantic-release]

    F --> G{Releasable<br>commits?}
    G -- "&nbsp;No&nbsp;" --> H([No release — exit])

    G -- "&nbsp;Yes&nbsp;" --> I[Determine next version<br>feat → minor · fix → patch<br>BREAKING CHANGE → major]
    I --> J[Generate release notes]
    J --> K[Update CHANGELOG.md]
    K --> L[Bump version in package.json]
    L --> M[Commit CHANGELOG.md +<br>package.json + dist/index.cjs<br>chore release: vX.Y.Z skip ci]
    M --> N[Create Git tag vX.Y.Z]
    N --> O[Base64-encode release notes<br>Dispatch publish.yaml<br>tag + notes-b64]
    O --> P([release.yaml done ✓])

    O --> Q([publish.yaml triggered])
    Q --> R[Decode notes-b64<br>release-notes.md]
    R --> S[gh release create<br>--notes-file release-notes.md]
    S --> T([GitHub release published ✓])
```

### Commit types and version bumps

| Commit prefix                  | Example                                   | Version bump |
| ------------------------------ | ----------------------------------------- | ------------ |
| `fix:`                         | `fix: handle missing README`              | Patch        |
| `feat:`                        | `feat: add template support`              | Minor        |
| `BREAKING CHANGE:`             | `feat!: rename --config to --repo-config` | Major        |
| `chore:`, `docs:`, `ci:`, etc. | `chore: update dependencies`              | No release   |

## License and Attribution

This project is licensed under the [MIT License](./LICENSE). By contributing, you agree that your contributions will be
licensed under the same terms.
