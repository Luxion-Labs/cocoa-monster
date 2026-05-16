# Static UI bundle: cocoa.compact → contract bindings → vite build → dist/
#
# Built hermetically in the nix sandbox via buildNpmPackage:
#   1. fetchNpmDeps pulls every workspace dep into a separate FOD pinned
#      by `npmDepsHash`.
#   2. Pre-populate $HOME/.cache/midnight/zk-params/ with the BLS curve
#      params (zkir would otherwise hit S3 mid-build, which the
#      sandbox blocks).
#   3. The build phase compiles the Compact contract (compact CLI is on
#      PATH from `compact` in nativeBuildInputs), builds the contract TS
#      package, then runs vite build for the UI workspace.
#   4. Install copies ui/dist into $out — the docker image consumes that
#      as nginx's html root.
#
# CYPRESS_INSTALL_BINARY=0 skips cypress's postinstall download (network
# is sandbox-blocked anyway, and we don't run e2e here).
{
  pkgs,
  compact,
  zkParams,
  src,
  npmDepsHash,
}:
pkgs.buildNpmPackage {
  pname = "cocoa-monster-ui";
  version = "0.1.0";
  inherit src npmDepsHash;

  nativeBuildInputs = [pkgs.nodejs_22 compact];

  npmFlags = ["--legacy-peer-deps"];

  env = {
    CYPRESS_INSTALL_BINARY = "0";
    CYPRESS_RUN_BINARY = "/dev/null";
  };

  # buildNpmPackage's default build phase runs `npm run build` at the
  # top level — but cocoa-monster's root has no `build` script and the
  # compact compile step needs to run before either workspace builds.
  # Override the whole phase to walk through the workspaces in order.
  dontNpmBuild = true;

  preBuild = ''
    # zkir caches BLS curve params in $HOME/.cache/midnight/zk-params/
    # and would normally fetch them from S3 on first use; the sandbox
    # has no network, so seed the cache from the pre-fetched FODs.
    mkdir -p "$HOME/.cache/midnight/zk-params"
    install -m644 ${zkParams.bls_midnight_2p9}  "$HOME/.cache/midnight/zk-params/bls_midnight_2p9"
    install -m644 ${zkParams.bls_midnight_2p10} "$HOME/.cache/midnight/zk-params/bls_midnight_2p10"
    install -m644 ${zkParams.bls_midnight_2p13} "$HOME/.cache/midnight/zk-params/bls_midnight_2p13"
    install -m644 ${zkParams.bls_midnight_2p14} "$HOME/.cache/midnight/zk-params/bls_midnight_2p14"
    install -m644 ${zkParams.bls_midnight_2p16} "$HOME/.cache/midnight/zk-params/bls_midnight_2p16"
  '';

  buildPhase = ''
    runHook preBuild

    npm --workspace contract run compact
    npm --workspace contract run build
    npm --workspace ui run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r ui/dist/. $out/
    runHook postInstall
  '';
}
