// NextAuth Session Verification for the Express backend.
//
// The frontend (Next.js) signs in users with NextAuth (credentials provider)
// and stores a JWT session cookie. This middleware verifies that cookie on
// every request so protected/scoped APIs know who the caller is.
//
// Supports both NextAuth v4 and Auth.js v5 token formats:
//   v4: cookie "next-auth.session-token" (or "__Secure-" prefix),
//       JWE "dir" + "A256GCM", key = HKDF-SHA256(secret, "", "NextAuth.js Generated Encryption Key", 32)
//   v5: cookie "authjs.session-token" (or "__Secure-" prefix),
//       JWE "dir" + "A256CBC-HS512", key = HKDF-SHA256(secret, salt=<cookie name>, "Auth.js Generated Encryption Key (<salt>)", 64)
//
// Requires NEXTAUTH_SECRET (or AUTH_SECRET) to hold the SAME value as the
// frontend's NEXTAUTH_SECRET — that is what makes the cookie verifiable.

import crypto from "crypto";
import { jwtDecrypt } from "jose";

const V4_SESSION_COOKIES = ["next-auth.session-token", "__Secure-next-auth.session-token"];
const V5_SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

let warnedAboutMissingSecret = false;

// Minimal cookie parser to avoid extra dependencies.
function parseCookies(cookieHeader) {
  const cookies = {};

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

// Decodes a NextAuth v4 session token (A256GCM, salt "").
async function decodeV4Token(token, secret) {
  const rawKey = crypto.hkdfSync(
    "sha256",
    secret,
    "",
    "NextAuth.js Generated Encryption Key",
    32
  );

  const { payload } = await jwtDecrypt(token, new Uint8Array(rawKey), {
    clockTolerance: 15,
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });

  return payload ?? null;
}

// Decodes an Auth.js v5 session token (A256CBC-HS512, salt = cookie name).
async function decodeV5Token(token, secret, salt) {
  const rawKey = crypto.hkdfSync(
    "sha256",
    secret,
    salt,
    `Auth.js Generated Encryption Key (${salt})`,
    64
  );

  const { payload } = await jwtDecrypt(token, new Uint8Array(rawKey), {
    clockTolerance: 15,
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256CBC-HS512", "A256GCM"],
  });

  return payload ?? null;
}

// Loads a session token cookie and verifies it.
//
// Also accepts the token via the "Authorization: Bearer <token>" header.
// On success attaches req.user = { email, name, image }, otherwise req.user stays null.
export async function attachUser(req, res, next) {
  req.user = null;

  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

  if (!secret) {
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      console.warn(
        "NEXTAUTH_SECRET is not set — authenticated endpoints will reject requests. " +
          "Add NEXTAUTH_SECRET (same value as the frontend) to the server .env."
      );
    }
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);

  let rawToken = null;
  let version = null;
  let salt = null;

  for (const name of V4_SESSION_COOKIES) {
    if (cookies[name]) {
      rawToken = cookies[name];
      version = "v4";
      break;
    }
  }

  if (!rawToken) {
    for (const name of V5_SESSION_COOKIES) {
      if (cookies[name]) {
        rawToken = cookies[name];
        version = "v5";
        salt = name;
        break;
      }
    }
  }

  // Fallback: Authorization header (e.g. server-side or non-cookie clients).
  if (!rawToken && typeof req.headers.authorization === "string") {
    const [scheme, value] = req.headers.authorization.split(" ");

    if (scheme === "Bearer" && value) {
      try {
        rawToken = decodeURIComponent(value);
      } catch {
        rawToken = value;
      }
      // Try both formats — the header does not reveal which version issued it.
      version = null;
    }
  }

  if (!rawToken) {
    return next();
  }

  try {
    let payload = null;

    if (version === "v4") {
      payload = await decodeV4Token(rawToken, secret);
    } else if (version === "v5") {
      payload = await decodeV5Token(rawToken, secret, salt);
    } else {
      // Unknown version: try v4 first, then v5.
      try {
        payload = await decodeV4Token(rawToken, secret);
      } catch {
        payload = await decodeV5Token(rawToken, secret, "authjs.session-token");
      }
    }

    if (payload && payload.email) {
      req.user = {
        email: payload.email,
        name: payload.name ?? null,
        image: payload.picture ?? null,
      };
    }
  } catch {
    // Invalid/expired token — treat as unauthenticated.
  }

  return next();
}

// Protects an endpoint: rejects requests without a verified session.
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized — please sign in",
    });
  }

  return next();
}
