export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFound(message) {
  return new HttpError(404, message);
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function unauthorized(message) {
  return new HttpError(401, message);
}

export function forbidden(message) {
  return new HttpError(403, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}

export function badGateway(message) {
  return new HttpError(502, message);
}
