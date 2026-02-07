# Release Process

This project uses GitHub Actions to automate the release process.

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated.
- Write permissions to the repository.

## Creating a Release

To streamline the release process:

1.  **Update Version**: Run the `set-version` script to update the version in
    `package.json` files. The `workspace-server` will now dynamically read its
    version from its `package.json`.

    ```bash
    npm run set-version <new-version> #0.0.x for example
    ```

2.  **Commit Changes**: Commit the version bump and push the changes to `main`
    (either directly or via a PR).

    ```bash
    git commit -am "chore: bump version to <new-version>"
    git push origin main
    ```

3.  **Create Release**: Use the `gh release create` command. This will trigger
    the GitHub Actions workflow to build the extension and attach the artifacts
    to the release.

    ```bash
    # Syntax: gh release create <tag> --generate-notes
    gh release create v<new-version> --generate-notes
    ```

### What happens next?

1.  **GitHub Actions Trigger**: The `release.yml` workflow is triggered by the
    new tag.
2.  **Build**: The workflow builds the project using `npm run build`.
3.  **Package**: It creates a `workspace-server.tar.gz` file containing the
    extension.
4.  **Upload**: The workflow uploads the tarball to the release you just
    created.

## Manual Release (Alternative)

If you prefer not to use the CLI, you can also push a tag manually:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This pushes the tag to GitHub, which triggers the release workflow to create a
release and upload the artifacts. However, using `gh release create` is
recommended as it allows you to easily generate release notes.
