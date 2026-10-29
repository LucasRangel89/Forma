// Only explicitly classified errors are safe to show to a user of the server API.
export class UserFacingError extends Error {}
