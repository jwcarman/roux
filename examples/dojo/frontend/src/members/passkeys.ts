import { send } from "@jwcarman/roux-web/api";
import { decode, encode } from "./base64url";

interface CredentialDescriptorJson {
  id: string;
  type: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
}

interface CreationOptionsJson {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  excludeCredentials?: CredentialDescriptorJson[];
  [key: string]: unknown;
}

interface RequestOptionsJson {
  challenge: string;
  allowCredentials?: CredentialDescriptorJson[];
  [key: string]: unknown;
}

function descriptors(list: CredentialDescriptorJson[] | undefined): PublicKeyCredentialDescriptor[] {
  return (list ?? []).map((c) => ({ ...c, id: decode(c.id) }));
}

/** Registers a passkey for the signed-in caller. Resolves true when the server accepted it. */
export async function registerPasskey(label: string): Promise<boolean> {
  const optionsResponse = await send("POST", "/who/passkey/register/options");
  if (!optionsResponse.ok) {
    return false;
  }
  const options = (await optionsResponse.json()) as CreationOptionsJson;
  const publicKey = {
    ...options,
    challenge: decode(options.challenge),
    user: { ...options.user, id: decode(options.user.id) },
    excludeCredentials: descriptors(options.excludeCredentials),
  } as PublicKeyCredentialCreationOptions;

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (credential === null) {
    return false;
  }
  const response = credential.response as AuthenticatorAttestationResponse;
  const result = await send("POST", "/who/passkey/register", {
    publicKey: {
      credential: {
        id: credential.id,
        rawId: encode(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: encode(response.attestationObject),
          clientDataJSON: encode(response.clientDataJSON),
          transports: response.getTransports?.() ?? [],
        },
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment,
      },
      label,
    },
  });
  return result.ok;
}

/** Signs in with a passkey the browser holds. Resolves true on success. */
export async function signInWithPasskey(): Promise<boolean> {
  const optionsResponse = await send("POST", "/who/passkey/sign-in/options");
  if (!optionsResponse.ok) {
    return false;
  }
  const options = (await optionsResponse.json()) as RequestOptionsJson;
  const publicKey = {
    ...options,
    challenge: decode(options.challenge),
    allowCredentials: descriptors(options.allowCredentials),
  } as PublicKeyCredentialRequestOptions;

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (credential === null) {
    return false;
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  const result = await send("POST", "/who/passkey/sign-in", {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: encode(response.authenticatorData),
      clientDataJSON: encode(response.clientDataJSON),
      signature: encode(response.signature),
      userHandle: response.userHandle ? encode(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  });
  return result.ok;
}

export async function removePasskey(credentialId: string): Promise<boolean> {
  const result = await send("DELETE", `/who/passkey/register/${encodeURIComponent(credentialId)}`);
  return result.ok;
}
