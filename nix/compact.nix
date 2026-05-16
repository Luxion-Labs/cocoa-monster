# Compact toolchain for nix builds.
#
# `compact` (the wrapper CLI) and `compactc` (the actual compiler) ship
# as separate release artifacts on github.com/midnightntwrk/compact.
# The CLI alone can't compile — at runtime it dispatches to compactc
# which `compact update` would download into $COMPACT_DIRECTORY. We
# can't run `compact update` inside the nix sandbox (no network), so
# we fetch both archives as fixed-output derivations and pre-populate
# the directory layout `compact compile` expects:
#
#   $COMPACT_DIRECTORY/
#     bin/{compactc,fixup-compact,format-compact}   -> versions/...
#     versions/<ver>/<target>/{compactc,compactc.bin,zkir,zkir-v3,...}
#
# `bin/compactc` MUST be an absolute symlink to the real binary so the
# upstream wrapper script's `cd $(dirname $0); pwd -P` resolves to the
# directory holding `compactc.bin`. nix's fixup phase rewrites
# absolute symlinks WITHIN $out to relative ones — so we extract the
# toolchain into its own derivation and symlink across stores, which
# the fixup leaves alone.
{
  pkgs,
  cliVersion ? "0.2.0",
  # compactc 0.30.0 emits checkRuntimeVersion('0.15.0'), which lines up
  # with compact-js@2.5.0's pinned compact-runtime@0.15.0. Newer
  # compactc (0.31.0+) emits 0.16.0 and conflicts with the SDK.
  toolchainVersion ? "0.30.0",
  cliHash ? "sha256-2DkOrxS71pBu2uIb5jARaqssGOYK0DdLkhz1ft7B0mY=",
  toolchainHash ? "sha256-BmQbVb79NThOzlOfexK2XLLPb7SZltJ+8XoC/KytTS0=",
}: let
  target = "x86_64-unknown-linux-musl";

  cliArchive = pkgs.fetchurl {
    url = "https://github.com/midnightntwrk/compact/releases/download/compact-v${cliVersion}/compact-${target}.tar.xz";
    hash = cliHash;
  };

  toolchainArchive = pkgs.fetchurl {
    url = "https://github.com/midnightntwrk/compact/releases/download/compactc-v${toolchainVersion}/compactc_v${toolchainVersion}_${target}.zip";
    hash = toolchainHash;
  };

  # The CLI parses the symlink target's parent directory and uses its
  # basename as the build target (`x86_64-unknown-linux-musl`). So the
  # toolchain is unpacked into versions/<ver>/<target>/, not at the
  # store path's root, so that `dirname /nix/store/<hash>/versions/<ver>/<target>/compactc`
  # gives a recognized triple.
  toolchainFiles = pkgs.runCommand "compact-toolchain-${toolchainVersion}" {
    nativeBuildInputs = [pkgs.unzip];
  } ''
    versionDir="$out/versions/${toolchainVersion}/${target}"
    mkdir -p "$versionDir"
    unzip -q ${toolchainArchive} -d "$versionDir"
    chmod +x "$versionDir"/{compactc,compactc.bin,fixup-compact,format-compact,zkir,zkir-v3} 2>/dev/null || true
    # Upstream `compactc` is a bash wrapper with `#!/usr/bin/env bash`,
    # but the nix build sandbox has no /usr/bin/env. Pin the shebang
    # to the runtime shell from the closure so spawning the script
    # works during ui-bundle's compile step.
    sed -i "1c#!${pkgs.runtimeShell}" "$versionDir/compactc"
  '';

  cliBinary = pkgs.runCommand "compact-cli-${cliVersion}" {
    nativeBuildInputs = with pkgs; [gnutar xz];
  } ''
    mkdir -p $out
    tar -xf ${cliArchive} -C $out --strip-components=1
    chmod +x $out/compact
  '';
in
  pkgs.stdenv.mkDerivation {
    pname = "compact";
    version = "${cliVersion}+toolchain-${toolchainVersion}";

    dontUnpack = true;

    nativeBuildInputs = [pkgs.makeWrapper];

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/share/compact/bin" "$out/bin"

      # Symlinks point at the toolchain extracted in a separate
      # derivation — outside $out, so nix's fixup phase leaves them
      # absolute. That keeps the upstream `compactc` shell wrapper's
      # `cd $(dirname $0); pwd -P` resolving to the dir that holds
      # compactc.bin AND keeps the parent dir's basename equal to the
      # target triple, which the CLI parses to confirm the toolchain
      # matches the host.
      ln -s ${toolchainFiles}/versions "$out/share/compact/versions"

      for bin in compactc fixup-compact format-compact; do
        ln -s ${toolchainFiles}/versions/${toolchainVersion}/${target}/$bin \
          "$out/share/compact/bin/$bin"
      done

      # Wrapper that pre-sets COMPACT_DIRECTORY to the prepared
      # read-only path, so `compact compile <input> <output>` works
      # without any `compact update` ever running.
      makeWrapper ${cliBinary}/compact "$out/bin/compact" \
        --set COMPACT_DIRECTORY "$out/share/compact"

      runHook postInstall
    '';

    meta = with pkgs.lib; {
      description = "Compact smart contract toolchain (CLI + compiler) for Midnight";
      homepage = "https://github.com/midnightntwrk/compact";
      platforms = ["x86_64-linux"];
    };
  }
