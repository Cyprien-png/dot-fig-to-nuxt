import {
  FigFormatError,
  ForbiddenPathError,
  InvalidCommitMessageError,
  NodeNotFoundError,
  NotBuiltError,
  ProjectConflictError,
  ProjectNotFoundError,
} from '@fig2nuxt/core'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class BadRequestError extends Error {}

const STATUS: [new (...args: never[]) => Error, ContentfulStatusCode][] = [
  [ProjectNotFoundError, 404],
  [NodeNotFoundError, 404],
  [ProjectConflictError, 409],
  [NotBuiltError, 409],
  [FigFormatError, 400],
  [BadRequestError, 400],
  [InvalidCommitMessageError, 400],
  [ForbiddenPathError, 403],
]

/** Maps domain errors to HTTP statuses; anything unknown is a server error. */
export function statusOf(error: unknown): ContentfulStatusCode {
  return STATUS.find(([type]) => error instanceof type)?.[1] ?? 500
}
