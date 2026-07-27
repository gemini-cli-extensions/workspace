"""Synchronize pnpm-lock.yaml with package.json and commit changes.

This script forces pnpm to update the lockfile without respecting frozen-lockfile,
detects changes via git, and commits them back to the active branch if necessary.

Usage:
    python3 .github/scripts/fix_lockfile.py

Environment variables:
    GITHUB_ACTOR: GitHub username for git config (optional, defaults to 'github-actions[bot]')
    GITHUB_TOKEN: GitHub token for authentication (optional, used by git automatically)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def run_command(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Execute a command and return the completed process.

    Args:
        *args: Command and arguments to execute
        check: Whether to raise an exception on non-zero exit code

    Returns:
        CompletedProcess instance with stdout/stderr captured
    """
    return subprocess.run(
        args,
        cwd=ROOT,
        check=check,
        capture_output=True,
        text=True,
    )


def run_git(*args: str) -> str:
    """Execute a git command and return stdout.

    Args:
        *args: Git subcommand and arguments

    Returns:
        Stripped stdout from the git command
    """
    result = run_command("git", *args)
    return result.stdout.strip()


def configure_git_identity() -> None:
    """Configure git user identity for commits.

    Uses GITHUB_ACTOR environment variable if available,
    otherwise defaults to generic GitHub Actions bot identity.
    """
    actor = os.environ.get("GITHUB_ACTOR", "github-actions[bot]")
    email = f"{actor}@users.noreply.github.com" if actor != "github-actions[bot]" else "github-actions[bot]@users.noreply.github.com"

    run_command("git", "config", "user.name", actor)
    run_command("git", "config", "user.email", email)
    print(f"Configured git identity: {actor} <{email}>")


def sync_lockfile() -> None:
    """Run pnpm install without frozen-lockfile to update pnpm-lock.yaml.

    This forces pnpm to synchronize the lockfile with package.json,
    resolving any drift or outdated dependencies.
    """
    print("Running pnpm install --no-frozen-lockfile...")
    result = run_command("pnpm", "install", "--no-frozen-lockfile", check=False)

    if result.returncode != 0:
        print("ERROR: pnpm install failed", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    print("pnpm install completed successfully")


def has_lockfile_changes() -> bool:
    """Check if pnpm-lock.yaml has uncommitted changes.

    Returns:
        True if pnpm-lock.yaml has changes, False otherwise
    """
    status = run_git("status", "--porcelain", "pnpm-lock.yaml")
    return bool(status.strip())


def commit_and_push_lockfile() -> None:
    """Stage, commit, and push pnpm-lock.yaml changes to the current branch."""
    print("Detected changes to pnpm-lock.yaml")

    # Stage the lockfile
    run_command("git", "add", "pnpm-lock.yaml")
    print("Staged pnpm-lock.yaml")

    # Commit with semantic message
    commit_message = "build: sync lockfile via automated workflow"
    run_command("git", "commit", "-m", commit_message)
    print(f"Committed with message: {commit_message}")

    # Push to the current branch
    current_branch = run_git("rev-parse", "--abbrev-ref", "HEAD")
    print(f"Pushing to branch: {current_branch}")
    run_command("git", "push", "origin", f"HEAD:{current_branch}")
    print("Successfully pushed lockfile changes")


def main() -> None:
    """Main entry point for the lockfile synchronization script."""
    print("Starting lockfile synchronization...")
    print(f"Working directory: {ROOT}")

    # Ensure we're in a git repository
    if not (ROOT / ".git").exists():
        print("ERROR: Not a git repository", file=sys.stderr)
        sys.exit(1)

    # Configure git identity for commits
    configure_git_identity()

    # Sync the lockfile
    sync_lockfile()

    # Check for changes
    if has_lockfile_changes():
        commit_and_push_lockfile()
        print("\n✓ Lockfile synchronization complete with changes committed")
    else:
        print("\n✓ Lockfile is already in sync, no changes needed")


if __name__ == "__main__":
    main()
