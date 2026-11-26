export const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'style', 'build', 'ci', 'chore', 'revert'] as const

const HEADER = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([a-z0-9][a-z0-9-./]*\\))?!?: \\S.*$`)
const MAX_LENGTH = 100

export class InvalidCommitMessageError extends Error {}

/** Throws unless `message` is a single-line Conventional Commits header. */
export function assertConventionalCommit(message: string): void {
  const problem = message.includes('\n')
    ? 'must be a single line'
    : message.length > MAX_LENGTH
      ? `must be at most ${MAX_LENGTH} characters`
      : !HEADER.test(message)
        ? `must look like "<type>(<scope>): <description>" with a type among ${COMMIT_TYPES.join(', ')}`
        : /[.\s]$/.test(message)
          ? 'must not end with a period or whitespace'
          : undefined
  if (problem) throw new InvalidCommitMessageError(`Commit message ${problem}: "${message}"`)
}
