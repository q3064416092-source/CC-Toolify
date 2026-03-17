import { Request, Response } from "express";
import { appConfig } from "../config.js";
import { constantTimeEquals, signValue } from "../utils/crypto.js";

const COOKIE_NAME = "cc_toolify_session";

const parseCookie = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

const buildSessionValue = (): string => {
  const payload = `${Date.now()}`;
  const signature = signValue(payload, appConfig.appSecret);
  return `${payload}.${signature}`;
};

export const verifyAdminPassword = (candidate: string): boolean =>
  constantTimeEquals(candidate, appConfig.adminPassword);

export const issueSession = (response: Response): void => {
  const cookie = buildSessionValue();
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
  );
};

export const clearSession = (response: Response): void => {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );
};

export const isAuthenticated = (request: Request): boolean => {
  const session = parseCookie(request.headers.cookie, COOKIE_NAME);
  if (!session) {
    return false;
  }

  const parts = session.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;
  const expected = signValue(payload, appConfig.appSecret);
  return constantTimeEquals(signature, expected);
};
