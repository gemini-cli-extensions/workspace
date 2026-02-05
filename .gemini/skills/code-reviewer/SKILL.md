---
name: code-reviewer
description:
  Use this skill to review code. It supports both local changes (staged or
  working tree) and remote Pull Requests (by ID or URL). It focuses on
  correctness, maintainability, and adherence to project standards.
---

# Code Reviewer

This skill guides the agent in conducting professional and thorough code reviews
for both local development and remote Pull Requests.

## Workflow

### 1. Determine Review Target

- **Remote PR**: If the user provides a PR number or URL (e.g., "Review PR
  #123"), target that remote PR.
- **Local Changes**: If no specific PR is mentioned, or if the user asks to
  "review my changes", target the current local file system states (staged and
  unstaged changes).

### 2. Preparation

#### For Remote PRs:

1.  **Checkout**: Use the GitHub CLI to checkout the PR.
    ```bash
    gh pr checkout <PR_NUMBER>
    ```
2.  **Verification**: Execute the workspace's verification suite to catch issues
    early. Capture the output of these commands to inform your review (e.g.,
    note any failed tests or linting errors).
    ```bash
    npm install
    npm run build
    npm run test
    npm run lint
    npm run format:check
    ```
3.  **Context**: Read the PR description and any existing comments to understand
    the goal and history.

#### For Local Changes:

1.  **Identify Changes**:
    - Check status: `git status`
    - Read diffs: `git diff` (working tree) and/or `git diff --staged` (staged).
2.  **Verification**: Ask the user if they want to run the verification suite
    before reviewing. If yes, run the same commands as for remote PRs.

### 3. In-Depth Analysis

Analyze the code changes based on the following pillars:

- **Correctness**: Does the code achieve its stated purpose without bugs or
  logical errors?
- **Maintainability**: Is the code clean, well-structured, and easy to
  understand and modify in the future? Consider factors like code clarity,
  modularity, and adherence to established design patterns.
- **Readability**: Is the code well-commented (where necessary) and consistently
  formatted according to our project's coding style guidelines?
- **Efficiency**: Are there any obvious performance bottlenecks or resource
  inefficiencies introduced by the changes?
- **Security**: Are there any potential security vulnerabilities or insecure
  coding practices?
- **Edge Cases and Error Handling**: Does the code appropriately handle edge
  cases and potential errors?
- **Testability**: Is the new or modified code adequately covered by tests (even
  if preflight checks pass)? Suggest additional test cases that would improve
  coverage or robustness.

### 4. Draft Feedback (DO NOT FIX)

**IMPORTANT**: You are a reviewer, NOT a fixer. Do NOT attempt to fix the code
yourself. Your goal is to provide high-quality feedback.

#### Structure

- **Summary**: A high-level overview of the review.
- **Verification Results**: briefly summarize the results of the build, test,
  lint, and format checks.
- **Findings**:
  - **Critical**: Bugs, security issues, test failures, lint errors, or breaking
    changes.
  - **Improvements**: Suggestions for better code quality or performance.
  - **Nitpicks**: Formatting or minor style issues (optional).
- **Conclusion**: Clear recommendation (Approved / Request Changes).

#### Tone

- Be constructive, professional, and friendly.
- Explain _why_ a change is requested.
- For approvals, acknowledge the specific value of the contribution.

### 5. Interactive Refinement

1.  **Present Draft**: Show the drafted review feedback to the user.
2.  **Solicit Input**: Ask the user for their thoughts.
    - "Does this feedback look accurate?"
    - "Is the tone appropriate?"
    - "Did I miss any context?"
3.  **Iterate**: If the user provides suggestions or corrections, update the
    draft feedback accordingly.
4.  **Finalize**: specific approval from the user is not strictly required if
    they don't have further comments, but ensure they have a chance to respond.

### 6. Cleanup (Remote PRs only)

- After the review is complete, ask the user if they want to switch back to the
  default branch (e.g., `main` or `master`).
