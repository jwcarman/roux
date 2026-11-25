export type { ApiKey, ApiKeyCallerRefused, ApiKeyCannotManageKeys, ApiKeyRequest, ApiKeys, NewApiKey } from "./apiKeys";
export { createAuthClient, type SignInOptions, type SignInProvider, type AuthClient } from "./client";
export type {
  ConfirmAddressFailure,
  ConfirmedAddress,
  Email,
  EmailAddress,
  EmailAddresses,
  EmailSignInFailure,
  HumanCheckFailed,
  HumanCheckOptions,
  SignedIn,
} from "./email";
export type { AuthClientOptions } from "./http";
export type { CredentialCounts, Me, MyAccount } from "./me";
export type { Accounts, LinkedAccount, Oidc, PendingSignUp } from "./oidc";
export type { MyPasskeys, Passkey, Passkeys } from "./passkeys";
export {
  type AlreadyRegistered,
  type BrowserSessionRequired,
  type Cancelled,
  type InvalidRequest,
  type LastCredential,
  type PromptFailure,
  type SignInRequired,
  unwrap,
  AuthError,
  type AuthResult,
} from "./result";
export type { Session, Sessions } from "./sessions";
