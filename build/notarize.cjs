const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (! process.env.APPLE_ID || electronPlatformName !== "darwin"){
    console.log("Skipping notorizing");
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  await notarize({
    appBundleId: "com.wirebrowser.app",
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
};
