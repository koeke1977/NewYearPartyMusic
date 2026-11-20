import {
  constantTimeEqual, fromBase64Url, signPayload, toBase64Url,
} from "../security/crypto";
import {
  createSessionToken as createTokenPolicy,
  readSession as readTokenPolicy,
  type Session,
} from "../../modules/identity/session-token";

const sessionTokenCrypto = {
  toBase64Url,
  fromBase64Url,
  signPayload,
  constantTimeEqual,
};

export function createSessionToken(session: Session, secret: string): Promise<string> {
  return createTokenPolicy(session, secret, sessionTokenCrypto);
}

export function readSession(request: Request, secret: string) {
  return readTokenPolicy(request, secret, sessionTokenCrypto);
}
