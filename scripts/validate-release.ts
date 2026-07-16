const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

export function validateReleaseRef(releaseRef: string, version: string) {
  const normalizedRef = releaseRef.trim();
  if (!normalizedRef) {
    throw new Error("Release ref is required");
  }

  const tag = normalizedRef.replace(/^refs\/tags\//, "");
  if (!tagPattern.test(tag)) {
    throw new Error(`Release ref must be a SemVer tag beginning with v: ${releaseRef}`);
  }

  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} does not match package.json version ${version}`);
  }

  return version;
}

if (import.meta.main) {
  const releaseRef = process.argv[2];
  if (!releaseRef) {
    throw new Error("Usage: bun scripts/validate-release.ts <vMAJOR.MINOR.PATCH>");
  }

  const packageJson = await Bun.file("package.json").json();
  const version = String(packageJson.version ?? "");

  console.log(validateReleaseRef(releaseRef, version));
}
