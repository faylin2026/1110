# Repository Guidelines

## Project Structure

This is a newly initialized Git repository. The root contains this guide. Source code, tests, and assets have yet to be added. When introducing the first module, follow the chosen framework's standard layout and document the locations contributors will use. Add directories as they gain a purpose, and keep generated files out of Git by adding specific rules to `.gitignore`.

## Build, Test, and Development

The repository currently has no build, test, or local run commands. The first change that introduces tooling should include the prerequisites and exact commands to install dependencies, run the project, and verify changes from a fresh checkout. Until then, use `git status --short` to review changed and untracked files and `git diff --check` to catch whitespace errors in unstaged changes. After staging, use `git diff --cached --check` to check what will be committed.

## Coding Style and Testing

Use the chosen language or framework's naming and indentation conventions when introducing source files. If you add a formatter or linter, commit its configuration and document how to run it. Choose a test framework alongside the first behavior that needs automated verification. Follow that framework's test discovery conventions and cover the expected behavior and relevant failure cases. Set coverage requirements once the project has a test suite.

## Commits and Pull Requests

Until the project establishes its own convention, use short, imperative commit subjects, such as `Add contributor guide` or `新增協作指南`. Keep each commit focused on one change. In pull requests, summarize what changed and why, list the checks you ran, and link a related issue if one exists. Include screenshots when they help reviewers assess a visible change.
