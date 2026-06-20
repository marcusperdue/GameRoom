const path = require("node:path");
const { notarize } = require("@electron/notarize");

function credentialsFor(appPath) {
  const {
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_API_ISSUER,
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_ID,
    APPLE_NOTARIZE_KEYCHAIN,
    APPLE_NOTARIZE_KEYCHAIN_PROFILE,
    APPLE_TEAM_ID,
  } = process.env;

  if (APPLE_NOTARIZE_KEYCHAIN_PROFILE) {
    return {
      appPath,
      keychainProfile: APPLE_NOTARIZE_KEYCHAIN_PROFILE,
      ...(APPLE_NOTARIZE_KEYCHAIN ? { keychain: APPLE_NOTARIZE_KEYCHAIN } : {}),
    };
  }

  if (APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER) {
    return {
      appPath,
      appleApiKey: APPLE_API_KEY,
      appleApiKeyId: APPLE_API_KEY_ID,
      appleApiIssuer: APPLE_API_ISSUER,
    };
  }

  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    return {
      appPath,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
      teamId: APPLE_TEAM_ID,
    };
  }

  return null;
}

exports.default = async function notarizeMac(context) {
  const { appOutDir, electronPlatformName, packager } = context;

  if (process.platform !== "darwin" || electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  const notarizeOptions = credentialsFor(appPath);

  if (!notarizeOptions) {
    console.log("Skipping macOS notarization: no Apple notarization credentials are configured.");
    return;
  }

  console.log(`Notarizing ${appPath}`);
  await notarize(notarizeOptions);
};
