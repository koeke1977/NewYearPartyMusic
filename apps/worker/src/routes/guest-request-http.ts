import type { GuestRequestErrorCode } from "../modules/requests/application/guest-request-lifecycle";

/** HTTP transport mapping for guest request application outcomes. */
export function guestRequestErrorStatus(code: GuestRequestErrorCode): 400 | 401 | 403 | 409 | 429 | 503 {
  switch (code) {
    case "not_configured":
    case "request_unavailable":
      return 503;
    case "invalid_guest_input":
    case "track_unavailable":
      return 400;
    case "invalid_event_code":
    case "guest_not_found":
      return 401;
    case "event_inactive":
    case "requests_paused":
      return 403;
    case "open_request_limit":
    case "request_rate_limit":
      return 429;
    case "duplicate_track":
      return 409;
  }
}
